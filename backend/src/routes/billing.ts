import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";
import { auth } from "../auth";
import {
  annualInvoiceTotalCents,
  effectiveYearlyCommittedSeats,
  proratedSeatIncreaseTopUpCents,
  requiresEnterpriseContact,
  temporarySeatPassTotalCents,
} from "../flexFixedPricing";
import {
  applyTemporarySeatPass,
  downgradeFixedPlanAtPeriodEnd,
  increaseFixedCommittedSeats,
  provisionFixedPlanSubscription,
} from "../fixedPlanProvisioning";
import { syncBillingInvoiceWithPaddle } from "../billingPaddle";
import {
  createPaddleCheckoutForFixedPlan,
  createPaddleCheckoutForFixedTopUp,
  createPaddleCheckoutForTemporarySeatPass,
  createPaddleCustomer,
  createPaddleSandboxTestCheckout,
  isPaddleConfigured,
} from "../paddleClient";
import { getBillingConfig, markInvoiceOverdue, markInvoicePaid } from "../postpaidBilling";
import { prisma } from "../prisma";
import {
  ChooseBillingPlanRequestSchema,
  FixedCheckoutRequestSchema,
  FixedSeatIncreaseRequestSchema,
  FixedTemporaryPassCheckoutRequestSchema,
  FixedTemporaryPassQuoteRequestSchema,
} from "../types";

const app = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

function verifyPaddleSignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  const parts = Object.fromEntries(
    signatureHeader
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([k, v]) => Boolean(k) && Boolean(v)),
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

type PaddleCustomData = {
  invoiceId?: string;
  organizationId?: string;
  billingPlan?: string;
  committedSeats?: string;
  checkoutKind?: string;
  newCommittedSeats?: string;
  topUpCents?: string;
  extraSeats?: string;
  passDays?: string;
};

type PaddleWebhookData = {
  id?: string;
  transaction_id?: string;
  invoice_id?: string;
  subscription_id?: string;
  custom_data?: PaddleCustomData;
  checkout?: { url?: string | null } | null;
  invoice?: { id?: string | null } | null;
  details?: { totals?: { total?: string | null } | null } | null;
};

