import { prisma } from "./prisma";
import { createPaddleCheckoutUrl, isPaddleConfigured } from "./paddleCheckout";

const PENDING_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * When balance is at or below the threshold and auto top-up is enabled, create a Paddle checkout
 * and store its URL so the client can prompt the user to pay (Paddle still requires checkout).
 */
export async function maybeEnqueueAutoTopUp(organizationId: string, origin: string): Promise<void> {
  if (!isPaddleConfigured()) return;

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
  });
  if (!org || org.unlimitedCredits || !org.autoTopUpEnabled || !org.autoTopUpPackId) return;
  if (org.creditBalance > org.autoTopUpThreshold) return;

  const now = Date.now();
  if (org.pendingAutoTopUpUrl && org.pendingAutoTopUpCreatedAt) {
    if (now - org.pendingAutoTopUpCreatedAt.getTime() < PENDING_COOLDOWN_MS) return;
  }

  if (org.autoTopUpLastAttemptAt && now - org.autoTopUpLastAttemptAt.getTime() < PENDING_COOLDOWN_MS) {
    if (org.pendingAutoTopUpUrl) return;
  }

  try {
    const base = origin.replace(/\/$/, "");
    const url = await createPaddleCheckoutUrl({
      organizationId,
      packId: org.autoTopUpPackId,
      origin,
      successUrl: `${base}/billing?success=1&auto_topup=1`,
      cancelUrl: `${base}/billing?cancelled=1`,
    });

    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        pendingAutoTopUpUrl: url,
        pendingAutoTopUpCreatedAt: new Date(),
        autoTopUpLastAttemptAt: new Date(),
      },
    });
  } catch (e) {
    console.error("[autoTopUp]", e);
  }
}
