import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { deductCredits } from "../credits";
import { getSignupCreditsForNewOrg } from "../signupCredits";
import { env } from "../env";
import { canAction } from "../requestRole";
import { ensureSystemRoles, resolveEffectiveRole } from "../effectiveRole";
import { maybeEnqueueAutoTopUp } from "../autoTopup";
import { reassignUsersBeforeOrgDelete } from "../orgMembership";
import { DistanceUnitSchema, LanguageSchema, TimeFormatSchema } from "../types";

const OrgPoliciesSchema = z.object({
  deactivatePersonCredits: z.number().int().min(0).max(1_000_000),
});

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

// GET /api/org — get current org info + credit status
app.get("/org", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  if (!user.organizationId) return c.json({ error: { message: "No organization", code: "NO_ORG" } }, 404);

  const unlimitedEmails = [
    "tumsen@gmail.com",
    ...env.UNLIMITED_EMAILS.split(",").map(e => e.trim().toLowerCase()).filter(Boolean),
  ];
  if (unlimitedEmails.includes(user.email.toLowerCase())) {
    await prisma.organization.update({
      where: { id: user.organizationId },
      data: { unlimitedCredits: true, creditBalance: 999999999 },
    });
  }

  const credits = await deductCredits(user.organizationId);

  const activeUserCount = await prisma.organizationMembership.count({
    where: {
      organizationId: user.organizationId,
      user: { isActive: true },
    },
  });

  const origin =
    c.req.header("origin") || env.FRONTEND_URL || env.BACKEND_URL || "http://localhost:5173";
  await maybeEnqueueAutoTopUp(user.organizationId, origin);

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    include: { _count: { select: { users: true, memberships: true } } },
  });

  if (!org) {
    return c.json({ error: { message: "Organization not found", code: "NOT_FOUND" } }, 404);
  }

  const unlimited = Boolean(org.unlimitedCredits);
  const estimatedDaysRemaining = unlimited
    ? null
    : activeUserCount > 0
      ? Math.floor(credits.balance / activeUserCount)
      : credits.balance;

  return c.json({
    data: {
      ...org,
      ...credits,
      credits: credits.balance,
      userCount: activeUserCount,
      dailyCreditsUsed: activeUserCount,
      estimatedDaysRemaining,
      pendingAutoTopUpUrl: org.pendingAutoTopUpUrl ?? null,
      autoTopUpEnabled: org.autoTopUpEnabled ?? false,
      autoTopUpPackId: org.autoTopUpPackId ?? null,
      autoTopUpThreshold: org.autoTopUpThreshold ?? 30,
    },
  });
});

const BillingSettingsSchema = z.object({
  autoTopUpEnabled: z.boolean().optional(),
  autoTopUpPackId: z.string().min(1).nullable().optional(),
  autoTopUpThreshold: z.number().int().min(0).max(1_000_000).optional(),
});

// PATCH /api/org/policies
app.patch("/org/policies", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  if (!canAction(c, "org.policies")) {
    return c.json(
      { error: { message: "You do not have permission to change organization policies", code: "FORBIDDEN" } },
      403
    );
  }

  const body = OrgPoliciesSchema.parse(await c.req.json().catch(() => ({})));

  await prisma.organization.update({
    where: { id: user.organizationId },
    data: { deactivatePersonCredits: body.deactivatePersonCredits },
  });

  return c.json({ data: { ok: true } });
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

  const data: {
    autoTopUpEnabled?: boolean;
    autoTopUpPackId?: string | null;
    autoTopUpThreshold?: number;
  } = {};
  if (body.autoTopUpEnabled !== undefined) data.autoTopUpEnabled = body.autoTopUpEnabled;
  if (body.autoTopUpPackId !== undefined) data.autoTopUpPackId = body.autoTopUpPackId;
  if (body.autoTopUpThreshold !== undefined) data.autoTopUpThreshold = body.autoTopUpThreshold;

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
  invoiceName:    z.string().max(200).optional(),
  invoiceStreet:  z.string().max(200).optional(),
  invoiceNumber:  z.string().max(30).optional(),
  invoiceZip:     z.string().max(20).optional(),
  invoiceCity:    z.string().max(100).optional(),
  invoiceState:   z.string().max(100).optional(),
  invoiceCountry: z.string().max(100).optional(),
  invoiceVat:     z.string().max(60).optional(),
  invoiceEmail:   z.string().email().max(200).optional().or(z.literal("")),
  invoicePhone:   z.string().max(60).optional(),
  invoiceContact: z.string().max(200).optional(),
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

  const unlimitedEmails = [
    "tumsen@gmail.com",
    ...env.UNLIMITED_EMAILS.split(",").map(e => e.trim().toLowerCase()).filter(Boolean),
  ];
  const isUnlimited = unlimitedEmails.includes(user.email.toLowerCase());

  const signupCredits = await getSignupCreditsForNewOrg();

  const org = await prisma.organization.create({
    data: {
      name: name.trim(),
      ...(isUnlimited
        ? { unlimitedCredits: true, creditBalance: 999999999 }
        : { creditBalance: signupCredits }),
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
