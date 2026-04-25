import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";
import { auth } from "../auth";
import { markInvoiceOverdue, markInvoicePaid } from "../postpaidBilling";
import { prisma } from "../prisma";

const app = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

function verifyPaddleSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  const parts = Object.fromEntries(
    signatureHeader
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([k, v]) => Boolean(k) && Boolean(v))
  );

  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1) return false;

  const signedPayload = `${ts}:${rawBody}`;
  const digest = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");

  try {
    return timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(h1, "hex"));
  } catch {
    return false;
  }
}

// Legacy endpoint kept for compatibility after pricing-model migration.
app.get("/billing/packs", async (c) => {
  return c.json({ data: [] });
});

// Legacy checkout endpoint (prepaid flow removed).
app.post("/billing/checkout", async (c) => {
  return c.json(
    {
      error: {
        message: "Credit checkout has been removed. Billing is now postpaid by monthly invoice.",
        code: "LEGACY_CREDIT_FLOW_REMOVED",
      },
    },
    410
  );
});

// POST /api/billing/webhook — Paddle webhook
app.post("/billing/webhook", async (c) => {
  const signature = c.req.header("paddle-signature");
  const body = await c.req.text();
  if (!signature || !env.PADDLE_WEBHOOK_SECRET) {
    return c.json({ error: { message: "Webhook not configured", code: "WEBHOOK_NOT_CONFIGURED" } }, 500);
  }

  if (!verifyPaddleSignature(body, signature, env.PADDLE_WEBHOOK_SECRET)) {
    return c.json({ error: { message: "Invalid signature", code: "INVALID_SIGNATURE" } }, 400);
  }

  const event = JSON.parse(body) as {
    event_type?: string;
    data?: {
      id?: string;
      transaction_id?: string;
      invoice_id?: string;
      custom_data?: { invoiceId?: string };
      checkout?: { url?: string | null } | null;
      invoice?: { id?: string | null } | null;
    };
  };
  const eventType = event?.event_type || "";
  const data = event?.data;
  if (data) {
    const customInvoiceId = data.custom_data?.invoiceId?.trim();
    const paddleTransactionId = data.transaction_id || data.id || undefined;
    const paddleInvoiceId = data.invoice_id || data.invoice?.id || undefined;

    const invoice =
      (customInvoiceId
        ? await prisma.billingInvoice.findUnique({ where: { id: customInvoiceId } })
        : null) ??
      (paddleTransactionId
        ? await prisma.billingInvoice.findFirst({ where: { paddleTransactionId }, orderBy: { issuedAt: "desc" } })
        : null) ??
      (paddleInvoiceId
        ? await prisma.billingInvoice.findFirst({ where: { paddleInvoiceId }, orderBy: { issuedAt: "desc" } })
        : null);

    if (invoice) {
      await prisma.billingInvoice.update({
        where: { id: invoice.id },
        data: {
          paddleTransactionId: paddleTransactionId ?? undefined,
          paddleInvoiceId: paddleInvoiceId ?? undefined,
          ...(data.checkout?.url ? { paddleInvoiceUrl: data.checkout.url } : {}),
        },
      });

      if (eventType === "transaction.completed" || eventType === "payment.succeeded") {
        await markInvoicePaid(prisma, invoice.id, paddleInvoiceId, paddleTransactionId);
      }

      if (
        eventType === "transaction.payment_failed" ||
        eventType === "transaction.past_due" ||
        eventType === "payment.failed"
      ) {
        await markInvoiceOverdue(prisma, invoice.id, paddleInvoiceId, paddleTransactionId);
      }
    }
  }

  return c.json({ data: { received: true } });
});

export default app;
