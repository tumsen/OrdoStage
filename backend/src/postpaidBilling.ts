import { PrismaClient } from "@prisma/client";

export type BillingConfigResolved = {
  paymentDueDays: number;
  yearlyDiscountPercent: number;
  yearlyDiscountEnabled: boolean;
};

/** Single billing currency for the product (USD and others may be added again later). */
export const BILLING_CURRENCY_CODE = "EUR" as const;

export const SUPPORTED_BILLING_CURRENCIES = [BILLING_CURRENCY_CODE] as const;

export type SupportedBillingCurrency = (typeof SUPPORTED_BILLING_CURRENCIES)[number];

export type CurrencyPriceMap = Record<string, number>;

function currentUtcMonthKey(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function endOfUtcMonthExclusive(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

/** Inclusive start, exclusive end — current UTC calendar month for `now`. */
export function currentUtcMonthRange(now: Date): { start: Date; endExclusive: Date } {
  return { start: startOfUtcMonth(now), endExclusive: endOfUtcMonthExclusive(now) };
}

export async function getBillingConfig(prisma: PrismaClient): Promise<BillingConfigResolved> {
  const cfg = await prisma.billingConfig.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
  return {
    paymentDueDays: cfg.paymentDueDays,
    yearlyDiscountPercent: cfg.yearlyDiscountPercent,
    yearlyDiscountEnabled: cfg.yearlyDiscountEnabled,
  };
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

/**
 * `BillingCurrencyPrice.userDailyRateCents` stores **per-user monthly** price in cents (legacy column name).
 */
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

function tableMonthlyRateCents(map: CurrencyPriceMap): number {
  return map[BILLING_CURRENCY_CODE] ?? 1500;
}

/**
 * Active org members who triggered a billable seat in the half-open UTC range:
 * work time entries, show job assignment, show staffing, or event team note/document activity.
 */
export async function countBillableMemberUserIdsInUtcRange(
  prisma: PrismaClient,
  organizationId: string,
  rangeStart: Date,
  rangeEndExclusive: Date,
): Promise<Set<string>> {
  const memberships = await prisma.organizationMembership.findMany({
    where: { organizationId, user: { isActive: true } },
    select: { userId: true, user: { select: { email: true } } },
  });
  const memberIds = new Set(memberships.map((m) => m.userId));
  const emailToUserId = new Map<string, string>();
  for (const m of memberships) {
    const e = m.user.email?.trim().toLowerCase();
    if (e) emailToUserId.set(e, m.userId);
  }

  const billable = new Set<string>();

  const workEntries = await prisma.timeEntry.findMany({
    where: {
      organizationId,
      category: "work",
      startsAt: { gte: rangeStart, lt: rangeEndExclusive },
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  for (const row of workEntries) {
    if (memberIds.has(row.userId)) billable.add(row.userId);
  }

  const noteRows = await prisma.eventTeamNote.findMany({
    where: {
      event: { organizationId },
      createdByUserId: { not: null },
      createdAt: { gte: rangeStart, lt: rangeEndExclusive },
    },
    select: { createdByUserId: true },
    distinct: ["createdByUserId"],
  });
  for (const row of noteRows) {
    const uid = row.createdByUserId!;
    if (memberIds.has(uid)) billable.add(uid);
  }

  const docRows = await prisma.eventTeamDocument.findMany({
    where: {
      event: { organizationId },
      createdByUserId: { not: null },
      createdAt: { gte: rangeStart, lt: rangeEndExclusive },
    },
    select: { createdByUserId: true },
    distinct: ["createdByUserId"],
  });
  for (const row of docRows) {
    const uid = row.createdByUserId!;
    if (memberIds.has(uid)) billable.add(uid);
  }

  const jobPeople = await prisma.eventShowJob.findMany({
    where: {
      personId: { not: null },
      jobDate: { gte: rangeStart, lt: rangeEndExclusive },
      show: { event: { organizationId } },
    },
    select: { personId: true },
  });
  const staffPeople = await prisma.eventShowStaffing.findMany({
    where: {
      show: {
        showDate: { gte: rangeStart, lt: rangeEndExclusive },
        event: { organizationId },
      },
    },
    select: { personId: true },
  });

  const personIds = [...new Set([...jobPeople.map((j) => j.personId!), ...staffPeople.map((s) => s.personId)])];
  if (personIds.length > 0) {
    const people = await prisma.person.findMany({
      where: { organizationId, id: { in: personIds } },
      select: { email: true },
    });
    for (const p of people) {
      const e = p.email?.trim().toLowerCase();
      if (!e) continue;
      const uid = emailToUserId.get(e);
      if (uid && memberIds.has(uid)) billable.add(uid);
    }
  }

  return billable;
}

export function estimateMonthlyOrgAmountCents(input: {
  /** Users who incurred billable activity in the priced month (or projection). */
  billableUsers: number;
  /** Global table or org default: cents per billable user for the full month. */
  perUserMonthlyRateCents: number;
  /** Organization override in cents (same DB field as legacy name `customUserDailyRateCents`). */
  customUserMonthlyRateCents?: number | null;
  customDiscountPercent: number | null;
  customFlatRateCents: number | null;
  customFlatRateMaxUsers: number | null;
  /** Active members (for flat-rate seat cap). */
  activeMemberCount: number;
}): number {
  const rateCents =
    input.customUserMonthlyRateCents != null && input.customUserMonthlyRateCents > 0
      ? input.customUserMonthlyRateCents
      : input.perUserMonthlyRateCents;
  const subtotal = input.billableUsers * rateCents;
  const discountPercent = Math.min(Math.max(input.customDiscountPercent ?? 0, 0), 100);
  const flatRateApplicable =
    input.customFlatRateCents != null &&
    input.customFlatRateMaxUsers != null &&
    input.customFlatRateMaxUsers > 0 &&
    input.activeMemberCount <= input.customFlatRateMaxUsers;
  if (flatRateApplicable) return input.customFlatRateCents!;
  const discountCents = Math.round((subtotal * discountPercent) / 100);
  return Math.max(subtotal - discountCents, 0);
}

export async function recordDailyUsageSnapshot(prisma: PrismaClient, today = new Date()): Promise<number> {
  const currencyPrices = await getCurrencyPriceMap(prisma);
  const fallbackRate = tableMonthlyRateCents(currencyPrices);
  const dayStart = startOfUtcDay(today);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      customUserDailyRateCents: true,
    },
  });

  let created = 0;
  for (const org of orgs) {
    const billable = await countBillableMemberUserIdsInUtcRange(prisma, org.id, dayStart, dayEnd);
    const activeUsers = billable.size;
    const currency = BILLING_CURRENCY_CODE;
    const tableRate = currencyPrices[BILLING_CURRENCY_CODE] ?? fallbackRate;
    const rateCents =
      org.customUserDailyRateCents != null && org.customUserDailyRateCents > 0
        ? org.customUserDailyRateCents
        : tableRate;
    await prisma.billingUsageSnapshot.upsert({
      where: { organizationId_snapshotDate: { organizationId: org.id, snapshotDate: dayStart } },
      create: {
        organizationId: org.id,
        snapshotDate: dayStart,
        activeUsers,
        userDailyRateCents: rateCents,
        currencyCode: currency,
      },
      update: {
        activeUsers,
        userDailyRateCents: rateCents,
        currencyCode: currency,
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
  paddleInvoiceId?: string | null,
  paddleTransactionId?: string | null
): Promise<void> {
  const paidAt = new Date();
  const invoice = await prisma.billingInvoice.update({
    where: { id: invoiceId },
    data: {
      status: "paid",
      paidAt,
      paddleInvoiceId: paddleInvoiceId ?? undefined,
      paddleTransactionId: paddleTransactionId ?? undefined,
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

export async function markInvoiceOverdue(
  prisma: PrismaClient,
  invoiceId: string,
  paddleInvoiceId?: string | null,
  paddleTransactionId?: string | null
): Promise<void> {
  const invoice = await prisma.billingInvoice.update({
    where: { id: invoiceId },
    data: {
      status: "overdue",
      paddleInvoiceId: paddleInvoiceId ?? undefined,
      paddleTransactionId: paddleTransactionId ?? undefined,
    },
    select: { organizationId: true, dueAt: true },
  });
  await prisma.organization.update({
    where: { id: invoice.organizationId },
    data: {
      billingStatus: "overdue_view_only",
      billingDueAt: invoice.dueAt,
      billingViewOnlySince: new Date(),
    },
  });
}

export async function generateMonthlyInvoices(prisma: PrismaClient, runAt = new Date()): Promise<number> {
  const cfg = await getBillingConfig(prisma);
  const currencyPrices = await getCurrencyPriceMap(prisma);
  const fallbackRate = tableMonthlyRateCents(currencyPrices);
  const currentMonthStart = startOfUtcMonth(runAt);
  const targetMonthEnd = currentMonthStart;
  const targetMonthStart = startOfUtcMonth(new Date(Date.UTC(runAt.getUTCFullYear(), runAt.getUTCMonth() - 1, 1)));
  const dueAt = new Date(currentMonthStart.getTime() + cfg.paymentDueDays * 24 * 60 * 60 * 1000);

  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      customUserDailyRateCents: true,
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

    const billableUserIds = await countBillableMemberUserIdsInUtcRange(prisma, org.id, targetMonthStart, targetMonthEnd);
    if (billableUserIds.size === 0) continue;

    const memberRows = await prisma.organizationMembership.findMany({
      where: { organizationId: org.id, user: { isActive: true } },
      select: {
        userId: true,
        user: { select: { name: true, email: true } },
      },
    });

    const currency = BILLING_CURRENCY_CODE;
    const monthlyRateCents =
      org.customUserDailyRateCents != null && org.customUserDailyRateCents > 0
        ? org.customUserDailyRateCents
        : currencyPrices[currency] ?? fallbackRate;

    const chargedUserIds = [...billableUserIds].filter((id) => memberRows.some((m) => m.userId === id));
    if (chargedUserIds.length === 0) continue;

    const discountPercent = Math.min(Math.max(org.customDiscountPercent ?? 0, 0), 100);
    const flatRateCents = org.customFlatRateCents;
    const flatRateMaxUsers = org.customFlatRateMaxUsers;
    const flatRateApplicable =
      flatRateCents != null &&
      flatRateMaxUsers != null &&
      flatRateMaxUsers > 0 &&
      memberRows.length <= flatRateMaxUsers;

    const seatCount = chargedUserIds.length;
    const subtotalCents = flatRateApplicable ? flatRateCents : seatCount * monthlyRateCents;
    const discountCents = flatRateApplicable ? 0 : Math.round((subtotalCents * discountPercent) / 100);
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
            daysConsumed: 1,
            rateCents: flatRateCents,
            subtotalCents: flatRateCents,
          },
        });
      } else {
        const lines = chargedUserIds.map((userId) => {
          const row = memberRows.find((m) => m.userId === userId)!;
          return {
            invoiceId: invoice.id,
            userId,
            userName: row.user.name || null,
            userEmail: row.user.email || null,
            daysConsumed: 1,
            rateCents: monthlyRateCents,
            subtotalCents: monthlyRateCents,
          };
        });
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
