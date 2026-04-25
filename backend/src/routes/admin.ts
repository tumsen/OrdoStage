import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { adminMiddleware } from "../admin-middleware";
import { isPostgresDatabaseUrl } from "../databaseUrl";
import { z } from "zod";
import { reassignUsersBeforeOrgDelete } from "../orgMembership";
import { ensureSystemRoles } from "../effectiveRole";
import { env } from "../env";
import {
  estimateMonthlyOrgAmountCents,
  generateMonthlyInvoices,
  getCurrencyPriceMap,
  getBillingConfig,
  markInvoicePaid,
  recordDailyUsageSnapshot,
  SUPPORTED_BILLING_CURRENCIES,
} from "../postpaidBilling";

const app = new Hono<{
  Variables: { user: typeof auth.$Infer.Session.user | null };
}>();
const PROTECTED_ADMIN_EMAILS = new Set(["tumsen@gmail.com"]);

// Apply admin middleware to all routes
app.use("/admin/*", adminMiddleware);

// ── Stats ──────────────────────────────────────────────────────────────────

app.get("/admin/stats", async (c) => {
  const [totalOrgs, totalUsers, totalRevenue, totalPeople, recentInvoices, openInvoices, orgs, currencyPrices] =
    await Promise.all([
      prisma.organization.count(),
      prisma.user.count({ where: { organizationId: { not: null } } }),
      prisma.billingInvoice.aggregate({ _sum: { totalCents: true }, where: { status: "paid" } }),
      prisma.person.count(),
      prisma.billingInvoice.findMany({
        orderBy: { issuedAt: "desc" },
        take: 10,
        include: { organization: { select: { name: true } }, lines: true },
      }),
      prisma.billingInvoice.count({ where: { status: { in: ["issued", "overdue"] } } }),
      prisma.organization.findMany({
        select: {
          id: true,
          billingCurrencyCode: true,
          customDiscountPercent: true,
          customFlatRateCents: true,
          customFlatRateMaxUsers: true,
          memberships: { where: { user: { isActive: true } }, select: { id: true } },
        },
      }),
      getCurrencyPriceMap(prisma),
    ]);
  const now = new Date();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const fallbackRate = currencyPrices.EUR ?? 1500;
  const expectedIncomeByCurrencyCents: Record<string, number> = {};
  for (const currency of SUPPORTED_BILLING_CURRENCIES) expectedIncomeByCurrencyCents[currency] = 0;
  for (const org of orgs) {
    const currency = (org.billingCurrencyCode || "EUR").toUpperCase();
    const estimate = estimateMonthlyOrgAmountCents({
      activeUsers: org.memberships.length,
      daysInMonth,
      userDailyRateCents: currencyPrices[currency] ?? fallbackRate,
      customDiscountPercent: org.customDiscountPercent,
      customFlatRateCents: org.customFlatRateCents,
      customFlatRateMaxUsers: org.customFlatRateMaxUsers,
    });
    expectedIncomeByCurrencyCents[currency] = (expectedIncomeByCurrencyCents[currency] ?? 0) + estimate;
  }

  return c.json({
    data: {
      totalOrgs,
      totalUsers,
      totalPeople,
      totalRevenueCents: totalRevenue._sum.totalCents || 0,
      recentInvoices,
      openInvoices,
      expectedIncomeByCurrencyCents,
    },
  });
});

app.get("/admin/billing/settings", async (c) => {
  const [cfg, currencyPrices] = await Promise.all([getBillingConfig(prisma), prisma.billingCurrencyPrice.findMany()]);
  return c.json({
    data: {
      ...cfg,
      currencyPrices: currencyPrices.map((p) => ({ currencyCode: p.currencyCode, userDailyRateCents: p.userDailyRateCents })),
      supportedCurrencies: [...SUPPORTED_BILLING_CURRENCIES],
    },
  });
});

app.patch("/admin/billing/settings", async (c) => {
  const body = await c.req.json();
  const parsed = z
    .object({
      currencyPrices: z
        .array(
          z.object({
            currencyCode: z.string().length(3),
            userDailyRateCents: z.number().int().min(1).max(10_000_000),
          })
        )
        .optional(),
      paymentDueDays: z.number().int().min(1).max(30).optional(),
    })
    .parse(body);

  const cfg = await prisma.billingConfig.upsert({
    where: { id: "default" },
    create: { id: "default", paymentDueDays: parsed.paymentDueDays ?? 7 },
    update: { ...(parsed.paymentDueDays !== undefined ? { paymentDueDays: parsed.paymentDueDays } : {}) },
  });
  if (parsed.currencyPrices?.length) {
    await prisma.$transaction(
      parsed.currencyPrices.map((row) =>
        prisma.billingCurrencyPrice.upsert({
          where: { currencyCode: row.currencyCode.toUpperCase() },
          create: { currencyCode: row.currencyCode.toUpperCase(), userDailyRateCents: row.userDailyRateCents },
          update: { userDailyRateCents: row.userDailyRateCents },
        })
      )
    );
  }
  const prices = await prisma.billingCurrencyPrice.findMany();
  return c.json({
    data: {
      ...cfg,
      currencyPrices: prices.map((p) => ({ currencyCode: p.currencyCode, userDailyRateCents: p.userDailyRateCents })),
      supportedCurrencies: [...SUPPORTED_BILLING_CURRENCIES],
    },
  });
});

app.post("/admin/billing/snapshot", async (c) => {
  const created = await recordDailyUsageSnapshot(prisma);
  return c.json({ data: { organizationsProcessed: created } });
});

app.post("/admin/billing/generate-invoices", async (c) => {
  const generated = await generateMonthlyInvoices(prisma, new Date());
  return c.json({ data: { generated } });
});

