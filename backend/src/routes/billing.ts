import { Hono } from "hono";
import Stripe from "stripe";
import { prisma } from "../prisma";
import { env } from "../env";
import { auth } from "../auth";

const app = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

// GET /api/billing/packs — get available day packs from database
app.get("/billing/packs", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const packs = await prisma.pricePack.findMany({
    where: { active: true },
    orderBy: { days: "asc" },
  });
  return c.json({ data: packs });
});

// POST /api/billing/checkout — create Stripe checkout session
app.post("/billing/checkout", async (c) => {
  const user = c.get("user");
  if (!user || !user.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

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

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: { name: `OrdoStage — ${pack.label}` },
          unit_amount: discountedAmountCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      organizationId: user.organizationId,
      packId: pack.packId,
      days: String(pack.days),
      amountCents: String(discountedAmountCents),
      discountPercent: String(discountPercent),
    },
    success_url: `${origin}/billing?success=1`,
    cancel_url: `${origin}/billing?cancelled=1`,
  });

  return c.json({ data: { url: session.url } });
});

// POST /api/billing/webhook — Stripe webhook
app.post("/billing/webhook", async (c) => {
  const signature = c.req.header("stripe-signature");
  const body = await c.req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature!, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return c.json({ error: { message: "Invalid signature", code: "INVALID_SIGNATURE" } }, 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const organizationId = session.metadata?.organizationId as string;
    const days = session.metadata?.days as string;
    const amountCents = session.metadata?.amountCents as string;

    // Idempotency check
    const existing = await prisma.creditPurchase.findUnique({
      where: { stripeSessionId: session.id },
    });
    if (!existing) {
      await prisma.$transaction([
        prisma.creditPurchase.create({
          data: {
            organizationId,
            days: parseInt(days),
            amountCents: parseInt(amountCents),
            stripeSessionId: session.id,
          },
        }),
        prisma.organization.update({
          where: { id: organizationId },
          data: { creditBalance: { increment: parseInt(days) } },
        }),
        prisma.creditLog.create({
          data: {
            organizationId,
            delta: parseInt(days),
            reason: "purchase",
            note: `Stripe session ${session.id}`,
          },
        }),
      ]);
    }
  }

  return c.json({ data: { received: true } });
});

export default app;
