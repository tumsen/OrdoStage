import { prisma } from "./prisma";

export const CREDIT_WARNING_THRESHOLD = 30; // days

export async function deductCredits(
  organizationId: string
): Promise<{ balance: number; warning: boolean; blocked: boolean }> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) return { balance: 0, warning: true, blocked: true };

  const now = new Date();
  const lastDeducted = new Date(org.lastDeductedAt);
  const daysSince = Math.floor(
    (now.getTime() - lastDeducted.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSince > 0) {
    const userCount = await prisma.user.count({ where: { organizationId } });
    const toDeduct = daysSince * Math.max(userCount, 1);
    const newBalance = org.creditBalance - toDeduct;

    await prisma.organization.update({
      where: { id: organizationId },
      data: { creditBalance: newBalance, lastDeductedAt: now },
    });

    return {
      balance: newBalance,
      warning: newBalance <= CREDIT_WARNING_THRESHOLD,
      blocked: newBalance <= 0,
    };
  }

  return {
    balance: org.creditBalance,
    warning: org.creditBalance <= CREDIT_WARNING_THRESHOLD,
    blocked: org.creditBalance <= 0,
  };
}