app.post("/admin/billing/invoices/:id/mark-paid", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const paddleInvoiceId = z.object({ paddleInvoiceId: z.string().optional() }).parse(body).paddleInvoiceId;
  await markInvoicePaid(prisma, c.req.param("id"), paddleInvoiceId);
  return c.json({ data: { ok: true } });
});

app.post("/admin/email/test", async (c) => {
  const body = await c.req.json();
  const { to } = z.object({ to: z.string().email() }).parse(body);

  if (!env.RESEND_API_KEY || !env.FROM_EMAIL) {
    return c.json(
      {
        error: {
          message: "Resend is not configured. Set RESEND_API_KEY and FROM_EMAIL on backend service.",
          code: "EMAIL_NOT_CONFIGURED",
        },
      },
      503
    );
  }

  const { Resend } = await import("resend");
  const resend = new Resend(env.RESEND_API_KEY);

  await resend.emails.send({
    from: env.FROM_EMAIL,
    to,
    subject: "OrdoStage test email",
    html: `
      <p>This is a test email from <strong>OrdoStage Owner Admin</strong>.</p>
      <p>If you received this, your Resend setup works.</p>
      <p style="color:#666;font-size:12px">Sent at ${new Date().toISOString()}</p>
    `,
  });

  return c.json({ data: { ok: true } });
});

// ── Organizations ──────────────────────────────────────────────────────────

app.get("/admin/orgs", async (c) => {
  const [orgs, currencyPrices] = await Promise.all([prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { users: true, memberships: true, events: true, people: true } },
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
  }), getCurrencyPriceMap(prisma)]);
  const now = new Date();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const fallbackRate = currencyPrices.EUR ?? 1500;
  const data = orgs.map((org) => {
    const currency = (org.billingCurrencyCode || "EUR").toUpperCase();
    const estimatedMonthlyCents = estimateMonthlyOrgAmountCents({
      activeUsers: org._count.memberships,
      daysInMonth,
      userDailyRateCents: currencyPrices[currency] ?? fallbackRate,
      customDiscountPercent: org.customDiscountPercent,
      customFlatRateCents: org.customFlatRateCents,
      customFlatRateMaxUsers: org.customFlatRateMaxUsers,
    });
    return { ...org, estimatedMonthlyCents, estimatedCurrencyCode: currency };
  });
  return c.json({ data });
});

app.post("/admin/orgs", async (c) => {
  const body = await c.req.json();
  const { name, ownerEmail } = z
    .object({
      name: z.string().min(1),
      ownerEmail: z.string().email().optional(),
    })
    .parse(body);

  const created = await prisma.organization.create({
    data: {
      name: name.trim(),
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
  const [org, currencyPrices] = await Promise.all([prisma.organization.findUnique({
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
      invoices: { orderBy: { issuedAt: "desc" }, take: 20, include: { lines: true } },
      _count: { select: { events: true, venues: true, people: true } },
    },
  }), getCurrencyPriceMap(prisma)]);
  if (!org)
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  const users = org.memberships.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
    orgRole: m.orgRole,
    createdAt: m.user.createdAt,
  }));

  const currency = (org.billingCurrencyCode || "EUR").toUpperCase();
  const now = new Date();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const fallbackRate = currencyPrices.EUR ?? 1500;
  const estimatedMonthlyCents = estimateMonthlyOrgAmountCents({
    activeUsers: org.memberships.length,
    daysInMonth,
    userDailyRateCents: currencyPrices[currency] ?? fallbackRate,
    customDiscountPercent: org.customDiscountPercent,
    customFlatRateCents: org.customFlatRateCents,
    customFlatRateMaxUsers: org.customFlatRateMaxUsers,
  });
  const { memberships: _m, ...rest } = org;
  return c.json({ data: { ...rest, users, estimatedMonthlyCents, estimatedCurrencyCode: currency } });
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
  const org = await prisma.organization.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!org) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  const body = await c.req.json().catch(() => ({} as { confirm?: string }));
  const confirm = typeof body.confirm === "string" ? body.confirm.trim() : "";
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

  await reassignUsersBeforeOrgDelete(prisma, id);
  await prisma.organization.delete({ where: { id } });
  return new Response(null, { status: 204 });
});

app.put("/admin/orgs/:id/billing-pricing", async (c) => {
  const body = await c.req.json();
  const parsed = z
    .object({
      customUserDailyRateCents: z.number().int().min(1).nullable().optional(),
      customDiscountPercent: z.number().int().min(0).max(100).nullable().optional(),
      customFlatRateCents: z.number().int().min(1).nullable().optional(),
      customFlatRateMaxUsers: z.number().int().min(1).nullable().optional(),
      billingCurrencyCode: z.string().length(3).nullable().optional(),
    })
    .parse(body);

  const org = await prisma.organization.findUnique({ where: { id: c.req.param("id") } });
  if (!org) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  const updated = await prisma.organization.update({
    where: { id: org.id },
    data: {
      ...(parsed.customDiscountPercent !== undefined ? { customDiscountPercent: parsed.customDiscountPercent } : {}),
      ...(parsed.customFlatRateCents !== undefined ? { customFlatRateCents: parsed.customFlatRateCents } : {}),
      ...(parsed.customFlatRateMaxUsers !== undefined ? { customFlatRateMaxUsers: parsed.customFlatRateMaxUsers } : {}),
      ...(parsed.billingCurrencyCode !== undefined
        ? { billingCurrencyCode: (parsed.billingCurrencyCode || "EUR").toUpperCase() }
        : {}),
    },
  });
  return c.json({ data: updated });
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