function parseCommittedSeats(custom: PaddleCustomData | undefined): number | null {
  const raw = custom?.committedSeats?.trim() || custom?.newCommittedSeats?.trim();
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

function parseAmountCents(data: PaddleWebhookData): number | null {
  const raw = data.details?.totals?.total;
  if (raw == null) return null;
  const n = parseInt(String(raw).replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

async function handleFixedPlanWebhook(eventType: string, data: PaddleWebhookData): Promise<void> {
  const custom = data.custom_data;
  if (custom?.billingPlan !== "fixed") return;
  const organizationId = custom.organizationId?.trim();
  if (!organizationId) return;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!org) return;

  const paidEvents = new Set(["transaction.completed", "payment.succeeded"]);
  if (custom.checkoutKind === "temporary_pass" && paidEvents.has(eventType)) {
    const extraSeats = parseInt(custom.extraSeats?.trim() || "", 10);
    const passDays = parseInt(custom.passDays?.trim() || "", 10);
    if (Number.isFinite(extraSeats) && extraSeats > 0 && Number.isFinite(passDays) && passDays > 0) {
      await applyTemporarySeatPass(prisma, { organizationId, extraSeats, passDays });
    }
    return;
  }

  const subscriptionId = data.subscription_id || data.id;
  if (!subscriptionId) return;

  const activateEvents = new Set([
    "subscription.activated",
    "subscription.created",
    "subscription.renewed",
    "transaction.completed",
  ]);
  const cancelEvents = new Set(["subscription.canceled", "subscription.cancelled"]);

  if (eventType === "subscription.renewed" && parseCommittedSeats(custom) != null) {
    const seats = parseCommittedSeats(custom)!;
    const cfg = await getBillingConfig(prisma);
    const amountCents =
      parseAmountCents(data) ?? annualInvoiceTotalCents(seats, cfg.fixedAnnualRoundToTen, cfg.fixedPlanPricing);
    const renewalAt = new Date();
    renewalAt.setUTCFullYear(renewalAt.getUTCFullYear() + 1);
    await provisionFixedPlanSubscription(prisma, {
      organizationId,
      committedSeats: seats,
      annualInvoiceAmountCents: amountCents,
      paddleSubscriptionId: subscriptionId,
      renewalAt,
    });
    return;
  }

  if (activateEvents.has(eventType)) {
    const checkoutKind = custom.checkoutKind || "initial";
    if (checkoutKind === "topup") {
      const newSeats = parseCommittedSeats(custom);
      const topUp =
        parseInt(custom.topUpCents?.trim() || "", 10) || parseAmountCents(data) || 0;
      if (newSeats != null && topUp > 0) {
        await increaseFixedCommittedSeats(prisma, {
          organizationId,
          newCommittedSeats: newSeats,
          topUpAmountCents: topUp,
          paddleSubscriptionId: subscriptionId,
        });
      }
      return;
    }

    const seats = parseCommittedSeats(custom);
    if (seats == null) return;
    const cfg = await getBillingConfig(prisma);
    const amountCents =
      parseAmountCents(data) ?? annualInvoiceTotalCents(seats, cfg.fixedAnnualRoundToTen, cfg.fixedPlanPricing);
    const renewalAt = new Date();
    renewalAt.setUTCFullYear(renewalAt.getUTCFullYear() + 1);
    await provisionFixedPlanSubscription(prisma, {
      organizationId,
      committedSeats: seats,
      annualInvoiceAmountCents: amountCents,
      paddleSubscriptionId: subscriptionId,
      renewalAt,
    });
    return;
  }

  if (cancelEvents.has(eventType)) {
    await downgradeFixedPlanAtPeriodEnd(prisma, organizationId);
  }
}

async function ensurePaddleCustomer(
  org: { id: string; name: string; paddleCustomerId: string | null; invoiceEmail: string | null },
  userEmail: string,
): Promise<string> {
  let customerId = org.paddleCustomerId?.trim() || null;
  if (!customerId) {
    const customer = await createPaddleCustomer({
      organizationId: org.id,
      name: org.name,
      email: org.invoiceEmail || userEmail,
    });
    customerId = customer.id;
    await prisma.organization.update({
      where: { id: org.id },
      data: { paddleCustomerId: customerId },
    });
  }
  return customerId;
}

// Legacy endpoint kept for compatibility after pricing-model migration.
app.get("/billing/packs", async (c) => {
  return c.json({ data: [] });
});

app.post("/billing/checkout", async (c) => {
  return c.json(
    {
      error: {
        message: "Credit checkout has been removed. Billing is now postpaid by monthly invoice.",
        code: "LEGACY_CREDIT_FLOW_REMOVED",
      },
    },
    410,
  );
});

// POST /api/billing/choose-plan — confirm Flex (monthly postpaid); Yearly uses fixed checkout
app.post("/billing/choose-plan", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (user.orgRole !== "owner") {
    return c.json(
      { error: { message: "Only organisation owners can choose a billing plan", code: "FORBIDDEN" } },
      403,
    );
  }

  const body = ChooseBillingPlanRequestSchema.parse(await c.req.json());
  if (body.plan !== "flex") {
    return c.json(
      { error: { message: "Use Yearly checkout to switch to the annual plan", code: "USE_YEARLY_CHECKOUT" } },
      400,
    );
  }

  await prisma.organization.update({
    where: { id: user.organizationId },
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

  return c.json({ data: { billingPlan: "flex" as const } });
});

// POST /api/billing/sandbox/checkout-test — €1 Paddle test (sandbox API only)
app.post("/billing/sandbox/checkout-test", async (c) => {
  if (env.PADDLE_ENV !== "sandbox") {
    return c.json(
      { error: { message: "Sandbox checkout test is only available when PADDLE_ENV=sandbox", code: "NOT_SANDBOX" } },
      403,
    );
  }
  if (!isPaddleConfigured()) {
    return c.json({ error: { message: "Paddle is not configured", code: "PADDLE_NOT_CONFIGURED" } }, 503);
  }

  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (user.orgRole !== "owner") {
    return c.json(
      { error: { message: "Only organisation owners can run sandbox checkout tests", code: "FORBIDDEN" } },
      403,
    );
  }

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { id: true, name: true, paddleCustomerId: true, invoiceEmail: true },
  });
  if (!org) {
    return c.json({ error: { message: "Organization not found", code: "NOT_FOUND" } }, 404);
  }

  try {
    const customerId = await ensurePaddleCustomer(org, user.email);
    const tx = await createPaddleSandboxTestCheckout({
      customerId,
      organizationId: org.id,
    });
    return c.json({
      data: {
        checkoutUrl: tx.checkout?.url ?? null,
        paddleTransactionId: tx.id,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Paddle checkout failed";
    return c.json({ error: { message, code: "PADDLE_CHECKOUT_FAILED" } }, 502);
  }
});

// POST /api/billing/fixed/checkout — annual Fixed plan (org owner)
app.post("/billing/fixed/checkout", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (user.orgRole !== "owner") {
    return c.json({ error: { message: "Only organisation owners can start Fixed checkout", code: "FORBIDDEN" } }, 403);
  }

  const body = FixedCheckoutRequestSchema.parse(await c.req.json());
  const seats = body.seats;
  const cfg = await getBillingConfig(prisma);
  if (requiresEnterpriseContact(seats, cfg.fixedPlanPricing)) {
    return c.json({
      data: {
        checkoutUrl: null,
        annualInvoiceCents: 0,
        seats,
        requiresEnterpriseContact: true,
      },
    });
  }

  const annualCents = annualInvoiceTotalCents(seats, cfg.fixedAnnualRoundToTen, cfg.fixedPlanPricing);

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { id: true, name: true, paddleCustomerId: true, invoiceEmail: true, billingPlan: true },
  });
  if (!org) {
    return c.json({ error: { message: "Organization not found", code: "NOT_FOUND" } }, 404);
  }
  if (org.billingPlan === "fixed") {
    return c.json({ error: { message: "Organization is already on Fixed plan", code: "ALREADY_FIXED" } }, 400);
  }

  try {
    const customerId = await ensurePaddleCustomer(org, user.email);
    const tx = await createPaddleCheckoutForFixedPlan({
      customerId,
      organizationId: org.id,
      seats,
      amountCents: annualCents,
      checkoutKind: "initial",
    });
    return c.json({
      data: {
        checkoutUrl: tx.checkout?.url ?? null,
        paddleTransactionId: tx.id,
        annualInvoiceCents: annualCents,
        seats,
        requiresEnterpriseContact: false,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Paddle checkout failed";
    return c.json({ error: { message, code: "PADDLE_CHECKOUT_FAILED" } }, 502);
  }
});

// GET /api/billing/fixed/seat-increase-quote?newCommittedSeats=
app.get("/billing/fixed/seat-increase-quote", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  const newCommittedSeats = parseInt(c.req.query("newCommittedSeats") || "0", 10);
  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: {
      billingPlan: true,
      committedSeats: true,
      annualRenewalDate: true,
      annualTermStartDate: true,
    },
  });
  if (!org || org.billingPlan !== "fixed" || org.committedSeats == null) {
    return c.json({ error: { message: "Not on Fixed plan", code: "NOT_FIXED" } }, 400);
  }
  if (newCommittedSeats <= org.committedSeats) {
    return c.json({ error: { message: "New seat count must exceed current commitment", code: "BAD_REQUEST" } }, 400);
  }

  const cfg = await getBillingConfig(prisma);
  const renewalAt = org.annualRenewalDate ?? new Date();
  const termStart = org.annualTermStartDate ?? new Date();
  const now = new Date();
  const termMs = Math.max(1, renewalAt.getTime() - termStart.getTime());
  const remainingMs = Math.max(0, renewalAt.getTime() - now.getTime());
  const monthsRemainingFraction = Math.min(1, remainingMs / termMs);

  const topUpCents = proratedSeatIncreaseTopUpCents(
    org.committedSeats,
    newCommittedSeats,
    termStart,
    renewalAt,
    now,
    cfg.fixedAnnualRoundToTen,
    cfg.fixedPlanPricing,
  );

  return c.json({
    data: {
      currentCommittedSeats: org.committedSeats,
      newCommittedSeats,
      topUpCents,
      monthsRemainingFraction,
      requiresEnterpriseContact: requiresEnterpriseContact(newCommittedSeats, cfg.fixedPlanPricing),
    },
  });
});

// POST /api/billing/fixed/seat-increase
app.post("/billing/fixed/seat-increase", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (user.orgRole !== "owner") {
    return c.json({ error: { message: "Only organisation owners can increase Fixed seats", code: "FORBIDDEN" } }, 403);
  }

  const body = FixedSeatIncreaseRequestSchema.parse(await c.req.json());
  const newCommittedSeats = body.newCommittedSeats;
  const cfgEarly = await getBillingConfig(prisma);
  if (requiresEnterpriseContact(newCommittedSeats, cfgEarly.fixedPlanPricing)) {
    return c.json({ error: { message: "Contact us for 150+ seats", code: "ENTERPRISE_REQUIRED" } }, 400);
  }

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: {
      id: true,
      name: true,
      billingPlan: true,
      committedSeats: true,
      annualRenewalDate: true,
      annualTermStartDate: true,
      paddleCustomerId: true,
      invoiceEmail: true,
    },
  });
  if (!org || org.billingPlan !== "fixed" || org.committedSeats == null) {
    return c.json({ error: { message: "Not on Fixed plan", code: "NOT_FIXED" } }, 400);
  }
  if (newCommittedSeats <= org.committedSeats) {
    return c.json({ error: { message: "New seat count must exceed current commitment", code: "BAD_REQUEST" } }, 400);
  }

  const cfg = await getBillingConfig(prisma);
  const renewalAt = org.annualRenewalDate ?? new Date();
  const termStart = org.annualTermStartDate ?? new Date();
  const topUpCents = proratedSeatIncreaseTopUpCents(
    org.committedSeats,
    newCommittedSeats,
    termStart,
    renewalAt,
    new Date(),
    cfg.fixedAnnualRoundToTen,
    cfg.fixedPlanPricing,
  );
  if (topUpCents < 1) {
    return c.json({ error: { message: "Nothing to charge for this change", code: "BAD_REQUEST" } }, 400);
  }

  try {
    const customerId = await ensurePaddleCustomer(org, user.email);
    const tx = await createPaddleCheckoutForFixedTopUp({
      customerId,
      organizationId: org.id,
      currentSeats: org.committedSeats,
      newSeats: newCommittedSeats,
      amountCents: topUpCents,
    });
    return c.json({
      data: { checkoutUrl: tx.checkout?.url ?? null, paddleTransactionId: tx.id, topUpCents },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Paddle checkout failed";
    return c.json({ error: { message, code: "PADDLE_CHECKOUT_FAILED" } }, 502);
  }
});

