import type { PrismaClient } from "@prisma/client";

export async function provisionFixedPlanSubscription(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    committedSeats: number;
    annualInvoiceAmountCents: number;
    paddleSubscriptionId: string;
    renewalAt?: Date;
  },
): Promise<void> {
  const now = new Date();
  const renewalAt =
    input.renewalAt ??
    (() => {
      const d = new Date(now);
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      return d;
    })();

  await prisma.organization.update({
    where: { id: input.organizationId },
    data: {
      billingPlan: "fixed",
      committedSeats: input.committedSeats,
      annualInvoiceAmountCents: input.annualInvoiceAmountCents,
      annualRenewalDate: renewalAt,
      annualTermStartDate: now,
      paddleSubscriptionId: input.paddleSubscriptionId,
      billingStatus: "active",
      billingDueAt: null,
      billingViewOnlySince: null,
    },
  });
}

export async function increaseFixedCommittedSeats(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    newCommittedSeats: number;
    topUpAmountCents: number;
    paddleSubscriptionId?: string;
  },
): Promise<void> {
  const org = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: {
      annualInvoiceAmountCents: true,
      annualRenewalDate: true,
    },
  });
  if (!org) return;

  const renewalAt = org.annualRenewalDate ?? new Date();
  await prisma.organization.update({
    where: { id: input.organizationId },
    data: {
      committedSeats: input.newCommittedSeats,
      annualInvoiceAmountCents: (org.annualInvoiceAmountCents ?? 0) + input.topUpAmountCents,
      ...(input.paddleSubscriptionId ? { paddleSubscriptionId: input.paddleSubscriptionId } : {}),
      annualRenewalDate: renewalAt,
    },
  });
}

export async function downgradeFixedPlanAtPeriodEnd(prisma: PrismaClient, organizationId: string): Promise<void> {
  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      billingPlan: "flex",
      committedSeats: null,
      temporarySeatsBoost: null,
      temporarySeatsBoostExpiresAt: null,
      annualRenewalDate: null,
      annualTermStartDate: null,
      annualInvoiceAmountCents: null,
      paddleSubscriptionId: null,
    },
  });
}

export async function applyTemporarySeatPass(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    extraSeats: number;
    passDays: number;
  },
): Promise<void> {
  const extra = Math.max(1, Math.round(input.extraSeats));
  const days = Math.max(1, Math.round(input.passDays));
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + days);

  await prisma.organization.update({
    where: { id: input.organizationId },
    data: {
      temporarySeatsBoost: extra,
      temporarySeatsBoostExpiresAt: expiresAt,
    },
  });
}
