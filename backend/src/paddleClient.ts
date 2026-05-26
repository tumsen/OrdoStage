import { env } from "./env";

type PaddleCustomer = {
  id: string;
};

type PaddleTransaction = {
  id: string;
  status?: string;
  checkout?: { url?: string | null } | null;
  invoice?: { id?: string | null } | null;
};

type PaddleErrorBody = {
  error?: {
    detail?: string;
    type?: string;
    code?: string;
    errors?: Array<{ field?: string; message?: string }>;
  };
};

export function paddleBaseUrl(): string {
  return env.PADDLE_ENV === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
}

export function isPaddleConfigured(): boolean {
  return Boolean(normalizePaddleApiKey(env.PADDLE_API_KEY));
}

export function getPaddlePublicInfo(): { configured: boolean; environment: "sandbox" | "live" } {
  return {
    configured: isPaddleConfigured(),
    environment: env.PADDLE_ENV,
  };
}

export function normalizePaddleApiKey(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return "";
  return trimmed.replace(/^Bearer\s+/i, "");
}

function requirePaddleApiKey(): string {
  const key = normalizePaddleApiKey(env.PADDLE_API_KEY);
  if (!key) {
    throw new Error("PADDLE_API_KEY is not configured.");
  }
  return key;
}

function formatPaddleError(json: PaddleErrorBody, httpStatus: number): string {
  const err = json.error;
  const parts: string[] = [];
  if (err?.code) parts.push(err.code);
  if (err?.detail) parts.push(err.detail);
  if (err?.errors?.length) {
    parts.push(
      err.errors
        .map((e) => (e.field ? `${e.field}: ${e.message ?? ""}` : e.message))
        .filter(Boolean)
        .join("; "),
    );
  }
  if (parts.length > 0) return `Paddle API request failed: ${parts.join(" — ")}`;
  return `Paddle API request failed: HTTP ${httpStatus}`;
}

