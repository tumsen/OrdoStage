import { env } from "./env";
import { isPaddleConfigured, paddleBaseUrl, normalizePaddleApiKey } from "./paddleClient";

const PRODUCT_NAME = "OrdoStage";

type PaddleProduct = { id: string; name: string; status?: string };
type PaddlePrice = { id: string; name?: string; description?: string; product_id: string };

type PaddleListResponse<T> = { data: T[]; meta?: { pagination?: { has_more?: boolean; next?: string } } };

type PaddleErrorBody = {
  error?: { detail?: string; code?: string; errors?: Array<{ field?: string; message?: string }> };
};

async function paddleApi<T>(
  path: string,
  init: { method: "GET" | "POST" | "PATCH"; body?: Record<string, unknown> },
): Promise<T> {
  const key = normalizePaddleApiKey(env.PADDLE_API_KEY);
  if (!key) throw new Error("PADDLE_API_KEY is not configured.");
  const response = await fetch(`${paddleBaseUrl()}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await response.json().catch(() => ({}))) as PaddleErrorBody & { data?: T };
  if (!response.ok || json.data === undefined) {
    const err = json.error;
    const msg = err?.detail || err?.code || `HTTP ${response.status}`;
    throw new Error(`Paddle API ${init.method} ${path} failed: ${msg}`);
  }
  return json.data;
}

async function listProducts(): Promise<PaddleProduct[]> {
  const out: PaddleProduct[] = [];
  let path: string | null = "/products?status=active&per_page=200";
  while (path) {
    const key = normalizePaddleApiKey(env.PADDLE_API_KEY);
    const response = await fetch(`${paddleBaseUrl()}${path}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    const json = (await response.json()) as PaddleListResponse<PaddleProduct> & PaddleErrorBody;
    if (!response.ok) {
      throw new Error(json.error?.detail || `List products failed: HTTP ${response.status}`);
    }
    out.push(...(json.data ?? []));
    const next = json.meta?.pagination?.next;
    path = next ? next.replace(paddleBaseUrl(), "") : null;
  }
  return out;
}

async function listPricesForProduct(productId: string): Promise<PaddlePrice[]> {
  return paddleApi<PaddlePrice[]>(`/prices?product_id=${encodeURIComponent(productId)}&status=active&per_page=200`, {
    method: "GET",
  });
}

function findProductByName(products: PaddleProduct[], name: string): PaddleProduct | undefined {
  return products.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
}

export type PaddleCatalogSetupResult = {
  environment: "sandbox" | "live";
  productId: string;
  productCreated: boolean;
  prices: Array<{ id: string; description: string; created: boolean }>;
};

/**
 * Ensures OrdoStage exists in the Paddle product catalog with reference prices.
 * Checkout still uses dynamic inline amounts tied to this product_id.
 */
export async function ensureOrdoStagePaddleCatalog(): Promise<PaddleCatalogSetupResult> {
  if (!isPaddleConfigured()) {
    throw new Error("PADDLE_API_KEY is not configured.");
  }

  const existing = await listProducts();
  let product = findProductByName(existing, PRODUCT_NAME);
  let productCreated = false;

  if (!product) {
    product = await paddleApi<PaddleProduct>("/products", {
      method: "POST",
      body: {
        name: PRODUCT_NAME,
        tax_category: "saas",
        description:
          "Theater and venue production management — Flex (monthly usage) and Yearly (annual seat commitment).",
        type: "standard",
      },
    });
    productCreated = true;
  }

  const productId = product.id;
  const currentPrices = await listPricesForProduct(productId).catch(() => [] as PaddlePrice[]);

  const desiredPrices: Array<{
    key: string;
    name: string;
    catalogDescription: string;
    amountCents: number;
    billingCycle?: { interval: "year" | "month"; frequency: number };
  }> = [
    {
      key: "flex_monthly_usage",
      name: "Flex — monthly usage",
      catalogDescription: "Postpaid monthly invoice for billable seats (amount set per invoice at checkout).",
      amountCents: 3000,
    },
    {
      key: "yearly_seat_commitment",
      name: "Yearly — annual seat commitment",
      catalogDescription: "Annual upfront payment for committed seats (amount set at checkout from seat count).",
      amountCents: 10000,
      billingCycle: { interval: "year", frequency: 1 },
    },
  ];

  const prices: PaddleCatalogSetupResult["prices"] = [];

  for (const spec of desiredPrices) {
    const match = currentPrices.find((p) => p.name?.trim() === spec.name);
    if (match) {
      prices.push({ id: match.id, description: spec.key, created: false });
      continue;
    }

    const created = await paddleApi<PaddlePrice>("/prices", {
      method: "POST",
      body: {
        product_id: productId,
        description: spec.catalogDescription,
        name: spec.name,
        tax_mode: "account_setting",
        unit_price: {
          amount: String(spec.amountCents),
          currency_code: "EUR",
        },
        ...(spec.billingCycle ? { billing_cycle: spec.billingCycle } : {}),
        type: "standard",
      },
    });
    prices.push({ id: created.id, description: spec.key, created: true });
  }

  return {
    environment: env.PADDLE_ENV,
    productId,
    productCreated,
    prices,
  };
}
