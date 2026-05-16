import { env } from "./env";

type PaddleCustomer = {
  id: string;
};

type PaddleTransaction = {
  id: string;
  checkout?: { url?: string | null } | null;
  invoice?: { id?: string | null } | null;
};

function paddleBaseUrl(): string {
  return env.PADDLE_ENV === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
}

function requirePaddleApiKey(): string {
  const key = env.PADDLE_API_KEY?.trim();
  if (!key) {
    throw new Error("PADDLE_API_KEY is not configured.");
  }
  return key;
}

async function paddleRequest<T>(path: string, init: { method: "GET" | "POST"; body?: Record<string, unknown> }): Promise<T> {
  const key = requirePaddleApiKey();
  const response = await fetch(`${paddleBaseUrl()}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await response.json().catch(() => ({}))) as { data?: T; error?: { detail?: string; type?: string } };
  if (!response.ok || !json.data) {
    const detail = json.error?.detail || json.error?.type || `HTTP ${response.status}`;
    throw new Error(`Paddle API request failed: ${detail}`);
  }
  return json.data;
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
  const amount = Math.max(0, Math.round(input.amountCents)).toString();
  const currencyCode = (input.currencyCode ?? "EUR").toUpperCase();
  const seats = Math.max(1, Math.round(input.seats));
  return paddleRequest<PaddleTransaction>("/transactions", {
    method: "POST",
    body: {
      customer_id: input.customerId,
      collection_mode: "automatic",
      currency_code: currencyCode,
      items: [
        {
          quantity: 1,
          price: {
            name: `OrdoStage Fixed — ${seats} seats (annual)`,
            description: `12-month committed seats (${seats}). Extra seats above commitment billed monthly at Flex marginal rates.`,
            unit_price: {
              amount,
              currency_code: currencyCode,
            },
            billing_cycle: {
              interval: "year",
              frequency: 1,
            },
          },
        },
      ],
      custom_data: {
        organizationId: input.organizationId,
        billingPlan: "fixed",
        checkoutKind: input.checkoutKind ?? "initial",
        committedSeats: String(seats),
      },
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
  const amount = Math.max(0, Math.round(input.amountCents)).toString();
  const currencyCode = (input.currencyCode ?? "EUR").toUpperCase();
  return paddleRequest<PaddleTransaction>("/transactions", {
    method: "POST",
    body: {
      customer_id: input.customerId,
      collection_mode: "automatic",
      currency_code: currencyCode,
      items: [
        {
          quantity: 1,
          price: {
            name: `OrdoStage Fixed — seat increase (${input.currentSeats} → ${input.newSeats})`,
            description: "Prorated top-up for the remainder of the annual term.",
            unit_price: {
              amount,
              currency_code: currencyCode,
            },
          },
        },
      ],
      custom_data: {
        organizationId: input.organizationId,
        billingPlan: "fixed",
        checkoutKind: "topup",
        committedSeats: String(input.currentSeats),
        newCommittedSeats: String(input.newSeats),
        topUpCents: amount,
      },
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
  const amount = Math.max(0, Math.round(input.amountCents)).toString();
  const currencyCode = input.currencyCode.toUpperCase();
  return paddleRequest<PaddleTransaction>("/transactions", {
    method: "POST",
    body: {
      customer_id: input.customerId,
      collection_mode: "manual",
      currency_code: currencyCode,
      items: [
        {
          quantity: 1,
          price: {
            name: `OrdoStage monthly usage (${input.periodLabel})`,
            description: `Usage-based billing for ${input.organizationName}`,
            unit_price: {
              amount,
              currency_code: currencyCode,
            },
          },
        },
      ],
      custom_data: {
        invoiceId: input.invoiceId,
      },
    },
  });
}
