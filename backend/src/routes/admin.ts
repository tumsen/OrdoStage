import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { adminMiddleware } from "../admin-middleware";
import { isPostgresDatabaseUrl } from "../databaseUrl";
import { z } from "zod";
import { reassignUsersBeforeOrgDelete } from "../orgMembership";
import { ensureSystemRoles } from "../effectiveRole";
import { env, isDeployedRuntime } from "../env";
import { findUserByEmailLoose } from "../findUserByEmail";
import {
  estimateMonthlyOrgAmountCents,
  generateMonthlyInvoices,
  getCurrencyPriceMap,
  getBillingConfig,
  ensureCurrencyPriceMonthRollover,
  markInvoicePaid,
  recordDailyUsageSnapshot,
  SUPPORTED_BILLING_CURRENCIES,
} from "../postpaidBilling";
import { createPaddleCustomer, createPaddleTransactionForInvoice } from "../paddleClient";
import { AdminOrgEmailMembersBodySchema } from "../types";
import { sendHtmlEmail } from "../resendMail";

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
  const fallbackRate = currencyPrices.USD ?? 1500;
  const expectedIncomeByCurrencyCents: Record<string, number> = {};
  for (const currency of SUPPORTED_BILLING_CURRENCIES) expectedIncomeByCurrencyCents[currency] = 0;
  for (const org of orgs) {
    const currency = (org.billingCurrencyCode || "USD").toUpperCase();
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
  await ensureCurrencyPriceMonthRollover(prisma);
  const [cfg, currencyPrices, baseRow] = await Promise.all([
    getBillingConfig(prisma),
    prisma.billingCurrencyPrice.findMany(),
    prisma.$queryRaw<Array<{ baseCurrencyCode: string | null }>>`
      SELECT "baseCurrencyCode" FROM "BillingConfig" WHERE "id" = 'default' LIMIT 1
    `,
  ]);
  return c.json({
    data: {
      ...cfg,
      baseCurrencyCode: baseRow[0]?.baseCurrencyCode || "USD",
      currencyPrices: currencyPrices.map((p) => ({
        currencyCode: p.currencyCode,
        userDailyRateCents: p.userDailyRateCents,
        nextMonthUserDailyRateCents: p.nextMonthUserDailyRateCents,
      })),
      supportedCurrencies: [...SUPPORTED_BILLING_CURRENCIES],
    },
  });
});

app.get("/admin/billing/fx-rates", async (c) => {
  const base = (c.req.query("base") || "USD").toUpperCase();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return c.json(
        { error: { message: `FX rate lookup failed (${response.status}).`, code: "FX_LOOKUP_FAILED" } },
        502
      );
    }
    const json = (await response.json()) as {
      rates?: Record<string, number>;
      time_last_update_utc?: string;
    };
    if (!json.rates) {
      return c.json(
        { error: { message: "FX rate lookup returned no rates.", code: "FX_LOOKUP_EMPTY" } },
        502
      );
    }
    return c.json({
      data: {
        base,
        rates: json.rates,
        updatedAt: json.time_last_update_utc ?? null,
      },
    });
  } catch {
    return c.json(
      { error: { message: "FX rate lookup request failed.", code: "FX_LOOKUP_FAILED" } },
      502
    );
  } finally {
    clearTimeout(timeout);
  }
});

