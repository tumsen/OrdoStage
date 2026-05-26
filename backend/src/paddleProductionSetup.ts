import { env } from "./env";
import { ensureOrdoStagePaddleCatalog } from "./paddleCatalog";
import { isPaddleConfigured, normalizePaddleApiKey, paddleBaseUrl } from "./paddleClient";

type PaddleClientToken = { id: string; token: string; name: string; status?: string };
type PaddleNotificationSetting = {
  id: string;
  destination: string;
  endpoint_secret_key: string;
  description?: string;
};

type PaddleErrorBody = {
  error?: { detail?: string; code?: string };
};

type PaddleList<T> = { data: T[] };

async function paddleFetch<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: Record<string, unknown> },
): Promise<T> {
  const key = normalizePaddleApiKey(env.PADDLE_API_KEY);
  if (!key) throw new Error("PADDLE_API_KEY is not configured.");
  const response = await fetch(`${paddleBaseUrl()}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await response.json().catch(() => ({}))) as PaddleErrorBody & { data?: T };
  if (!response.ok || json.data === undefined) {
    const msg = json.error?.detail || json.error?.code || `HTTP ${response.status}`;
    throw new Error(`Paddle ${init.method} ${path}: ${msg}`);
  }
  return json.data;
}

async function paddleFetchList<T>(path: string): Promise<T[]> {
  const key = normalizePaddleApiKey(env.PADDLE_API_KEY);
  const response = await fetch(`${paddleBaseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  const json = (await response.json()) as PaddleList<T> & PaddleErrorBody;
  if (!response.ok) {
    throw new Error(json.error?.detail || `List ${path} failed: HTTP ${response.status}`);
  }
  return json.data ?? [];
}

const WEBHOOK_EVENTS = [
  "transaction.completed",
  "transaction.paid",
  "transaction.payment_failed",
  "transaction.ready",
  "transaction.updated",
  "transaction.created",
  "subscription.activated",
  "subscription.created",
  "subscription.updated",
  "subscription.canceled",
  "subscription.past_due",
  "subscription.resumed",
];

export type PaddleProductionSetupResult = {
  environment: "sandbox" | "live";
  productId: string;
  clientSideToken: string;
  clientTokenCreated: boolean;
  webhookUrl: string;
  webhookSecret: string;
  webhookCreated: boolean;
  frontendUrl: string;
};

export async function setupPaddleProduction(input: {
  webhookBaseUrl: string;
  frontendUrl: string;
}): Promise<PaddleProductionSetupResult> {
  if (!isPaddleConfigured()) {
    throw new Error("PADDLE_API_KEY is not configured.");
  }

  const catalog = await ensureOrdoStagePaddleCatalog();
  const webhookUrl = `${input.webhookBaseUrl.replace(/\/+$/, "")}/api/billing/webhook`;
  const frontendUrl = input.frontendUrl.replace(/\/+$/, "") + "/";

  const tokenName = "OrdoStage production webapp";
  let clientTokenCreated = false;
  let clientSideToken =
    (await paddleFetchList<PaddleClientToken>("/client-tokens?status=active&per_page=50")).find(
      (t) => t.name === tokenName && t.token?.startsWith("live_"),
    )?.token ?? null;

  if (!clientSideToken) {
    const liveToken = (await paddleFetchList<PaddleClientToken>("/client-tokens?status=active&per_page=50")).find((t) =>
      t.token?.startsWith("live_"),
    );
    if (liveToken?.token) {
      clientSideToken = liveToken.token;
    }
  }

  if (!clientSideToken) {
    const created = await paddleFetch<PaddleClientToken>("/client-tokens", {
      method: "POST",
      body: {
        name: tokenName,
        description: "OrdoStage SPA — Paddle.js overlay checkout (www.ordostage.com)",
      },
    });
    clientSideToken = created.token;
    clientTokenCreated = true;
  }

  if (!clientSideToken) {
    throw new Error("Could not obtain a live client-side token from Paddle.");
  }

  const webhookDescription = "OrdoStage Backend billing webhook";
  const existingWebhook = (await paddleFetchList<PaddleNotificationSetting>("/notification-settings?per_page=50")).find(
    (n) => n.destination === webhookUrl || n.description === webhookDescription,
  );

  let webhookSecret: string;
  let webhookCreated = false;

  if (existingWebhook?.endpoint_secret_key) {
    webhookSecret = existingWebhook.endpoint_secret_key;
  } else {
    const created = await paddleFetch<PaddleNotificationSetting>("/notification-settings", {
      method: "POST",
      body: {
        description: webhookDescription,
        type: "url",
        destination: webhookUrl,
        api_version: 1,
        include_sensitive_fields: false,
        subscribed_events: WEBHOOK_EVENTS,
        traffic_source: "platform",
      },
    });
    webhookSecret = created.endpoint_secret_key;
    webhookCreated = true;
  }

  return {
    environment: env.PADDLE_ENV,
    productId: catalog.productId,
    clientSideToken,
    clientTokenCreated,
    webhookUrl,
    webhookSecret,
    webhookCreated,
    frontendUrl,
  };
}
