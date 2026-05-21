import { PrismaClient } from "@prisma/client";
import { organizationUsesFlexPostpaid } from "./flexFixedPricing";
import {
  DEFAULT_FIXED_PLAN_PRICING,
  parseFixedPlanPricingJson,
  type FixedPlanPricingConfig,
} from "./fixedPlanPricingConfig";
import { parseSeatCalculatorJson } from "./seatCalculatorJson";
import {
  DEFAULT_TIERED_SEAT_MODEL,
  tieredMonthlyTotalCents,
  type TieredSeatModel,
} from "./tieredSeatPricing";

export type BillingConfigResolved = {
  paymentDueDays: number;
  yearlyDiscountPercent: number;
  yearlyDiscountEnabled: boolean;
  billingTrialDays: number;
  billingGraceDaysAfterDue: number;
  fixedAnnualRoundToTen: boolean;
  fixedPlanPricing: FixedPlanPricingConfig;
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
    billingTrialDays: cfg.billingTrialDays,
    billingGraceDaysAfterDue: cfg.billingGraceDaysAfterDue,
    fixedAnnualRoundToTen: cfg.fixedAnnualRoundToTen,
    fixedPlanPricing: parseFixedPlanPricingJson(cfg.fixedPlanPricingJson),
  };
}

export { DEFAULT_FIXED_PLAN_PRICING };

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

/** Global default seat curve from BillingConfig (null = use flat table only). */
export async function getGlobalDefaultSeatCalculatorJson(prisma: PrismaClient): Promise<string | null> {
  const row = await prisma.billingConfig.findUnique({
    where: { id: "default" },
    select: { defaultSeatCalculatorJson: true },
  });
  const raw = row?.defaultSeatCalculatorJson;
  if (raw == null || !String(raw).trim()) return null;
  return String(raw).trim();
}

/**
 * Monthly seat subtotal in cents: org flat override, else tier curve when global/org JSON has a `model`,
 * else legacy flat table × billable users.
 */