// GET /api/billing/fixed/temporary-pass-quote?extraSeats=
app.get("/billing/fixed/temporary-pass-quote", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  const parsed = FixedTemporaryPassQuoteRequestSchema.safeParse({
    extraSeats: parseInt(c.req.query("extraSeats") || "0", 10),
  });
  if (!parsed.success) {
    return c.json({ error: { message: "extraSeats must be at least 1", code: "BAD_REQUEST" } }, 400);
  }

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: {
      billingPlan: true,
      committedSeats: true,
      temporarySeatsBoost: true,
      temporarySeatsBoostExpiresAt: true,
    },
  });
  if (!org || org.billingPlan !== "fixed" || org.committedSeats == null) {
    return c.json({ error: { message: "Not on Yearly plan", code: "NOT_FIXED" } }, 400);
  }

  const cfg = await getBillingConfig(prisma);
  const fp = cfg.fixedPlanPricing;
  if (!fp.temporarySeatPassEnabled) {
    return c.json({ error: { message: "Temporary seat passes are disabled", code: "DISABLED" } }, 400);
  }

  const committed = org.committedSeats;
  const now = new Date();
  const effectiveCommitted = effectiveYearlyCommittedSeats(
    committed,
    org.temporarySeatsBoost,
    org.temporarySeatsBoostExpiresAt,
    now,
  );

  return c.json({
    data: {
      extraSeats: parsed.data.extraSeats,
      passDays: fp.temporarySeatPassDays,
      pricePerSeatMajor: fp.temporarySeatPassPricePerSeatMajor,
      totalCents: temporarySeatPassTotalCents(parsed.data.extraSeats, fp),
      effectiveCommittedSeats: effectiveCommitted,
      committedSeats: committed,
      temporarySeatPassEnabled: true,
    },
  });
});

