import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "../prisma";
import { env } from "../env";
import { auth } from "../auth";

const app = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();
const paddleApiBase = env.PADDLE_ENV === "live"
  ? "https://api.paddle.com"
  : "https://sandbox-api.paddle.com";

function paddleConfigured() {
  return Boolean(env.PADDLE_API_KEY && env.PADDLE_WEBHOOK_SECRET);
}

async function paddleRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!env.PADDLE_API_KEY) {
    throw new Error("Paddle API key is not configured");
  }
  const res = await fetch(`${paddleApiBase}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.PADDLE_API_KEY}`,
      ...init.headers,
    },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      json?.error?.detail ||
      json?.error?.message ||
      `Paddle API request failed with ${res.status}`
    );
  }

  return json as T;
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

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { discountPercent: true },
  });

  const discountPercent = Math.max(0, Math.min(100, org?.discountPercent ?? 0));
  const discountedAmountCents =
    discountPercent > 0
      ? Math.max(1, Math.round(pack.amountCents * (100 - discountPercent) / 100))
      : pack.amountCents;

  const origin = c.req.header("origin") || "http://localhost:8000";

  const transaction = await paddleRequest<{
    data: { id: string };
  }>("/transactions", {
    method: "POST",
    body: JSON.stringify({
      items: [
        {
          quantity: 1,
          price: {
            name: `OrdoStage — ${pack.label}`,
            unit_price: {
              amount: String(discountedAmountCents),
              currency_code: "EUR",
            },
            description: `${pack.days} credit days`,
          },
        },
      ],
      custom_data: {
        organizationId: user.organizationId,
        packId: pack.packId,
        days: pack.days,
        amountCents: discountedAmountCents,
        discountPercent,
      },
    }),
  });

  const checkout = await paddleRequest<{
    data: { url: string };
  }>(`/transactions/${transaction.data.id}/checkout`, {
    method: "POST",
    body: JSON.stringify({
      success_url: `${origin}/billing?success=1`,
      cancel_url: `${origin}/billing?cancelled=1`,
    }),
  });

  return c.json({ data: { url: checkout.data.url } });
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
            data: { creditBalance: { increment: days } },
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