export function seatCurveSubtotalCents(input: {
  billableUsers: number;
  customUserMonthlyRateCents: number | null | undefined;
  orgSeatCalculatorJson: string | null | undefined;
  globalSeatCalculatorJson: string | null | undefined;
  tablePerUserMonthlyRateCents: number;
}): number {
  const u = input.billableUsers;
  if (u <= 0) return 0;
  if (input.customUserMonthlyRateCents != null && input.customUserMonthlyRateCents > 0) {
    return u * input.customUserMonthlyRateCents;
  }
  const g = parseSeatCalculatorJson(input.globalSeatCalculatorJson);
  const o = parseSeatCalculatorJson(input.orgSeatCalculatorJson);
  if (g?.model == null && o?.model == null) {
    return u * input.tablePerUserMonthlyRateCents;
  }
  const model: TieredSeatModel = { ...DEFAULT_TIERED_SEAT_MODEL };
  if (g?.model) Object.assign(model, g.model);
  if (o?.model) Object.assign(model, o.model);
  return tieredMonthlyTotalCents(u, model);
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

  const jobPeople = await prisma.eventShowJobPerson.findMany({
    where: {
      job: {
        jobDate: { gte: rangeStart, lt: rangeEndExclusive },
        show: { event: { organizationId } },
      },
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

/** Billable members in the UTC range, with display fields (sorted by name). */
export async function listBillableMembersForUtcRange(
  prisma: PrismaClient,
  organizationId: string,
  rangeStart: Date,
  rangeEndExclusive: Date
): Promise<Array<{ id: string; name: string | null; email: string }>> {
  const ids = await countBillableMemberUserIdsInUtcRange(prisma, organizationId, rangeStart, rangeEndExclusive);
  if (ids.size === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
  return users.map((u) => ({ id: u.id, name: u.name, email: u.email }));
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
  orgSeatCalculatorJson?: string | null;
  globalSeatCalculatorJson?: string | null;
}): number {
  const subtotal = seatCurveSubtotalCents({
    billableUsers: input.billableUsers,
    customUserMonthlyRateCents: input.customUserMonthlyRateCents,
    orgSeatCalculatorJson: input.orgSeatCalculatorJson,
    globalSeatCalculatorJson: input.globalSeatCalculatorJson,
    tablePerUserMonthlyRateCents: input.perUserMonthlyRateCents,
  });
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
  const globalSeatJson = await getGlobalDefaultSeatCalculatorJson(prisma);
  const dayStart = startOfUtcDay(today);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      billingPlan: true,
      customUserDailyRateCents: true,
      customSeatCalculatorJson: true,
    },
  });

  let created = 0;
  for (const org of orgs) {
    if (!organizationUsesFlexPostpaid(org.billingPlan)) continue;
    const billable = await countBillableMemberUserIdsInUtcRange(prisma, org.id, dayStart, dayEnd);
    const activeUsers = billable.size;
    const currency = BILLING_CURRENCY_CODE;
    const tableRate = currencyPrices[BILLING_CURRENCY_CODE] ?? fallbackRate;
    const subtotal = seatCurveSubtotalCents({
      billableUsers: activeUsers,
      customUserMonthlyRateCents: org.customUserDailyRateCents,
      orgSeatCalculatorJson: org.customSeatCalculatorJson,
      globalSeatCalculatorJson: globalSeatJson,
      tablePerUserMonthlyRateCents: tableRate,
    });
    const rateCents =
      activeUsers > 0 ? Math.max(1, Math.round(subtotal / activeUsers)) : tableRate;
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
  const [cfgRow, orgRow] = await Promise.all([
    prisma.billingConfig.findUnique({
      where: { id: "default" },
      select: { billingTrialDays: true, billingGraceDaysAfterDue: true },
    }),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { createdAt: true, billingPlan: true },
    }),
  ]);
  const isFixed = orgRow && !organizationUsesFlexPostpaid(orgRow.billingPlan);
  const trialDays = Math.max(0, cfgRow?.billingTrialDays ?? 0);
  const graceDays = Math.max(0, cfgRow?.billingGraceDaysAfterDue ?? 0);
  const graceMs = graceDays * 24 * 60 * 60 * 1000;

  if (!isFixed && orgRow && trialDays > 0) {
    const trialEndMs = orgRow.createdAt.getTime() + trialDays * 24 * 60 * 60 * 1000;
    if (now.getTime() < trialEndMs) {
      await prisma.organization.update({
        where: { id: organizationId },
        data: {
          billingStatus: "active",
          billingViewOnlySince: null,
          billingDueAt: null,
        },
      });
      return false;
    }
  }

  const openInvoices = await prisma.billingInvoice.findMany({
    where: {
      organizationId,
      status: { in: ["issued", "overdue"] },
      ...(isFixed
        ? { invoiceKind: { in: ["fixed_overage", "fixed_topup"] } }
        : { invoiceKind: "flex_monthly" }),
    },
    orderBy: { dueAt: "asc" },
    select: { id: true, dueAt: true },
  });
  const blocking = openInvoices.find((inv) => now.getTime() > inv.dueAt.getTime() + graceMs);

  if (!blocking) {
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
      where: { id: blocking.id },
      data: { status: "overdue" },
    }),
    prisma.organization.update({
      where: { id: organizationId },
      data: {
        billingStatus: "overdue_view_only",
        billingDueAt: blocking.dueAt,
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
  const globalSeatJson = await getGlobalDefaultSeatCalculatorJson(prisma);
  const currentMonthStart = startOfUtcMonth(runAt);
  const targetMonthEnd = currentMonthStart;
  const targetMonthStart = startOfUtcMonth(new Date(Date.UTC(runAt.getUTCFullYear(), runAt.getUTCMonth() - 1, 1)));
  const dueAt = new Date(currentMonthStart.getTime() + cfg.paymentDueDays * 24 * 60 * 60 * 1000);

  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      billingPlan: true,
      customUserDailyRateCents: true,
      customSeatCalculatorJson: true,
      customDiscountPercent: true,
      customFlatRateCents: true,
      customFlatRateMaxUsers: true,
    },
  });

  let generated = 0;
  for (const org of orgs) {
    if (!organizationUsesFlexPostpaid(org.billingPlan)) continue;
    const existing = await prisma.billingInvoice.findFirst({
      where: {
        organizationId: org.id,
        periodStart: targetMonthStart,
        periodEnd: targetMonthEnd,
        invoiceKind: "flex_monthly",
      },
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
    const tableRate = currencyPrices[currency] ?? fallbackRate;

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
    const subtotalCents = flatRateApplicable
      ? flatRateCents!
      : seatCurveSubtotalCents({
          billableUsers: seatCount,
          customUserMonthlyRateCents: org.customUserDailyRateCents,
          orgSeatCalculatorJson: org.customSeatCalculatorJson,
          globalSeatCalculatorJson: globalSeatJson,
          tablePerUserMonthlyRateCents: tableRate,
        });
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
          invoiceKind: "flex_monthly",
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
        const baseEach = Math.floor(subtotalCents / seatCount);
        const remainder = subtotalCents - baseEach * seatCount;
        const lines = chargedUserIds.map((userId, idx) => {
          const row = memberRows.find((m) => m.userId === userId)!;
          const extra = idx < remainder ? 1 : 0;
          const lineSub = baseEach + extra;
          return {
            invoiceId: invoice.id,
            userId,
            userName: row.user.name || null,
            userEmail: row.user.email || null,
            daysConsumed: 1,
            rateCents: lineSub,
            subtotalCents: lineSub,
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
