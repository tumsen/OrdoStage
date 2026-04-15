import { Hono } from "hono";
import Stripe from "stripe";
import { prisma } from "../prisma";
import { env } from "../env";
import { auth } from "../auth";

const app = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

const DAY_PACKS = [
  { id: "pack_100", days: 100, amountCents: 900, label: "100 days", price: "€9" },
  { id: "pack_500", days: 500, amountCents: 3900, label: "500 days", price: "€39" },
  { id: "pack_1000", days: 1000, amountCents: 6900, label: "1000 days", price: "€69" },
  { id: "pack_5000", days: 5000, amountCents: 29900, label: "5000 days", price: "€299" },
];

// GET /api/billing/packs — get available day packs
app.get("/billing/packs", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  return c.json({ data: DAY_PACKS });
});

// POST /api/billing/checkout — create Stripe checkout session
app.post("/billing/checkout", async (c) => {
  const user = c.get("user");
  if (!user || !user.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const { packId } = await c.req.json();
  const pack = DAY_PACKS.find((p) => p.id === packId);
  if (!pack) return c.json({ error: { message: "Invalid pack", code: "INVALID_PACK" } }, 400);

  const origin = c.req.header("origin") || "http://localhost:8000";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: { name: `Theater Planner — ${pack.label}` },
          unit_amount: pack.amountCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      organizationId: user.organizationId,
      packId: pack.id,
      days: String(pack.days),
      amountCents: String(pack.amountCents),
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
    const { organizationId, days, amountCents } = session.metadata!;

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
      ]);
    }
  }

  return c.json({ data: { received: true } });
});

export default app;
