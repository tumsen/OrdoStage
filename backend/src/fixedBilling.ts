import type { PrismaClient } from "@prisma/client";
import {
  effectiveYearlyCommittedSeats,
  INVOICE_KIND,
  fixedOverageMonthlyTotalCents,
  organizationUsesFlexPostpaid,
} from "./flexFixedPricing";
import { countBillableMemberUserIdsInUtcRange, getBillingConfig, startOfUtcMonth } from "./postpaidBilling";

export async function generateFixedOverageInvoices(prisma: PrismaClient, runAt = new Date()): Promise<number> {
  const cfg = await getBillingConfig(prisma);
  const currentMonthStart = startOfUtcMonth(runAt);
  const targetMonthEnd = currentMonthStart;
  const targetMonthStart = startOfUtcMonth(new Date(Date.UTC(runAt.getUTCFullYear(), runAt.getUTCMonth() - 1, 1)));
  const dueAt = new Date(currentMonthStart.getTime() + cfg.paymentDueDays * 24 * 60 * 60 * 1000);

  const orgs = await prisma.organization.findMany({
    where: { billingPlan: "fixed" },
    select: {
      id: true,
      committedSeats: true,
      temporarySeatsBoost: true,
      temporarySeatsBoostExpiresAt: true,
    },
  });

  let generated = 0;
  for (const org of orgs) {
    const committed = org.committedSeats ?? 0;
    if (committed < 1) continue;
    const effectiveCommitted = effectiveYearlyCommittedSeats(
      committed,
      org.temporarySeatsBoost,
      org.temporarySeatsBoostExpiresAt,
      runAt,
    );

    const existing = await prisma.billingInvoice.findFirst({
      where: {
        organizationId: org.id,
        periodStart: targetMonthStart,
        periodEnd: targetMonthEnd,
        invoiceKind: INVOICE_KIND.FIXED_OVERAGE,
      },
      select: { id: true },
    });
    if (existing) continue;

    const billableIds = await countBillableMemberUserIdsInUtcRange(
      prisma,
      org.id,
      targetMonthStart,
      targetMonthEnd,
    );
    const billableCount = billableIds.size;
    if (billableCount <= effectiveCommitted) continue;

    const totalCents = fixedOverageMonthlyTotalCents(billableCount, effectiveCommitted);
    if (totalCents <= 0) continue;

    const overageSeats = billableCount - effectiveCommitted;
    await prisma.billingInvoice.create({
      data: {
        organizationId: org.id,
        periodStart: targetMonthStart,
        periodEnd: targetMonthEnd,
        dueAt,
        status: "issued",
        invoiceKind: INVOICE_KIND.FIXED_OVERAGE,
        subtotalCents: totalCents,
        discountPercent: 0,
        discountCents: 0,
        totalCents,
        currency: "EUR",
        lines: {
          create: {
            userName: `Fixed overage (${overageSeats} seat${overageSeats === 1 ? "" : "s"} above ${effectiveCommitted})`,
            userEmail: null,
            daysConsumed: 1,
            rateCents: totalCents,
            subtotalCents: totalCents,
          },
        },
      },
    });
    generated += 1;
  }

  return generated;
}

export async function generateAllBillingInvoices(prisma: PrismaClient, runAt = new Date()): Promise<{
  flexMonthly: number;
  fixedOverage: number;
}> {
  const { generateMonthlyInvoices } = await import("./postpaidBilling");
  const flexMonthly = await generateMonthlyInvoices(prisma, runAt);
  const fixedOverage = await generateFixedOverageInvoices(prisma, runAt);
  return { flexMonthly, fixedOverage };
}

export function isFlexPostpaidOrg(plan: string | null | undefined): boolean {
  return organizationUsesFlexPostpaid(plan);
}
