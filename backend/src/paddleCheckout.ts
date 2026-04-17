import { prisma } from "./prisma";
import { env } from "./env";

const paddleApiBase =
  env.PADDLE_ENV === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";

export function isPaddleConfigured(): boolean {
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

  const json = (await res.json().catch(() => null)) as { error?: { detail?: string; message?: string } } | null;
  if (!res.ok) {
    throw new Error(
      json?.error?.detail || json?.error?.message || `Paddle API request failed with ${res.status}`
    );
  }

  return json as T;
}

export async function createPaddleCheckoutUrl(params: {
  organizationId: string;
  packId: string;
  origin: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const pack = await prisma.pricePack.findUnique({
    where: { packId: params.packId, active: true },
  });
  if (!pack) {
    throw new Error("Invalid pack");
  }

  const org = await prisma.organization.findUnique({
    where: { id: params.organizationId },
    select: { discountPercent: true },
  });

  const discountPercent = Math.max(0, Math.min(100, org?.discountPercent ?? 0));
  const discountedAmountCents =
    discountPercent > 0
      ? Math.max(1, Math.round((pack.amountCents * (100 - discountPercent)) / 100))
      : pack.amountCents;

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
        organizationId: params.organizationId,
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
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    }),
  });

  return checkout.data.url;
}