// POST /api/billing/fixed/temporary-pass-checkout
app.post("/billing/fixed/temporary-pass-checkout", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (user.orgRole !== "owner") {
    return c.json({ error: { message: "Only organisation owners can buy seat passes", code: "FORBIDDEN" } }, 403);
  }

  const body = FixedTemporaryPassCheckoutRequestSchema.parse(await c.req.json());
  const cfg = await getBillingConfig(prisma);
  const fp = cfg.fixedPlanPricing;
  if (!fp.temporarySeatPassEnabled) {
    return c.json({ error: { message: "Temporary seat passes are disabled", code: "DISABLED" } }, 400);
  }

  const totalCents = temporarySeatPassTotalCents(body.extraSeats, fp);
  if (totalCents < 1) {
    return c.json({ error: { message: "Nothing to charge for this pass", code: "BAD_REQUEST" } }, 400);
  }

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: {
      id: true,
      name: true,
      billingPlan: true,
      committedSeats: true,
      paddleCustomerId: true,
      invoiceEmail: true,
    },
  });
  if (!org || org.billingPlan !== "fixed" || org.committedSeats == null) {
    return c.json({ error: { message: "Not on Yearly plan", code: "NOT_FIXED" } }, 400);
  }

  try {
    const customerId = await ensurePaddleCustomer(org, user.email);
    const tx = await createPaddleCheckoutForTemporarySeatPass({
      customerId,
      organizationId: org.id,
      extraSeats: body.extraSeats,
      passDays: fp.temporarySeatPassDays,
      amountCents: totalCents,
    });
    return c.json({
      data: {
        checkoutUrl: tx.checkout?.url ?? null,
        paddleTransactionId: tx.id,
        totalCents,
        extraSeats: body.extraSeats,
        passDays: fp.temporarySeatPassDays,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Paddle checkout failed";
    return c.json({ error: { message, code: "PADDLE_CHECKOUT_FAILED" } }, 502);
  }
});

// POST /api/billing/open-invoice/checkout — Flex/monthly open invoice (owner or billing.manage)
app.post("/billing/open-invoice/checkout", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (user.orgRole !== "owner") {
    return c.json(
      { error: { message: "Only organisation owners can open invoice checkout", code: "FORBIDDEN" } },
      403,
    );
  }

  const openInvoice = await prisma.billingInvoice.findFirst({
    where: { organizationId: user.organizationId, status: { in: ["issued", "overdue"] } },
    orderBy: { dueAt: "asc" },
    select: { id: true },
  });
  if (!openInvoice) {
    return c.json({ error: { message: "No open invoice", code: "NOT_FOUND" } }, 404);
  }

  try {
    const result = await syncBillingInvoiceWithPaddle(prisma, openInvoice.id, user.email);
    return c.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Paddle checkout failed";
    return c.json({ error: { message, code: "PADDLE_CHECKOUT_FAILED" } }, 502);
  }
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

  const event = JSON.parse(body) as { event_type?: string; data?: PaddleWebhookData };
  const eventType = event?.event_type || "";
  const data = event?.data;

  if (data) {
    await handleFixedPlanWebhook(eventType, data);

    const customInvoiceId = data.custom_data?.invoiceId?.trim();
    const paddleTransactionId = data.transaction_id || data.id || undefined;
    const paddleInvoiceId = data.invoice_id || data.invoice?.id || undefined;

    const invoice =
      (customInvoiceId ? await prisma.billingInvoice.findUnique({ where: { id: customInvoiceId } }) : null) ??
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
