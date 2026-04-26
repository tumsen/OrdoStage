import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { canAction } from "../requestRole";
import { ensureSystemRoles, resolveEffectiveRole } from "../effectiveRole";
import { reassignUsersBeforeOrgDelete } from "../orgMembership";
import { DistanceUnitSchema, LanguageSchema, TimeFormatSchema } from "../types";
import {
  enforceOverdueAccess,
  estimateMonthlyOrgAmountCents,
  getBillingConfig,
  getCurrencyPriceMap,
  recordDailyUsageSnapshot,
} from "../postpaidBilling";

const app = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

const DEFAULT_LANGUAGE = "en" as const;
const DEFAULT_TIME_FORMAT = "24h" as const;
const DEFAULT_DISTANCE_UNIT = "km" as const;

const OrgPreferencesSchema = z.object({
  language: LanguageSchema,
  timeFormat: TimeFormatSchema,
  distanceUnit: DistanceUnitSchema,
});

const UserPreferencesPatchSchema = z.object({
  language: LanguageSchema.optional(),
  timeFormat: TimeFormatSchema.optional(),
  distanceUnit: DistanceUnitSchema.optional(),
});

// GET /api/me — current user role from DB (session may omit orgRole in the client)
app.get("/me", async (c) => {
  const sessionUser = c.get("user");
  if (!sessionUser?.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const [dbUser, membershipCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { orgRole: true, organizationId: true, isActive: true },
    }),
    prisma.organizationMembership.count({ where: { userId: sessionUser.id } }),
  ]);
  if (!dbUser) {
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  }
  const orgRole = dbUser.orgRole || "viewer";
  const isActive = dbUser.isActive;
  const eff = await resolveEffectiveRole(prisma, {
    organizationId: dbUser.organizationId,
    orgRole,
    isActive,
    userId: sessionUser.id,
  });
  const hasOrganization = membershipCount > 0 || Boolean(dbUser.organizationId);
  return c.json({
    data: {
      orgRole,
      canWrite: eff.canWrite,
      canManageTeam: eff.canManageTeam,
      hasOrganization,
      isActive,
      views: eff.views,
      actions: eff.actions,
    },
  });
});

// GET /api/preferences — effective locale/time/unit preferences for current user
app.get("/preferences", async (c) => {
  const sessionUser = c.get("user");
  if (!sessionUser?.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      organizationId: true,
      preferredLanguage: true,
      preferredTimeFormat: true,
      preferredDistanceUnit: true,
    },
  });
  if (!dbUser) {
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  }

  const orgDefaults = dbUser.organizationId
    ? await prisma.organization.findUnique({
        where: { id: dbUser.organizationId },
        select: {
          defaultLanguage: true,
          defaultTimeFormat: true,
          defaultDistanceUnit: true,
        },
      })
    : null;

  const defaults = {
    language: orgDefaults?.defaultLanguage ?? DEFAULT_LANGUAGE,
    timeFormat: orgDefaults?.defaultTimeFormat ?? DEFAULT_TIME_FORMAT,
    distanceUnit: orgDefaults?.defaultDistanceUnit ?? DEFAULT_DISTANCE_UNIT,
  };

  const userPreferences = {
    language: dbUser.preferredLanguage ?? defaults.language,
    timeFormat: dbUser.preferredTimeFormat ?? defaults.timeFormat,
    distanceUnit: dbUser.preferredDistanceUnit ?? defaults.distanceUnit,
  };

  return c.json({
    data: {
      organizationDefaults: defaults,
      userPreferences,
      effective: userPreferences,
    },
  });
});