app.patch("/admin/billing/settings", async (c) => {
  const body = await c.req.json();
  const parsed = z
    .object({
      currencyPrices: z
        .array(
          z.object({
            currencyCode: z.string().length(3),
            userDailyRateCents: z.number().finite().min(1).max(10_000_000),
            nextMonthUserDailyRateCents: z.number().finite().min(1).max(10_000_000).nullable().optional(),
          })
        )
        .optional(),
      baseCurrencyCode: z.string().length(3).optional(),
      paymentDueDays: z.number().int().min(1).max(30).optional(),
    })
    .parse(body);

  await ensureCurrencyPriceMonthRollover(prisma);
  const cfg = await prisma.billingConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      paymentDueDays: parsed.paymentDueDays ?? 7,
    },
    update: {
      ...(parsed.paymentDueDays !== undefined ? { paymentDueDays: parsed.paymentDueDays } : {}),
    },
  });
  if (parsed.baseCurrencyCode !== undefined) {
    await prisma.$executeRaw`
      UPDATE "BillingConfig"
      SET "baseCurrencyCode" = ${parsed.baseCurrencyCode.toUpperCase()}
      WHERE "id" = 'default'
    `;
  }
  if (parsed.currencyPrices?.length) {
    await prisma.$transaction(
      parsed.currencyPrices.map((row) =>
        prisma.billingCurrencyPrice.upsert({
          where: { currencyCode: row.currencyCode.toUpperCase() },
          create: {
            currencyCode: row.currencyCode.toUpperCase(),
            userDailyRateCents: Math.max(1, Math.round(row.userDailyRateCents)),
            nextMonthUserDailyRateCents:
              row.nextMonthUserDailyRateCents != null ? Math.max(1, Math.round(row.nextMonthUserDailyRateCents)) : null,
          },
          update: {
            userDailyRateCents: Math.max(1, Math.round(row.userDailyRateCents)),
            ...(row.nextMonthUserDailyRateCents !== undefined
              ? {
                  nextMonthUserDailyRateCents:
                    row.nextMonthUserDailyRateCents != null ? Math.max(1, Math.round(row.nextMonthUserDailyRateCents)) : null,
                }
              : {}),
          },
        })
      )
    );
  }
  const [prices, baseRow] = await Promise.all([
    prisma.billingCurrencyPrice.findMany(),
    prisma.$queryRaw<Array<{ baseCurrencyCode: string | null }>>`
      SELECT "baseCurrencyCode" FROM "BillingConfig" WHERE "id" = 'default' LIMIT 1
    `,
  ]);
  return c.json({
    data: {
      ...cfg,
      baseCurrencyCode: baseRow[0]?.baseCurrencyCode || "USD",
      currencyPrices: prices.map((p) => ({
        currencyCode: p.currencyCode,
        userDailyRateCents: p.userDailyRateCents,
        nextMonthUserDailyRateCents: p.nextMonthUserDailyRateCents,
      })),
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

app.post("/admin/billing/invoices/:id/paddle-sync", async (c) => {
  const invoiceId = c.req.param("id");
  const invoice = await prisma.billingInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          paddleCustomerId: true,
          invoiceEmail: true,
        },
      },
    },
  });
  if (!invoice) {
    return c.json({ error: { message: "Invoice not found", code: "NOT_FOUND" } }, 404);
  }

  try {
    let paddleCustomerId = invoice.organization.paddleCustomerId;
    if (!paddleCustomerId) {
      const customer = await createPaddleCustomer({
        organizationId: invoice.organization.id,
        name: invoice.organization.name,
        email: invoice.organization.invoiceEmail,
      });
      paddleCustomerId = customer.id;
      await prisma.organization.update({
        where: { id: invoice.organization.id },
        data: { paddleCustomerId },
      });
    }

    const periodLabel = `${invoice.periodStart.toISOString().slice(0, 10)} to ${invoice.periodEnd.toISOString().slice(0, 10)}`;
    const transaction = await createPaddleTransactionForInvoice({
      customerId: paddleCustomerId,
      invoiceId: invoice.id,
      organizationName: invoice.organization.name,
      periodLabel,
      amountCents: invoice.totalCents,
      currencyCode: invoice.currency,
    });

    const updated = await prisma.billingInvoice.update({
      where: { id: invoice.id },
      data: {
        paddleTransactionId: transaction.id,
        paddleInvoiceId: transaction.invoice?.id ?? invoice.paddleInvoiceId,
        paddleInvoiceUrl: transaction.checkout?.url ?? invoice.paddleInvoiceUrl,
      },
      select: {
        id: true,
        paddleTransactionId: true,
        paddleInvoiceId: true,
        paddleInvoiceUrl: true,
      },
    });

    return c.json({ data: updated });
  } catch (error) {
    return c.json(
      {
        error: {
          message: error instanceof Error ? error.message : "Failed to sync invoice with Paddle.",
          code: "PADDLE_SYNC_FAILED",
        },
      },
      502
    );
  }
});

