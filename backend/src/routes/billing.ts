import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "../prisma";
import { env } from "../env";
import { auth } from "../auth";
import { createPaddleCheckoutUrl, isPaddleConfigured } from "../paddleCheckout";

const app = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

function paddleConfigured() {
  return isPaddleConfigured();
}

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

// GET /api/billing/packs — get available day packs from database
app.get("/billing/packs", async (c) => {
  const packs = await prisma.pricePack.findMany({
    where: { active: true },
    orderBy: { days: "asc" },
  });
  return c.json({ data: packs });
});

// POST /api/billing/checkout — create Paddle checkout session
app.post("/billing/checkout", async (c) => {
  const user = c.get("user");
  if (!user || !user.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  if (!paddleConfigured()) {
    return c.json(
      {
        error: {
          message: "Paddle is not configured yet. Add PADDLE_API_KEY and PADDLE_WEBHOOK_SECRET.",
          code: "BILLING_NOT_CONFIGURED",
        },
      },
      500
    );
  }

  const { packId, days } = await c.req.json();
  const resolvedPackId = packId || (days ? `pack_${days}` : undefined);
  if (!resolvedPackId) {
    return c.json({ error: { message: "Pack is required", code: "BAD_REQUEST" } }, 400);
  }

  const pack = await prisma.pricePack.findUnique({
    where: { packId: resolvedPackId, active: true },
  });
  if (!pack) return c.json({ error: { message: "Invalid pack", code: "INVALID_PACK" } }, 400);

  const origin = c.req.header("origin") || "http://localhost:8000";
  const base = origin.replace(/\/$/, "");

  const url = await createPaddleCheckoutUrl({
    organizationId: user.organizationId,
    packId: pack.packId,
    origin,
    successUrl: `${base}/billing?success=1`,
    cancelUrl: `${base}/billing?cancelled=1`,
  });

  return c.json({ data: { url } });
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

  const event = JSON.parse(body) as
    | {
        event_type?: string;
        data?: {
          id?: string;
          status?: string;
          custom_data?: {
            organizationId?: string;
            days?: number;
            amountCents?: number;
          };
        };
      };

  if (event?.event_type === "transaction.completed" && event.data?.id) {
    const transactionId = event.data.id;
    const organizationId = event.data.custom_data?.organizationId;
    const days = Number(event.data.custom_data?.days ?? 0);
    const amountCents = Number(event.data.custom_data?.amountCents ?? 0);

    if (organizationId && days > 0 && amountCents > 0) {
      const existing = await prisma.creditPurchase.findUnique({
        where: { stripeSessionId: transactionId },
      });
      if (!existing) {
        await prisma.$transaction([
          prisma.creditPurchase.create({
            data: {
              organizationId,
              days,
              amountCents,
              // Reuse existing unique field for provider transaction id.
              stripeSessionId: transactionId,
            },
          }),
          prisma.organization.update({
            where: { id: organizationId },
            data: {
              creditBalance: { increment: days },
              pendingAutoTopUpUrl: null,
              pendingAutoTopUpCreatedAt: null,
            },
          }),
          prisma.creditLog.create({
            data: {
              organizationId,
              delta: days,
              reason: "purchase",
              note: `Paddle transaction ${transactionId}`,
            },
          }),
        ]);
      }
    }
  }

  return c.json({ data: { received: true } });
});

export default app;
