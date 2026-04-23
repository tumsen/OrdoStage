import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { adminMiddleware } from "../admin-middleware";
import { isPostgresDatabaseUrl } from "../databaseUrl";
import { z } from "zod";
import { reassignUsersBeforeOrgDelete } from "../orgMembership";
import { ensureSystemRoles } from "../effectiveRole";
import { getSignupCreditsForNewOrg } from "../signupCredits";

const app = new Hono<{
  Variables: { user: typeof auth.$Infer.Session.user | null };
}>();
const PROTECTED_ADMIN_EMAILS = new Set(["tumsen@gmail.com"]);

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
      _count: { select: { users: true, memberships: true, events: true, people: true } },
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

app.post("/admin/orgs", async (c) => {
  const body = await c.req.json();
  const { name, ownerEmail } = z
    .object({
      name: z.string().min(1),
      ownerEmail: z.string().email().optional(),
    })
    .parse(body);

  const signupCredits = await getSignupCreditsForNewOrg();
  const created = await prisma.organization.create({
    data: {
      name: name.trim(),
      creditBalance: signupCredits,
    },
    select: { id: true, name: true, createdAt: true },
  });
  await ensureSystemRoles(prisma, created.id);

  let warning: string | null = null;
  let assignedOwner: { id: string; email: string; name: string | null } | null = null;
  if (ownerEmail) {
    const trimmed = ownerEmail.trim();
    const normalized = trimmed.toLowerCase();
    let target =
      (await prisma.user.findUnique({
        where: { email: normalized },
        select: { id: true, email: true, name: true, organizationId: true },
      })) ??
      (await prisma.user.findUnique({
        where: { email: trimmed },
        select: { id: true, email: true, name: true, organizationId: true },
      }));

    if (!target && isPostgresDatabaseUrl(process.env.DATABASE_URL)) {
      target = await prisma.user.findFirst({
        where: { email: { equals: trimmed, mode: "insensitive" } },
        select: { id: true, email: true, name: true, organizationId: true },
      });
    }

    if (!target) {
      warning = `Organization "${created.name}" was created, but no user found for owner email ${trimmed}.`;
      return c.json({ data: { organization: created, assignedOwner, warning } }, 201);
    }

    await prisma.organizationMembership.upsert({
      where: { userId_organizationId: { userId: target.id, organizationId: created.id } },
      create: { userId: target.id, organizationId: created.id, orgRole: "owner" },
      update: { orgRole: "owner" },
    });

    if (!target.organizationId) {
      await prisma.user.update({
        where: { id: target.id },
        data: { organizationId: created.id, orgRole: "owner" },
      });
    } else if (target.organizationId === created.id) {
      await prisma.user.update({
        where: { id: target.id },
        data: { orgRole: "owner" },
      });
    }

    assignedOwner = { id: target.id, email: target.email, name: target.name };
  }

  return c.json({ data: { organization: created, assignedOwner, warning } }, 201);
});

app.get("/admin/orgs/:id", async (c) => {
  const org = await prisma.organization.findUnique({
    where: { id: c.req.param("id") },
    include: {
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              createdAt: true,
            },
          },
        },
        orderBy: { user: { name: "asc" } },
      },
      creditLogs: { orderBy: { createdAt: "desc" }, take: 50 },
      creditPurchases: { orderBy: { createdAt: "desc" }, take: 20 },
      _count: { select: { events: true, venues: true, people: true } },
    },
  });
  if (!org)
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  const users = org.memberships.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
    orgRole: m.orgRole,
    createdAt: m.user.createdAt,
  }));

  const { memberships: _m, ...rest } = org;
  return c.json({ data: { ...rest, users } });
});

app.post("/admin/orgs/:id/grant-org-admin", async (c) => {
  const orgId = c.req.param("id");
  const body = await c.req.json();
  const { email } = z.object({ email: z.string().email() }).parse(body);
  const trimmed = email.trim();
  const normalized = trimmed.toLowerCase();

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true },
  });
  if (!org) {
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  }

  let target =
    (await prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, email: true, name: true, organizationId: true },
    })) ??
    (await prisma.user.findUnique({
      where: { email: trimmed },
      select: { id: true, email: true, name: true, organizationId: true },
    }));

  if (!target && isPostgresDatabaseUrl(process.env.DATABASE_URL)) {
    target = await prisma.user.findFirst({
      where: { email: { equals: trimmed, mode: "insensitive" } },
      select: { id: true, email: true, name: true, organizationId: true },
    });
  }
  if (!target) {
    return c.json(
      { error: { message: "No user found with that email address.", code: "NOT_FOUND" } },
      404
    );
  }

  await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: target.id, organizationId: org.id } },
    create: { userId: target.id, organizationId: org.id, orgRole: "owner" },
    update: { orgRole: "owner" },
  });

  if (!target.organizationId) {
    await prisma.user.update({
      where: { id: target.id },
      data: { organizationId: org.id, orgRole: "owner" },
    });
  } else if (target.organizationId === org.id) {
    await prisma.user.update({
      where: { id: target.id },
      data: { orgRole: "owner" },
    });
  }

  return c.json({
    data: {
      id: target.id,
      email: target.email,
      name: target.name,
      organizationId: org.id,
      organizationName: org.name,
      orgRole: "owner",
    },
  });
});

