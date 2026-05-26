import { env } from "./env";
import { isPaddleConfigured, paddleBaseUrl, normalizePaddleApiKey } from "./paddleClient";

const PRODUCT_NAME = "OrdoStage";

type PaddleProduct = { id: string; name: string; status?: string };
type PaddlePrice = { id: string; name?: string; description?: string; product_id: string };

type PaddleListResponse<T> = { data: T[] };
type PaddleErrorBody = {
  error?: { detail?: string; code?: string; errors?: Array<{ field?: string; message?: string }> };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function paddleFetch(path: string, init: RequestInit, attempt = 0): Promise<Response> {
  const key = normalizePaddleApiKey(env.PADDLE_API_KEY);
  if (!key) throw new Error("PADDLE_API_KEY is not configured.");
  const response = await fetch(`${paddleBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (response.status === 429 && attempt < 5) {
    const retrySec = parseInt(response.headers.get("Retry-After") || "30", 10);
    await sleep(Math.min(Math.max(retrySec, 5), 120) * 1000);
    return paddleFetch(path, init, attempt + 1);
  }
  return response;
}

async function paddleApi<T>(
  path: string,
  init: { method: "GET" | "POST" | "PATCH"; body?: Record<string, unknown> },
): Promise<T> {
  const response = await paddleFetch(path, {
    method: init.method,
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

async function getProductById(productId: string): Promise<PaddleProduct | null> {
  const response = await paddleFetch(`/products/${encodeURIComponent(productId)}`, { method: "GET" });
  if (response.status === 404) return null;
  const json = (await response.json()) as PaddleErrorBody & { data?: PaddleProduct };
  if (!response.ok || !json.data) return null;
  return json.data;
}

/** One page only — avoids hammering the API when paginating large catalogs. */
async function findProductByName(name: string): Promise<PaddleProduct | undefined> {
  const response = await paddleFetch("/products?status=active&per_page=200", { method: "GET" });
  const json = (await response.json()) as PaddleListResponse<PaddleProduct> & PaddleErrorBody;
  if (!response.ok) {
    throw new Error(json.error?.detail || `List products failed: HTTP ${response.status}`);
  }
  const needle = name.trim().toLowerCase();
  return (json.data ?? []).find((p) => p.name.trim().toLowerCase() === needle);
}

async function createOrdoStageProduct(): Promise<PaddleProduct> {
  return paddleApi<PaddleProduct>("/products", {
    method: "POST",
    body: {
      name: PRODUCT_NAME,
      tax_category: "saas",
      description:
        "Theater and venue production management — Flex (monthly usage) and Yearly (annual seat commitment).",
      type: "standard",
    },
  });
}

async function listPricesForProduct(productId: string): Promise<PaddlePrice[]> {
  return paddleApi<PaddlePrice[]>(`/prices?product_id=${encodeURIComponent(productId)}&status=active&per_page=200`, {
    method: "GET",
  });
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

  const configuredId = env.PADDLE_PRODUCT_ID?.trim();
  let product: PaddleProduct | null | undefined = configuredId ? await getProductById(configuredId) : null;
  let productCreated = false;

  if (!product) {
    product = await findProductByName(PRODUCT_NAME);
  }

  if (!product) {
    product = await createOrdoStageProduct();
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
