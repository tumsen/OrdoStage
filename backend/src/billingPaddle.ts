import type { PrismaClient } from "@prisma/client";
import { createPaddleCustomer, createPaddleTransactionForInvoice } from "./paddleClient";

export async function syncBillingInvoiceWithPaddle(
  prisma: PrismaClient,
  invoiceId: string,
  fallbackEmail?: string | null,
): Promise<{
  checkoutUrl: string | null;
  paddleTransactionId: string | null;
  paddleInvoiceId: string | null;
}> {
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
    throw new Error("Invoice not found");
  }
  if (invoice.status === "paid") {
    throw new Error("Invoice is already paid");
  }
  if (invoice.paddleInvoiceUrl?.trim()) {
    return {
      checkoutUrl: invoice.paddleInvoiceUrl,
      paddleTransactionId: invoice.paddleTransactionId,
      paddleInvoiceId: invoice.paddleInvoiceId,
    };
  }

  let paddleCustomerId = invoice.organization.paddleCustomerId;
  if (!paddleCustomerId) {
    const customer = await createPaddleCustomer({
      organizationId: invoice.organization.id,
      name: invoice.organization.name,
      email: invoice.organization.invoiceEmail || fallbackEmail,
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
      paddleTransactionId: true,
      paddleInvoiceId: true,
      paddleInvoiceUrl: true,
    },
  });

  return {
    checkoutUrl: updated.paddleInvoiceUrl,
    paddleTransactionId: updated.paddleTransactionId,
    paddleInvoiceId: updated.paddleInvoiceId,
  };
}