app.delete("/admin/orgs/:id", async (c) => {
  const id = c.req.param("id");
  const org = await prisma.organization.findUnique({ where: { id }, select: { id: true } });
  if (!org) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  await reassignUsersBeforeOrgDelete(prisma, id);
  await prisma.organization.delete({ where: { id } });
  return new Response(null, { status: 204 });
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
    data: unlimited
      ? { unlimitedCredits: true }
      : {
          unlimitedCredits: false,
          // Unlimited mode uses a sentinel balance; reset to zero when disabling.
          creditBalance: org.creditBalance === 999999999 ? 0 : org.creditBalance,
        },
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

  const segment = c.req.param("packId").trim();
  const existing = await prisma.pricePack.findFirst({
    where: { OR: [{ id: segment }, { packId: segment }] },
  });
  if (!existing) {
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  }

  const pack = await prisma.pricePack.update({
    where: { id: existing.id },
    data: {
      ...(amountCents !== undefined && { amountCents }),
      ...(label && { label }),
      ...(active !== undefined && { active }),
    },
  });
  return c.json({ data: pack });
});

app.delete("/admin/packs/:packId", async (c) => {
  const segment = c.req.param("packId").trim();
  const existing = await prisma.pricePack.findFirst({
    where: { OR: [{ id: segment }, { packId: segment }] },
  });

  // Use the provided slug for cleanup if we can't find the record (stale UI); otherwise, use canonical packId.
  const packIdForCleanup = existing?.packId ?? segment;

  try {
    await prisma.$transaction([
      prisma.organization.updateMany({
        where: { autoTopUpPackId: packIdForCleanup },
        data: {
          autoTopUpPackId: null,
          autoTopUpEnabled: false,
          pendingAutoTopUpUrl: null,
          pendingAutoTopUpCreatedAt: null,
        },
      }),
      // Delete by either primary key or packId slug to be robust against UI routing edge cases.
      prisma.pricePack.deleteMany({
        where: { OR: [{ id: segment }, { packId: segment }] },
      }),
    ]);
  } catch (err) {
    console.error("[admin] delete pack failed:", segment, err);
    const message = err instanceof Error ? err.message : "Failed to delete pack";
    return c.json({ error: { message, code: "DELETE_FAILED" } }, 500);
  }

  return c.json({ data: { ok: true } });
});

function mapAdminUserListRow(u: {
  id: string;
  name: string | null;
  email: string;
  isAdmin: boolean;
  createdAt: Date;
  orgRole: string;
  organization: { id: string; name: string } | null;
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    isAdmin: u.isAdmin,
    createdAt: u.createdAt,
    organizationMember: u.organization
      ? {
          role: u.orgRole,
          organization: u.organization,
        }
      : null,
  };
}

// ── Users ──────────────────────────────────────────────────────────────────

app.get("/admin/users", async (c) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      isAdmin: true,
      createdAt: true,
      orgRole: true,
      organization: {
        select: { id: true, name: true },
      },
    },
  });
  return c.json({
    data: users.map(mapAdminUserListRow),
  });
});

app.patch("/admin/users/:userId", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json();
  const { isAdmin: nextIsAdmin } = z.object({ isAdmin: z.boolean() }).parse(body);

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isAdmin: true },
  });
  if (!existing) {
    return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);
  }

  if (!nextIsAdmin && existing.isAdmin) {
    const adminCount = await prisma.user.count({ where: { isAdmin: true } });
    if (adminCount <= 1) {
      return c.json(
        { error: { message: "Cannot remove the last platform admin.", code: "LAST_ADMIN" } },
        400
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isAdmin: nextIsAdmin },
    select: {
      id: true,
      name: true,
      email: true,
      isAdmin: true,
      createdAt: true,
      orgRole: true,
      organization: { select: { id: true, name: true } },
    },
  });

  return c.json({ data: mapAdminUserListRow(updated) });
});

app.delete("/admin/users/:userId", async (c) => {
  const userId = c.req.param("userId");
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, isAdmin: true },
  });
  if (!existing) {
    return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);
  }

  if (PROTECTED_ADMIN_EMAILS.has(existing.email.toLowerCase())) {
    return c.json(
      { error: { message: "This protected admin user cannot be deleted.", code: "PROTECTED_USER" } },
      403
    );
  }

  if (existing.isAdmin) {
    const adminCount = await prisma.user.count({ where: { isAdmin: true } });
    if (adminCount <= 1) {
      return c.json(
        { error: { message: "Cannot delete the last platform admin.", code: "LAST_ADMIN" } },
        400
      );
    }
  }

  await prisma.user.delete({ where: { id: existing.id } });
  return new Response(null, { status: 204 });
});

app.post("/admin/users/grant-admin", async (c) => {
  const body = await c.req.json();
  const { email } = z.object({ email: z.string().email() }).parse(body);
  const trimmed = email.trim();
  const normalized = trimmed.toLowerCase();

  let target =
    (await prisma.user.findUnique({ where: { email: normalized }, select: { id: true } })) ??
    (await prisma.user.findUnique({ where: { email: trimmed }, select: { id: true } }));
  if (!target && isPostgresDatabaseUrl(process.env.DATABASE_URL)) {
    target = await prisma.user.findFirst({
      where: { email: { equals: trimmed, mode: "insensitive" } },
      select: { id: true },
    });
  }
  if (!target) {
    return c.json(
      { error: { message: "No user found with that email address.", code: "NOT_FOUND" } },
      404
    );
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { isAdmin: true },
    select: {
      id: true,
      name: true,
      email: true,
      isAdmin: true,
      createdAt: true,
      orgRole: true,
      organization: { select: { id: true, name: true } },
    },
  });

  return c.json({ data: mapAdminUserListRow(updated) }, 200);
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
