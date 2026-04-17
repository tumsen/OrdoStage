import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { adminMiddleware } from "../admin-middleware";
import { z } from "zod";

const app = new Hono<{
  Variables: { user: typeof auth.$Infer.Session.user | null };
}>();

// Apply admin middleware to all routes
app.use("/admin/*", adminMiddleware);

// ── Stats ──────────────────────────────────────────────────────────────────

app.get("/admin/stats", async (c) => {
  const [totalOrgs, totalUsers, totalRevenue, totalPeople, recentPurchases] =
    await Promise.all([
      prisma.organization.count(),
      prisma.user.count({ where: { organizationId: { not: null } } }),
      prisma.creditPurchase.aggregate({ _sum: { amountCents: true } }),
      prisma.person.count(),
      prisma.creditPurchase.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { organization: { select: { name: true } } },
      }),
    ]);

  return c.json({
    data: {
      totalOrgs,
      totalUsers,
      totalPeople,
      totalRevenueCents: totalRevenue._sum.amountCents || 0,
      recentPurchases,
    },
  });
});

// ── Organizations ──────────────────────────────────────────────────────────

app.get("/admin/orgs", async (c) => {
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { users: true, events: true, people: true } },
      creditPurchases: {
        select: { days: true, amountCents: true },
      },
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          orgRole: true,
          createdAt: true,
        },
      },
    },
  });
  return c.json({
    data: orgs.map((org) => ({
      ...org,
      totalPurchasedDays: org.creditPurchases.reduce((sum, purchase) => sum + purchase.days, 0),
      totalPurchasedCents: org.creditPurchases.reduce((sum, purchase) => sum + purchase.amountCents, 0),
    })),
  });
});

app.get("/admin/orgs/:id", async (c) => {
  const org = await prisma.organization.findUnique({
    where: { id: c.req.param("id") },
    include: {
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          orgRole: true,
          createdAt: true,
        },
      },
      creditLogs: { orderBy: { createdAt: "desc" }, take: 50 },
      creditPurchases: { orderBy: { createdAt: "desc" }, take: 20 },
      _count: { select: { events: true, venues: true, people: true } },
    },
  });
  if (!org)
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  return c.json({ data: org });
});

// ── Credit management ──────────────────────────────────────────────────────

app.put("/admin/orgs/:id/pricing", async (c) => {
  const body = await c.req.json();
  const { discountPercent, discountNote } = z
    .object({
      discountPercent: z.number().int().min(0).max(100),
      discountNote: z.string().optional(),
    })
    .parse(body);

  const org = await prisma.organization.findUnique({
    where: { id: c.req.param("id") },
  });
  if (!org)
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  const updated = await prisma.organization.update({
    where: { id: org.id },
    data: {
      discountPercent,
      discountNote: discountNote || null,
    },
  });

  return c.json({ data: updated });
});

// Add or remove credits manually
app.post("/admin/orgs/:id/credits", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { delta, note } = z
    .object({
      delta: z.number().int(), // positive = add, negative = remove
      note: z.string().optional(),
    })
    .parse(body);

  const org = await prisma.organization.findUnique({
    where: { id: c.req.param("id") },
  });
  if (!org)
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  const [updatedOrg] = await prisma.$transaction([
    prisma.organization.update({
      where: { id: org.id },
      data: { creditBalance: { increment: delta } },
    }),
    prisma.creditLog.create({
      data: {
        organizationId: org.id,
        delta,
        reason: delta > 0 ? "admin_grant" : "admin_remove",
        note: note || `Manual adjustment by admin`,
        adminUserId: user.id,
      },
    }),
  ]);

  return c.json({ data: updatedOrg });
});