app.post("/admin/email/test", async (c) => {
  const body = await c.req.json();
  const { to } = z.object({ to: z.string().email() }).parse(body);

  if (!env.RESEND_API_KEY?.trim() || !env.FROM_EMAIL?.trim()) {
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

  try {
    await sendHtmlEmail({
      to,
      subject: "OrdoStage test email",
      html: `
      <p>This is a test email from <strong>OrdoStage Owner Admin</strong>.</p>
      <p>If you received this, your Resend setup works.</p>
      <p style="color:#666;font-size:12px">Sent at ${new Date().toISOString()}</p>
    `,
    });
  } catch (e) {
    console.error("[admin] email/test:", e);
    return c.json(
      {
        error: {
          message: e instanceof Error ? e.message : "Failed to send test email.",
          code: "EMAIL_SEND_FAILED",
        },
      },
      502
    );
  }

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
  const fallbackRate = currencyPrices.USD ?? 1500;
  const data = orgs.map((org) => {
    const currency = (org.billingCurrencyCode || "USD").toUpperCase();
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
              isActive: true,
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
    isActive: m.user.isActive,
  }));

  const currency = (org.billingCurrencyCode || "USD").toUpperCase();
  const now = new Date();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const fallbackRate = currencyPrices.USD ?? 1500;
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

function escapeHtmlForEmail(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

app.post("/admin/orgs/:id/email-members", async (c) => {
  const orgId = c.req.param("id");
  const raw = await c.req.json();
  const body = AdminOrgEmailMembersBodySchema.parse(raw);

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true },
  });
  if (!org) {
    return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  }

  const memberships = await prisma.organizationMembership.findMany({
    where: {
      organizationId: orgId,
      user: { isActive: true },
      ...(body.mode === "selected" ? { userId: { in: body.userIds } } : {}),
    },
    select: { userId: true, user: { select: { email: true } } },
  });

  if (body.mode === "selected") {
    const found = new Set(memberships.map((m) => m.userId));
    const missing = body.userIds!.filter((id) => !found.has(id));
    if (missing.length > 0) {
      return c.json(
        {
          error: {
            message: "Some selected users are not active members of this organization.",
            code: "BAD_REQUEST",
          },
        },
        400
      );
    }
  }

  const recipients = memberships.map((m) => m.user.email.trim()).filter(Boolean);
  if (recipients.length === 0) {
    return c.json({ error: { message: "No recipients to email.", code: "BAD_REQUEST" } }, 400);
  }

  const subject = body.subject.trim();
  const plain = body.body;
  const footer = `Sent by Ordo Stage regarding ${org.name}.`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">${escapeHtmlForEmail(plain).replace(/\r\n/g, "\n").replace(/\n/g, "<br/>")}</div><p style="color:#666;font-size:12px;margin-top:24px">${escapeHtmlForEmail(footer)}</p>`;

  if (!env.RESEND_API_KEY?.trim()) {
    if (isDeployedRuntime()) {
      return c.json(
        { error: { message: "Email is not configured (RESEND_API_KEY).", code: "SERVICE_UNAVAILABLE" } },
        503
      );
    }
    console.log(
      `[admin org email] dev skip — ${recipients.length} recipients subject=${subject.slice(0, 80)}`
    );
    return c.json({ data: { sent: 0, failed: 0, skipped: recipients.length, devPreview: true } });
  }

  let sent = 0;
  const failedEmails: string[] = [];
  for (const to of recipients) {
    try {
      await sendHtmlEmail({ to, subject, html, text: `${plain}\n\n${footer}` });
      sent++;
    } catch (e) {
      console.error("[admin org email] send failed", { to, err: e });
      failedEmails.push(to);
    }
  }

  return c.json({
    data: {
      sent,
      failed: failedEmails.length,
      ...(failedEmails.length > 0 ? { failedEmails: failedEmails.slice(0, 50) } : {}),
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
        ? { billingCurrencyCode: (parsed.billingCurrencyCode || "USD").toUpperCase() }
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
    where: { isAdmin: true },
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

  if (!existing.isAdmin) {
    return c.json(
      {
        error: {
          message:
            "Only platform admin accounts are managed here. Organization members are edited under Organizations.",
          code: "FORBIDDEN",
        },
      },
      403
    );
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

// ── Fix credential accounts (squash duplicate rows) ─────────────────────────

/** Shared logic: squash all credential Account rows for a user down to exactly one. */
async function squashCredentialRows(userId: string, userEmail: string) {
  const rows = await prisma.account.findMany({
    where: { userId, providerId: "credential" },
    orderBy: { updatedAt: "desc" },
  });

  if (rows.length === 0) {
    return { status: "no_rows" as const };
  }

  const hash = rows.find((r) => r.password != null && String(r.password).length > 0)?.password ?? null;
  if (!hash) {
    return { status: "no_hash" as const };
  }

  const { generateId } = await import("@better-auth/core/utils/id");
  const accountId = userEmail.trim().toLowerCase();

  await prisma.$transaction(async (tx) => {
    await tx.account.deleteMany({ where: { userId, providerId: "credential" } });
    await tx.account.create({
      data: { id: generateId(), userId, providerId: "credential", accountId, password: hash },
    });
  });

  console.info("[admin] fix-credential: squashed %d rows → 1 for userId=%s", rows.length, userId);
  return { status: "ok" as const, rowsBefore: rows.length, email: userEmail };
}

app.put("/admin/users/:userId/email", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json();
  const { email } = z.object({ email: z.string().email() }).parse(body);
  const newEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user) return c.json({ error: { message: "User not found.", code: "NOT_FOUND" } }, 404);

  const conflict = await prisma.user.findFirst({
    where: { email: { equals: newEmail, mode: "insensitive" }, NOT: { id: userId } },
    select: { id: true },
  });
  if (conflict) return c.json({ error: { message: "Another account already uses that email.", code: "CONFLICT" } }, 409);

  await prisma.user.update({ where: { id: userId }, data: { email: newEmail } });

  // Re-squash credential rows so accountId matches the new email
  const result = await squashCredentialRows(userId, newEmail);
  console.info("[admin] updated email for userId=%s: %s → %s (credential squash: %s)", userId, user.email, newEmail, result.status);

  return c.json({ data: { message: `Email updated to ${newEmail}. Sign in with the new address.` } });
});

app.post("/admin/users/:userId/fix-credential", async (c) => {
  const userId = c.req.param("userId");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
  if (!user) return c.json({ error: { message: "User not found.", code: "NOT_FOUND" } }, 404);

  const result = await squashCredentialRows(user.id, user.email);
  if (result.status === "no_rows") return c.json({ data: { message: "No credential accounts found.", rowsBefore: 0 } });
  if (result.status === "no_hash") return c.json({ error: { message: "No password hash found. User must reset their password first.", code: "NO_HASH" } }, 422);
  return c.json({ data: { message: `Fixed. Squashed ${result.rowsBefore} credential row(s) into 1 for ${result.email}.`, rowsBefore: result.rowsBefore } });
});

app.post("/admin/users/fix-credential", async (c) => {
  const body = await c.req.json();
  const { email } = z.object({ email: z.string().email() }).parse(body);

  const user = await findUserByEmailLoose(email);
  if (!user) return c.json({ error: { message: "No user found.", code: "NOT_FOUND" } }, 404);

  const result = await squashCredentialRows(user.id, user.email);
  if (result.status === "no_rows") return c.json({ data: { message: "No credential accounts found.", rowsBefore: 0 } });
  if (result.status === "no_hash") return c.json({ error: { message: "No password hash found. User must reset their password first.", code: "NO_HASH" } }, 422);
  return c.json({ data: { message: `Fixed. Squashed ${result.rowsBefore} credential row(s) into 1 for ${result.email}.`, rowsBefore: result.rowsBefore } });
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