async function paddleRequest<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: Record<string, unknown> },
): Promise<T> {
  const key = requirePaddleApiKey();
  const response = await fetch(`${paddleBaseUrl()}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await response.json().catch(() => ({}))) as PaddleErrorBody & { data?: T };
  if (!response.ok || !json.data) {
    throw new Error(formatPaddleError(json, response.status));
  }
  return json.data;
}

/** Inline (non-catalog) prices; uses catalog product_id when PADDLE_PRODUCT_ID is set. */
function inlinePriceItem(input: {
  name: string;
  description: string;
  amountCents: number;
  currencyCode: string;
  billingCycle?: { interval: "year" | "month"; frequency: number };
}) {
  const amount = Math.max(0, Math.round(input.amountCents)).toString();
  const currencyCode = input.currencyCode.toUpperCase();
  const catalogProductId = env.PADDLE_PRODUCT_ID?.trim();
  const price: Record<string, unknown> = {
    name: input.name,
    description: input.description,
    unit_price: {
      amount,
      currency_code: currencyCode,
    },
    ...(catalogProductId
      ? { product_id: catalogProductId }
      : {
          product: {
            name: "OrdoStage",
            description: "Theater and venue production management",
            tax_category: "saas",
          },
        }),
  };
  if (input.billingCycle) {
    price.billing_cycle = input.billingCycle;
  }
  return {
    quantity: 1,
    price,
  };
}

export async function resolveTransactionCheckoutUrl(transactionId: string): Promise<string | null> {
  const tx = await paddleRequest<PaddleTransaction>(`/transactions/${transactionId}`, { method: "GET" });
  return tx.checkout?.url?.trim() || null;
}

async function createTransaction(body: Record<string, unknown>): Promise<PaddleTransaction> {
  const tx = await paddleRequest<PaddleTransaction>("/transactions", { method: "POST", body });
  if (!tx.checkout?.url?.trim() && tx.id) {
    const url = await resolveTransactionCheckoutUrl(tx.id).catch(() => null);
    if (url) {
      return { ...tx, checkout: { url } };
    }
  }
  return tx;
}

export async function createPaddleCustomer(input: {
  organizationId: string;
  name: string;
  email?: string | null;
}): Promise<PaddleCustomer> {
  const payload: Record<string, unknown> = {
    name: input.name,
    custom_data: { organizationId: input.organizationId },
  };
  if (input.email?.trim()) payload.email = input.email.trim().toLowerCase();
  return paddleRequest<PaddleCustomer>("/customers", { method: "POST", body: payload });
}

/** Annual Fixed plan checkout — custom total from seat curve (not catalog unit × qty). */
export async function createPaddleCheckoutForFixedPlan(input: {
  customerId: string;
  organizationId: string;
  seats: number;
  amountCents: number;
  currencyCode?: string;
  checkoutKind?: "initial" | "topup";
}): Promise<PaddleTransaction> {
  const currencyCode = (input.currencyCode ?? "EUR").toUpperCase();
  const seats = Math.max(1, Math.round(input.seats));
  return createTransaction({
    customer_id: input.customerId,
    collection_mode: "automatic",
    currency_code: currencyCode,
    items: [
      inlinePriceItem({
        name: `OrdoStage Yearly — ${seats} seats (annual)`,
        description: `12-month committed seats (${seats}). Overage above commitment billed monthly at Flex rates.`,
        amountCents: input.amountCents,
        currencyCode,
        billingCycle: { interval: "year", frequency: 1 },
      }),
    ],
    custom_data: {
      organizationId: input.organizationId,
      billingPlan: "fixed",
      checkoutKind: input.checkoutKind ?? "initial",
      committedSeats: String(seats),
    },
  });
}

export async function createPaddleCheckoutForFixedTopUp(input: {
  customerId: string;
  organizationId: string;
  currentSeats: number;
  newSeats: number;
  amountCents: number;
  currencyCode?: string;
}): Promise<PaddleTransaction> {
  const currencyCode = (input.currencyCode ?? "EUR").toUpperCase();
  return createTransaction({
    customer_id: input.customerId,
    collection_mode: "automatic",
    currency_code: currencyCode,
    items: [
      inlinePriceItem({
        name: `OrdoStage Yearly — seat increase (${input.currentSeats} → ${input.newSeats})`,
        description: "Prorated top-up for the remainder of the annual term.",
        amountCents: input.amountCents,
        currencyCode,
      }),
    ],
    custom_data: {
      organizationId: input.organizationId,
      billingPlan: "fixed",
      checkoutKind: "topup",
      committedSeats: String(input.currentSeats),
      newCommittedSeats: String(input.newSeats),
      topUpCents: String(Math.max(0, Math.round(input.amountCents))),
    },
  });
}

export async function createPaddleCheckoutForTemporarySeatPass(input: {
  customerId: string;
  organizationId: string;
  extraSeats: number;
  passDays: number;
  amountCents: number;
  currencyCode?: string;
}): Promise<PaddleTransaction> {
  const currencyCode = (input.currencyCode ?? "EUR").toUpperCase();
  const extra = Math.max(1, Math.round(input.extraSeats));
  const days = Math.max(1, Math.round(input.passDays));
  return createTransaction({
    customer_id: input.customerId,
    collection_mode: "automatic",
    currency_code: currencyCode,
    items: [
      inlinePriceItem({
        name: `OrdoStage Yearly — ${extra} extra seat${extra === 1 ? "" : "s"} (${days} days)`,
        description: `Short-term seat pass above your Yearly commitment for ${days} days.`,
        amountCents: input.amountCents,
        currencyCode,
      }),
    ],
    custom_data: {
      organizationId: input.organizationId,
      billingPlan: "fixed",
      checkoutKind: "temporary_pass",
      extraSeats: String(extra),
      passDays: String(days),
      passCents: String(Math.max(0, Math.round(input.amountCents))),
    },
  });
}

export async function createPaddleTransactionForInvoice(input: {
  customerId: string;
  invoiceId: string;
  organizationName: string;
  periodLabel: string;
  amountCents: number;
  currencyCode: string;
}): Promise<PaddleTransaction> {
  const currencyCode = input.currencyCode.toUpperCase();
  return createTransaction({
    customer_id: input.customerId,
    collection_mode: "automatic",
    currency_code: currencyCode,
    items: [
      inlinePriceItem({
        name: `OrdoStage monthly usage (${input.periodLabel})`,
        description: `Usage-based billing for ${input.organizationName}`,
        amountCents: input.amountCents,
        currencyCode,
      }),
    ],
    custom_data: {
      invoiceId: input.invoiceId,
    },
  });
}
