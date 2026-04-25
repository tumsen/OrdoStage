import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";
import { auth } from "../auth";
import { markInvoicePaid } from "../postpaidBilling";
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
      custom_data?: { invoiceId?: string };
    };
  };

  if (event?.event_type === "transaction.completed" && event.data?.id) {
    const customInvoiceId = event.data.custom_data?.invoiceId?.trim();
    if (customInvoiceId) {
      const exists = await prisma.billingInvoice.findUnique({ where: { id: customInvoiceId } });
      if (exists) {
        await markInvoicePaid(prisma, customInvoiceId, event.data.id);
      }
    } else {
      const byPaddleId = await prisma.billingInvoice.findFirst({
        where: { paddleInvoiceId: event.data.id },
        select: { id: true },
      });
      if (byPaddleId) {
        await markInvoicePaid(prisma, byPaddleId.id, event.data.id);
      }
    }
  }

  return c.json({ data: { received: true } });
});

export default app;
