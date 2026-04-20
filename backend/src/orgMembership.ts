import type { PrismaClient } from "@prisma/client";

/**
 * Before deleting an organization:
 * 1. Snapshot company/invoice info into any CreditPurchase rows (so invoices survive the deletion).
 * 2. Point every user whose *active* org is this one to another membership (if any).
 */
export async function reassignUsersBeforeOrgDelete(
  prisma: PrismaClient,
  organizationId: string
): Promise<void> {
  // --- 1. Snapshot invoice data into CreditPurchase rows before the org is gone ---
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      name: true,
      invoiceName: true,
      invoiceAddress: true,
      invoiceVat: true,
      invoiceEmail: true,
    },
  });

  if (org) {
    // Only update rows that don't already have a snapshot (idempotent).
    await prisma.creditPurchase.updateMany({
      where: { organizationId, orgNameSnapshot: null },
      data: {
        orgNameSnapshot: org.name,
        invoiceNameSnapshot: org.invoiceName,
        invoiceAddressSnapshot: org.invoiceAddress,
        invoiceVatSnapshot: org.invoiceVat,
        invoiceEmailSnapshot: org.invoiceEmail,
      },
    });
  }

  // --- 2. Redirect each member's active session to another org or null ---
  const affected = await prisma.user.findMany({
    where: { organizationId },
    select: { id: true },
  });
  for (const u of affected) {
    const next = await prisma.organizationMembership.findFirst({
      where: { userId: u.id, organizationId: { not: organizationId } },
    });
    await prisma.user.update({
      where: { id: u.id },
      data: {
        organizationId: next?.organizationId ?? null,
        orgRole: next?.orgRole ?? "member",
      },
    });
  }
}