// PATCH /api/preferences — update current user's preference overrides
app.patch("/preferences", async (c) => {
  const sessionUser = c.get("user");
  if (!sessionUser?.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  const body = UserPreferencesPatchSchema.parse(await c.req.json().catch(() => ({})));
  if (Object.keys(body).length === 0) {
    return c.json({ error: { message: "No changes", code: "BAD_REQUEST" } }, 400);
  }

  await prisma.user.update({
    where: { id: sessionUser.id },
    data: {
      preferredLanguage: body.language,
      preferredTimeFormat: body.timeFormat,
      preferredDistanceUnit: body.distanceUnit,
    },
  });

  return c.json({ data: { ok: true } });
});

// GET /api/org/memberships — organizations this user belongs to (no active org required)
app.get("/org/memberships", async (c) => {
  const user = c.get("user");
  if (!user?.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  const rows = await prisma.organizationMembership.findMany({
    where: { userId: user.id },
    include: { organization: { select: { id: true, name: true } } },
    orderBy: { organization: { name: "asc" } },
  });

  return c.json({
    data: rows.map((r) => ({
      organizationId: r.organizationId,
      name: r.organization.name,
      orgRole: r.orgRole,
    })),
  });
});

// POST /api/org/switch — set active organization (must be a member)
app.post("/org/switch", async (c) => {
  const user = c.get("user");
  if (!user?.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const { organizationId } = z.object({ organizationId: z.string().min(1) }).parse(body);

  const mem = await prisma.organizationMembership.findUnique({
    where: { userId_organizationId: { userId: user.id, organizationId } },
  });
  if (!mem) {
    return c.json(
      { error: { message: "You are not a member of that organization", code: "NOT_MEMBER" } },
      403
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { organizationId, orgRole: mem.orgRole },
  });

  return c.json({ data: { ok: true, organizationId, orgRole: mem.orgRole } });
});

// GET /api/org — get current org info + billing status
app.get("/org", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  if (!user.organizationId) return c.json({ error: { message: "No organization", code: "NO_ORG" } }, 404);

  const activeUserCount = await prisma.organizationMembership.count({
    where: {
      organizationId: user.organizationId,
      user: { isActive: true },
    },
  });

  await recordDailyUsageSnapshot(prisma);
  const viewOnly = await enforceOverdueAccess(prisma, user.organizationId);
  const [billingConfig, openInvoice, org, currencyPrices] = await Promise.all([
    getBillingConfig(prisma),
    prisma.billingInvoice.findFirst({
      where: { organizationId: user.organizationId, status: { in: ["issued", "overdue"] } },
      orderBy: { issuedAt: "desc" },
      include: { lines: true },
    }),
    prisma.organization.findUnique({
      where: { id: user.organizationId },
      include: { _count: { select: { users: true, memberships: true } } },
    }),
    getCurrencyPriceMap(prisma),
  ]);

  if (!org) {
    return c.json({ error: { message: "Organization not found", code: "NOT_FOUND" } }, 404);
  }

  const currency = (org.billingCurrencyCode || "USD").toUpperCase();
  const now = new Date();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const fallbackRate = currencyPrices.USD ?? 1500;
  const estimatedMonthlyCents = estimateMonthlyOrgAmountCents({
    activeUsers: activeUserCount,
    daysInMonth,
    userDailyRateCents: currencyPrices[currency] ?? fallbackRate,
    customDiscountPercent: org.customDiscountPercent,
    customFlatRateCents: org.customFlatRateCents,
    customFlatRateMaxUsers: org.customFlatRateMaxUsers,
  });

  return c.json({
    data: {
      ...org,
      userCount: activeUserCount,
      estimatedMonthlyCents,
      estimatedCurrencyCode: currency,
      isViewOnlyDueToBilling: viewOnly,
      billingStatus: org.billingStatus,
      paymentDueDays: billingConfig.paymentDueDays,
      openInvoice,
    },
  });
});

const BillingSettingsSchema = z.object({
  customDiscountPercent: z.number().int().min(0).max(100).nullable().optional(),
  customFlatRateCents: z.number().int().min(1).nullable().optional(),
  customFlatRateMaxUsers: z.number().int().min(1).nullable().optional(),
  billingCurrencyCode: z.string().length(3).nullable().optional(),
});

// PATCH /api/org/billing-settings
app.patch("/org/billing-settings", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  if (!canAction(c, "billing.manage")) {
    return c.json(
      { error: { message: "You do not have permission to change billing settings", code: "FORBIDDEN" } },
      403
    );
  }

  const body = BillingSettingsSchema.parse(await c.req.json().catch(() => ({})));
  const data = {
    ...(body.customDiscountPercent !== undefined ? { customDiscountPercent: body.customDiscountPercent } : {}),
    ...(body.customFlatRateCents !== undefined ? { customFlatRateCents: body.customFlatRateCents } : {}),
    ...(body.customFlatRateMaxUsers !== undefined ? { customFlatRateMaxUsers: body.customFlatRateMaxUsers } : {}),
    ...(body.billingCurrencyCode !== undefined
      ? { billingCurrencyCode: (body.billingCurrencyCode || "USD").toUpperCase() }
      : {}),
  };

  if (Object.keys(data).length === 0) {
    return c.json({ error: { message: "No changes", code: "BAD_REQUEST" } }, 400);
  }

  await prisma.organization.update({
    where: { id: user.organizationId },
    data,
  });

  return c.json({ data: { ok: true } });
});

// PATCH /api/org/preferences
app.patch("/org/preferences", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  if (!canAction(c, "org.update")) {
    return c.json(
      { error: { message: "You do not have permission to change organization defaults", code: "FORBIDDEN" } },
      403
    );
  }

  const body = OrgPreferencesSchema.parse(await c.req.json().catch(() => ({})));
  await prisma.organization.update({
    where: { id: user.organizationId },
    data: {
      defaultLanguage: body.language,
      defaultTimeFormat: body.timeFormat,
      defaultDistanceUnit: body.distanceUnit,
    },
  });

  return c.json({ data: { ok: true } });
});

