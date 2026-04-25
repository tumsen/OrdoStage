import { PrismaClient } from "@prisma/client";

export type BillingConfigResolved = {
  paymentDueDays: number;
};

export const SUPPORTED_BILLING_CURRENCIES = [
  "USD",
  "EUR",
  "DKK",
  "SEK",
  "NOK",
  "GBP",
  "CHF",
  "PLN",
  "CZK",
  "HUF",
  "RON",
  "BGN",
  "HRK",
] as const;

export type SupportedBillingCurrency = (typeof SUPPORTED_BILLING_CURRENCIES)[number];

export type CurrencyPriceMap = Record<string, number>;

function currentUtcMonthKey(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfUtcMonthExclusive(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

export async function getBillingConfig(prisma: PrismaClient): Promise<BillingConfigResolved> {
  const cfg = await prisma.billingConfig.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
  return cfg;
}

export async function ensureCurrencyPriceMonthRollover(prisma: PrismaClient, now = new Date()): Promise<void> {
  const monthKey = currentUtcMonthKey(now);
  const cfg = await prisma.billingConfig.upsert({
    where: { id: "default" },
    create: { id: "default", priceRolloverMonthKey: monthKey },
    update: {},
    select: { id: true, priceRolloverMonthKey: true },
  });
  if (cfg.priceRolloverMonthKey === monthKey) return;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "BillingCurrencyPrice"
      SET
        "userDailyRateCents" = COALESCE("nextMonthUserDailyRateCents", "userDailyRateCents"),
        "nextMonthUserDailyRateCents" = NULL
      WHERE "nextMonthUserDailyRateCents" IS NOT NULL
    `;
    await tx.billingConfig.update({
      where: { id: "default" },
      data: { priceRolloverMonthKey: monthKey },
    });
  });
}

export async function getCurrencyPriceMap(prisma: PrismaClient): Promise<CurrencyPriceMap> {
  await ensureCurrencyPriceMonthRollover(prisma);
  const rows = await prisma.billingCurrencyPrice.findMany();
  const map: CurrencyPriceMap = {};
  for (const currency of SUPPORTED_BILLING_CURRENCIES) {
    map[currency] = 1500;
  }
  for (const row of rows) {
    map[row.currencyCode.toUpperCase()] = row.userDailyRateCents;
  }
  return map;
}

export function estimateMonthlyOrgAmountCents(input: {
  activeUsers: number;
  daysInMonth: number;
  userDailyRateCents: number;
  customDiscountPercent: number | null;
  customFlatRateCents: number | null;
  customFlatRateMaxUsers: number | null;
}): number {
  const subtotal = input.activeUsers * input.daysInMonth * input.userDailyRateCents;
  const discountPercent = Math.min(Math.max(input.customDiscountPercent ?? 0, 0), 100);
  const flatRateApplicable =
    input.customFlatRateCents != null &&
    input.customFlatRateMaxUsers != null &&
    input.customFlatRateMaxUsers > 0 &&
    input.activeUsers <= input.customFlatRateMaxUsers;
  if (flatRateApplicable) return input.customFlatRateCents!;
  const discountCents = Math.round((subtotal * discountPercent) / 100);
  return Math.max(subtotal - discountCents, 0);
}

export async function recordDailyUsageSnapshot(prisma: PrismaClient, today = new Date()): Promise<number> {
  const currencyPrices = await getCurrencyPriceMap(prisma);
  const fallbackRate = currencyPrices.USD ?? 1500;
  const snapshotDate = startOfUtcDay(today);
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      billingCurrencyCode: true,
    },
  });

  let created = 0;
  for (const org of orgs) {
    const activeUsers = await prisma.organizationMembership.count({
      where: {
        organizationId: org.id,
        user: { isActive: true },
      },
    });
    await prisma.billingUsageSnapshot.upsert({
      where: { organizationId_snapshotDate: { organizationId: org.id, snapshotDate } },
      create: {
        organizationId: org.id,
        snapshotDate,
        activeUsers,
        userDailyRateCents: currencyPrices[(org.billingCurrencyCode || "USD").toUpperCase()] ?? fallbackRate,
        currencyCode: (org.billingCurrencyCode || "USD").toUpperCase(),
      },
      update: {
        activeUsers,
        userDailyRateCents: currencyPrices[(org.billingCurrencyCode || "USD").toUpperCase()] ?? fallbackRate,
        currencyCode: (org.billingCurrencyCode || "USD").toUpperCase(),
      },
    });
    created += 1;
  }
  return created;
}

export async function enforceOverdueAccess(prisma: PrismaClient, organizationId: string): Promise<boolean> {
  const now = new Date();
  const overdueInvoice = await prisma.billingInvoice.findFirst({
    where: {
      organizationId,
      status: { in: ["issued", "overdue"] },
      dueAt: { lt: now },
    },
    orderBy: { dueAt: "asc" },
  });
  if (!overdueInvoice) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        billingStatus: "active",
        billingViewOnlySince: null,
      },
    });
    return false;
  }

  await prisma.$transaction([
    prisma.billingInvoice.update({
      where: { id: overdueInvoice.id },
      data: { status: "overdue" },
    }),
    prisma.organization.update({
      where: { id: organizationId },
      data: {
        billingStatus: "overdue_view_only",
        billingDueAt: overdueInvoice.dueAt,
        billingViewOnlySince: now,
      },
    }),
  ]);
  return true;
}

export async function markInvoicePaid(
  prisma: PrismaClient,
  invoiceId: string,
  paddleInvoiceId?: string | null
): Promise<void> {
  const paidAt = new Date();
  const invoice = await prisma.billingInvoice.update({
    where: { id: invoiceId },
    data: {
      status: "paid",
      paidAt,
      paddleInvoiceId: paddleInvoiceId ?? undefined,
    },
    select: { organizationId: true },
  });
  await prisma.organization.update({
    where: { id: invoice.organizationId },
    data: {
      billingStatus: "active",
      billingDueAt: null,
      billingViewOnlySince: null,
    },
  });
}

export async function generateMonthlyInvoices(prisma: PrismaClient, runAt = new Date()): Promise<number> {
  const cfg = await getBillingConfig(prisma);
  const currencyPrices = await getCurrencyPriceMap(prisma);
  const fallbackRate = currencyPrices.USD ?? 1500;
  const currentMonthStart = startOfUtcMonth(runAt);
  const targetMonthEnd = currentMonthStart;
  const targetMonthStart = startOfUtcMonth(new Date(Date.UTC(runAt.getUTCFullYear(), runAt.getUTCMonth() - 1, 1)));
  const dueAt = new Date(currentMonthStart.getTime() + cfg.paymentDueDays * 24 * 60 * 60 * 1000);

  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      billingCurrencyCode: true,
      customDiscountPercent: true,
      customFlatRateCents: true,
      customFlatRateMaxUsers: true,
    },
  });

  let generated = 0;
  for (const org of orgs) {
    const existing = await prisma.billingInvoice.findFirst({
      where: { organizationId: org.id, periodStart: targetMonthStart, periodEnd: targetMonthEnd },
      select: { id: true },
    });
    if (existing) continue;

    const snapshots = await prisma.billingUsageSnapshot.findMany({
      where: {
        organizationId: org.id,
        snapshotDate: { gte: targetMonthStart, lt: targetMonthEnd },
      },
      orderBy: { snapshotDate: "asc" },
    });
    if (snapshots.length === 0) continue;
    const currency = (org.billingCurrencyCode || "USD").toUpperCase();

    const daysByUser: Map<string, { name: string; email: string; days: number; rate: number }> = new Map();
    const memberRows = await prisma.organizationMembership.findMany({
      where: { organizationId: org.id, user: { isActive: true } },
      select: {
        userId: true,
        user: { select: { name: true, email: true } },
      },
    });

    const totalUserDays = snapshots.reduce((sum, s) => sum + s.activeUsers, 0);
    const avgRateCents = currencyPrices[currency] ?? fallbackRate;
    const subtotalCents = totalUserDays * avgRateCents;

    // Approximate user-level days equally across active users (future snapshots can be improved per user).
    const activeUserCount = Math.max(memberRows.length, 1);
    const perUserDays = Math.floor(totalUserDays / activeUserCount);
    let remainder = totalUserDays - perUserDays * activeUserCount;
    for (const row of memberRows) {
      const extra = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder -= 1;
      const d = perUserDays + extra;
      daysByUser.set(row.userId, {
        name: row.user.name || "",
        email: row.user.email,
        days: d,
        rate: avgRateCents,
      });
    }

    const discountPercent = Math.min(Math.max(org.customDiscountPercent ?? 0, 0), 100);
    const discountCents = Math.round((subtotalCents * discountPercent) / 100);

    const flatRateCents = org.customFlatRateCents;
    const flatRateMaxUsers = org.customFlatRateMaxUsers;
    const flatRateApplicable =
      flatRateCents != null &&
      flatRateMaxUsers != null &&
      flatRateMaxUsers > 0 &&
      memberRows.length <= flatRateMaxUsers;

    const totalCents = flatRateApplicable ? flatRateCents : Math.max(subtotalCents - discountCents, 0);

    await prisma.$transaction(async (tx) => {
      const invoice = await tx.billingInvoice.create({
        data: {
          organizationId: org.id,
          periodStart: targetMonthStart,
          periodEnd: targetMonthEnd,
          dueAt,
          status: "issued",
          subtotalCents,
          discountPercent: flatRateApplicable ? 0 : discountPercent,
          discountCents: flatRateApplicable ? 0 : discountCents,
          totalCents,
          currency,
        },
      });

      if (flatRateApplicable) {
        await tx.billingInvoiceLine.create({
          data: {
            invoiceId: invoice.id,
            userName: "Flat rate plan",
            userEmail: null,
            daysConsumed: totalUserDays,
            rateCents: flatRateCents,
            subtotalCents: flatRateCents,
          },
        });
      } else {
        const lines = [...daysByUser.entries()].map(([userId, v]) => ({
          invoiceId: invoice.id,
          userId,
          userName: v.name || null,
          userEmail: v.email || null,
          daysConsumed: v.days,
          rateCents: v.rate,
          subtotalCents: v.days * v.rate,
        }));
        if (lines.length > 0) await tx.billingInvoiceLine.createMany({ data: lines });
      }
    });
    generated += 1;
  }

  return generated;
}

export function monthRangeFromNow(now: Date): { start: Date; end: Date } {
  const start = startOfUtcMonth(now);
  const end = endOfUtcMonthExclusive(now);
  return { start, end };
}
