import { initializePaddle, type Paddle } from "@paddle/paddle-js";

export type PaddleCheckoutInput = {
  paddleTransactionId?: string | null;
  checkoutUrl?: string | null;
};

let paddleInit: Promise<Paddle | undefined> | null = null;

function clientToken(): string | undefined {
  const raw = import.meta.env.VITE_PADDLE_CLIENT_TOKEN?.trim();
  return raw || undefined;
}

/** Paddle.js environment; defaults to production (live). Set VITE_PADDLE_ENV=sandbox only for Paddle sandbox accounts. */
export function paddleJsEnvironment(): "sandbox" | "production" {
  const raw = import.meta.env.VITE_PADDLE_ENV?.trim().toLowerCase();
  if (raw === "sandbox") return "sandbox";
  return "production";
}

export function isPaddleJsConfigured(): boolean {
  return Boolean(clientToken());
}

export async function getPaddle(): Promise<Paddle | undefined> {
  const token = clientToken();
  if (!token) return undefined;
  if (!paddleInit) {
    paddleInit = initializePaddle({
      environment: paddleJsEnvironment(),
      token,
    });
  }
  return paddleInit;
}

/**
 * Open Paddle Checkout overlay when Paddle.js is configured (client-side token),
 * otherwise fall back to the hosted checkout URL from the API.
 */
export async function openPaddleCheckout(input: PaddleCheckoutInput): Promise<"overlay" | "redirect" | "unavailable"> {
  const transactionId = input.paddleTransactionId?.trim();
  if (transactionId) {
    const paddle = await getPaddle();
    if (paddle) {
      paddle.Checkout.open({ transactionId });
      return "overlay";
    }
  }

  const url = input.checkoutUrl?.trim();
  if (url) {
    window.location.href = url;
    return "redirect";
  }

  return "unavailable";
}