// GET /api/org/invoice-info — fetch current org's invoice/company info (owner/manager)
app.get("/org/invoice-info", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: {
      name: true,
      invoiceName: true,
      invoiceStreet: true,
      invoiceNumber: true,
      invoiceZip: true,
      invoiceCity: true,
      invoiceState: true,
      invoiceCountry: true,
      invoiceVat: true,
      invoiceEmail: true,
      invoicePhone: true,
      invoiceContact: true,
      companyLogoUpdatedAt: true,
    },
  });
  if (!org) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  return c.json({
    data: {
      ...org,
      hasCompanyLogo: Boolean(org.companyLogoUpdatedAt),
    },
  });
});

const InvoiceInfoSchema = z.object({
  invoiceName: z.union([z.string().max(200), z.null()]).optional(),
  invoiceStreet: z.union([z.string().max(200), z.null()]).optional(),
  invoiceNumber: z.union([z.string().max(30), z.null()]).optional(),
  invoiceZip: z.union([z.string().max(20), z.null()]).optional(),
  invoiceCity: z.union([z.string().max(100), z.null()]).optional(),
  invoiceState: z.union([z.string().max(100), z.null()]).optional(),
  invoiceCountry: z.union([z.string().max(100), z.null()]).optional(),
  invoiceVat: z.union([z.string().max(60), z.null()]).optional(),
  invoiceEmail: z.union([z.string().email().max(200), z.literal(""), z.null()]).optional(),
  invoicePhone: z.union([z.string().max(60), z.null()]).optional(),
  invoiceContact: z.union([z.string().max(200), z.null()]).optional(),
});

// PATCH /api/org/invoice-info
app.patch("/org/invoice-info", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "billing.manage")) {
    return c.json(
      { error: { message: "You do not have permission to update invoice information", code: "FORBIDDEN" } },
      403
    );
  }
  const body = InvoiceInfoSchema.parse(await c.req.json().catch(() => ({})));
  const data: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(body)) {
    data[k] = v?.trim() || null;
  }
  await prisma.organization.update({ where: { id: user.organizationId }, data });
  return c.json({ data: { ok: true } });
});

// POST /api/org/company-logo — upload company logo (owner/billing manager)
app.post("/org/company-logo", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "billing.manage")) {
    return c.json(
      { error: { message: "You do not have permission to update company branding", code: "FORBIDDEN" } },
      403
    );
  }
  const formData = await c.req.parseBody();
  const file = formData["file"];
  if (!file || typeof file === "string") {
    return c.json({ error: { message: "Image file is required", code: "BAD_REQUEST" } }, 400);
  }
  const mime = (file as File).type || "application/octet-stream";
  if (!mime.startsWith("image/")) {
    return c.json({ error: { message: "Only image files are allowed", code: "BAD_REQUEST" } }, 400);
  }
  const buffer = Buffer.from(await (file as File).arrayBuffer());
  if (buffer.length > 2_000_000) {
    return c.json({ error: { message: "Logo must be 2MB or smaller", code: "BAD_REQUEST" } }, 400);
  }
  await prisma.organization.update({
    where: { id: user.organizationId },
    data: {
      companyLogoData: buffer,
      companyLogoMimeType: mime,
      companyLogoUpdatedAt: new Date(),
    },
  });
  return c.json({ data: { ok: true } }, 201);
});