// Give free trial
app.post("/admin/orgs/:id/free-trial", async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  const { days, note } = z
    .object({
      days: z.number().int().min(1).max(365),
      note: z.string().optional(),
    })
    .parse(body);

  const org = await prisma.organization.findUnique({
    where: { id: c.req.param("id") },
  });
  if (!org)
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  const [updatedOrg] = await prisma.$transaction([
    prisma.organization.update({
      where: { id: org.id },
      data: {
        creditBalance: { increment: days },
        freeTrialUsed: true,
      },
    }),
    prisma.creditLog.create({
      data: {
        organizationId: org.id,
        delta: days,
        reason: "free_trial",
        note: note || `Free trial: ${days} days`,
        adminUserId: user.id,
      },
    }),
  ]);

  return c.json({ data: updatedOrg });
});

// Set unlimited credits on an org
app.post("/admin/orgs/:id/unlimited", async (c) => {
  const body = await c.req.json();
  const { unlimited } = z
    .object({ unlimited: z.boolean() })
    .parse(body);

  const org = await prisma.organization.findUnique({
    where: { id: c.req.param("id") },
  });
  if (!org)
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  const updatedOrg = await prisma.organization.update({
    where: { id: org.id },
    data: { unlimitedCredits: unlimited },
  });

  return c.json({ data: updatedOrg });
});

// ── Price packs ────────────────────────────────────────────────────────────

app.get("/admin/packs", async (c) => {
  const packs = await prisma.pricePack.findMany({ orderBy: { days: "asc" } });
  return c.json({ data: packs });
});

app.post("/admin/packs", async (c) => {
  const body = await c.req.json();
  const { packId, days, amountCents, label, active } = z
    .object({
      packId: z
        .string()
        .regex(/^[a-zA-Z0-9_-]+$/)
        .optional(),
      days: z.number().int().min(1),
      amountCents: z.number().int().min(1),
      label: z.string().min(1),
      active: z.boolean().optional(),
    })
    .parse(body);

  const normalizedPackId = (packId && packId.trim().length > 0)
    ? packId.trim()
    : `pack_${days}_${Date.now()}`;

  const existing = await prisma.pricePack.findUnique({
    where: { packId: normalizedPackId },
  });
  if (existing) {
    return c.json(
      { error: { message: "Pack ID already exists", code: "CONFLICT" } },
      409
    );
  }

  const created = await prisma.pricePack.create({
    data: {
      packId: normalizedPackId,
      days,
      amountCents,
      label,
      active: active ?? true,
    },
  });

  return c.json({ data: created }, 201);
});

app.put("/admin/packs/:packId", async (c) => {
  const body = await c.req.json();
  const { amountCents, label, active } = z
    .object({
      amountCents: z.number().int().min(1).optional(),
      label: z.string().optional(),
      active: z.boolean().optional(),
    })
    .parse(body);

  const pack = await prisma.pricePack.update({
    where: { packId: c.req.param("packId") },
    data: {
      ...(amountCents !== undefined && { amountCents }),
      ...(label && { label }),
      ...(active !== undefined && { active }),
    },
  });
  return c.json({ data: pack });
});

// ── Users ──────────────────────────────────────────────────────────────────

app.get("/admin/users", async (c) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      organization: {
        select: { id: true, name: true, creditBalance: true },
      },
    },
  });
  return c.json({ data: users });
});

// ── Support access / impersonation ──────────────────────────────────────────

app.post("/admin/orgs/:id/support-access", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  const body = await c.req.json();
  const { mode, role } = z
    .object({
      mode: z.enum(["impersonate", "incognito"]).default("impersonate"),
      role: z.enum(["owner", "manager", "viewer"]).optional(),
    })
    .parse(body);

  const org = await prisma.organization.findUnique({
    where: { id: c.req.param("id") },
    select: { id: true },
  });
  if (!org) {
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  }

  const nextRole = mode === "incognito" ? "viewer" : (role ?? "owner");
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      organizationId: org.id,
      orgRole: nextRole,
    },
    select: {
      id: true,
      organizationId: true,
      orgRole: true,
    },
  });

  return c.json({
    data: {
      userId: updatedUser.id,
      organizationId: updatedUser.organizationId,
      orgRole: updatedUser.orgRole,
      mode,
    },
  });
});

export default app;
