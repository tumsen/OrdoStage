import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { deductCredits } from "../credits";
import { env } from "../env";
import { isOwner } from "../permissions";
import { ensureSystemRoles, resolveEffectiveRole } from "../effectiveRole";
import { maybeEnqueueAutoTopUp } from "../autoTopup";

const OrgPoliciesSchema = z.object({
  deactivatePersonCredits: z.number().int().min(0).max(1_000_000),
});

const app = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

// GET /api/me — current user role from DB (session may omit orgRole in the client)
app.get("/me", async (c) => {
  const sessionUser = c.get("user");
  if (!sessionUser?.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { orgRole: true, organizationId: true, isActive: true },
  });
  if (!dbUser) {
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  }
  const orgRole = dbUser.orgRole || "viewer";
  const isActive = dbUser.isActive;
  const eff = await resolveEffectiveRole(prisma, {
    organizationId: dbUser.organizationId,
    orgRole,
    isActive,
  });
  return c.json({
    data: {
      orgRole,
      canWrite: eff.canWrite,
      canManageTeam: eff.canManageTeam,
      hasOrganization: Boolean(dbUser.organizationId),
      isActive,
      views: eff.views,
      actions: eff.actions,
    },
  });
});

// GET /api/org — get current org info + credit status
app.get("/org", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  if (!user.organizationId) return c.json({ error: { message: "No organization", code: "NO_ORG" } }, 404);

  const unlimitedEmails = [
    "tumsen@gmail.com",
    "thomas@baggaardteatret.dk",
    ...env.UNLIMITED_EMAILS.split(",").map(e => e.trim().toLowerCase()).filter(Boolean),
  ];
  if (unlimitedEmails.includes(user.email.toLowerCase())) {
    await prisma.organization.update({
      where: { id: user.organizationId },
      data: { unlimitedCredits: true, creditBalance: 999999999 },
    });
  }

  const credits = await deductCredits(user.organizationId);

  const activeUserCount = await prisma.user.count({
    where: { organizationId: user.organizationId, isActive: true },
  });

  const origin =
    c.req.header("origin") || env.FRONTEND_URL || env.BACKEND_URL || "http://localhost:5173";
  await maybeEnqueueAutoTopUp(user.organizationId, origin);

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    include: { _count: { select: { users: true } } },
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

// PATCH /api/org/policies — owner only (credit cost to deactivate a person)
app.patch("/org/policies", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { orgRole: true },
  });
  if (!isOwner(dbUser?.orgRole || "")) {
    return c.json(
      { error: { message: "Only the owner can change organization policies", code: "FORBIDDEN" } },
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

// PATCH /api/org/billing-settings — owner only
app.patch("/org/billing-settings", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { orgRole: true },
  });
  if (!isOwner(dbUser?.orgRole || "")) {
    return c.json(
      { error: { message: "Only the owner can change billing settings", code: "FORBIDDEN" } },
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

// POST /api/org — create org (called after first login)
app.post("/org", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const body = await c.req.json();
  const { name } = z.object({ name: z.string().min(1) }).parse(body);

  // Check if user already has an org
  const existingUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (existingUser?.organizationId) {
    return c.json({ error: { message: "Already in an organization", code: "ALREADY_IN_ORG" } }, 400);
  }

  const unlimitedEmails = [
    "tumsen@gmail.com",
    "thomas@baggaardteatret.dk",
    ...env.UNLIMITED_EMAILS.split(",").map(e => e.trim().toLowerCase()).filter(Boolean),
  ];
  const isUnlimited = unlimitedEmails.includes(user.email.toLowerCase());

  const org = await prisma.organization.create({
    data: {
      name,
      users: { connect: { id: user.id } },
      ...(isUnlimited && { unlimitedCredits: true, creditBalance: 999999999 }),
    },
  });

  // Update user role to owner
  await prisma.user.update({ where: { id: user.id }, data: { orgRole: "owner" } });

  await ensureSystemRoles(prisma, org.id);

  return c.json({ data: org }, 201);
});

export default app;