// GET /api/org/company-logo — get company logo bytes (authenticated)
app.get("/org/company-logo", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { companyLogoData: true, companyLogoMimeType: true, companyLogoUpdatedAt: true },
  });
  if (!org?.companyLogoData) {
    return c.json({ error: { message: "Company logo not found", code: "NOT_FOUND" } }, 404);
  }
  return new Response(org.companyLogoData, {
    headers: {
      "Content-Type": org.companyLogoMimeType || "image/png",
      "Content-Disposition": "inline; filename=\"company-logo\"",
      "Cache-Control": org.companyLogoUpdatedAt ? "private, max-age=300" : "private, no-cache",
    },
  });
});

// DELETE /api/org/company-logo — remove company logo (owner/billing manager)
app.delete("/org/company-logo", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "billing.manage")) {
    return c.json(
      { error: { message: "You do not have permission to update company branding", code: "FORBIDDEN" } },
      403
    );
  }
  await prisma.organization.update({
    where: { id: user.organizationId },
    data: {
      companyLogoData: null,
      companyLogoMimeType: null,
      companyLogoUpdatedAt: null,
    },
  });
  return c.json({ data: { ok: true } });
});

// PATCH /api/org — rename organization
app.patch("/org", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  if (!canAction(c, "org.update")) {
    return c.json(
      { error: { message: "You do not have permission to rename the organization", code: "FORBIDDEN" } },
      403
    );
  }

  const { name } = z.object({ name: z.string().min(1).max(200) }).parse(await c.req.json().catch(() => ({})));

  await prisma.organization.update({
    where: { id: user.organizationId },
    data: { name: name.trim() },
  });

  return c.json({ data: { ok: true } });
});

// DELETE /api/org — type "DELETE <ORG NAME>" to confirm
app.delete("/org", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  if (!canAction(c, "org.delete")) {
    return c.json(
      { error: { message: "You do not have permission to delete the organization", code: "FORBIDDEN" } },
      403
    );
  }

  const body = await c.req.json().catch(() => ({} as { confirm?: string }));
  const confirm = typeof body.confirm === "string" ? body.confirm.trim() : "";

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { organizationId: true },
  });
  if (!dbUser?.organizationId) {
    return c.json(
      { error: { message: "Organization not found", code: "NOT_FOUND" } },
      404
    );
  }

  const orgId = dbUser.organizationId;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });
  if (!org) {
    return c.json({ error: { message: "Organization not found", code: "NOT_FOUND" } }, 404);
  }
  const expected = `DELETE ${org.name}`;
  if (confirm !== expected) {
    return c.json(
      {
        error: {
          message: `Send JSON body { "confirm": "${expected}" } to permanently delete this organization.`,
          code: "BAD_REQUEST",
        },
      },
      400
    );
  }

  await reassignUsersBeforeOrgDelete(prisma, orgId);
  await prisma.organization.delete({ where: { id: orgId } });

  return c.json({ data: { ok: true } });
});

// POST /api/org — create org (new workspace; user becomes owner and is switched into it)
app.post("/org", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const body = await c.req.json();
  const { name } = z.object({ name: z.string().min(1).max(200) }).parse(body);

  const org = await prisma.organization.create({
    data: {
      name: name.trim(),
    },
  });

  await prisma.organizationMembership.create({
    data: { userId: user.id, organizationId: org.id, orgRole: "owner" },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { organizationId: org.id, orgRole: "owner" },
  });

  await ensureSystemRoles(prisma, org.id);

  return c.json({ data: org }, 201);
});

export default app;
