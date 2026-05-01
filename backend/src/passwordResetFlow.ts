import { generateId } from "@better-auth/core/utils/id";
import { prisma } from "./prisma";
import { env } from "./env";
import { isPostgresDatabaseUrl } from "./databaseUrl";
import { appOriginForEmailLinks, sendHtmlEmail } from "./resendMail";

const RESET_TOKEN_TTL_MS = 3600 * 1000;

async function findUserByEmailLoose(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email: trimmed } });
  if (!user && lower !== trimmed) {
    user = await prisma.user.findUnique({ where: { email: lower } });
  }
  if (!user && isPostgresDatabaseUrl(process.env.DATABASE_URL)) {
    user = await prisma.user.findFirst({
      where: { email: { equals: trimmed, mode: "insensitive" } },
    });
  }
  return user;
}

function resetEmailHtml(resetUrl: string): string {
  return `<p>Use the link below to <strong>choose a password</strong> for your account (or reset it if you forgot it).</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>On the sign-in page, use <strong>Forgot password</strong> any time to get a new link. This link expires in 1 hour.</p>`;
}

/**
 * Better Auth already created `Verification` for this token — only send the email (SPA link).
 * Errors still get swallowed by Better Auth’s wrapper; used for compatibility if something calls `/api/auth/request-password-reset`.
 */
export async function sendPasswordResetEmailWithKnownToken(user: { email: string }, token: string): Promise<void> {
  const origin = appOriginForEmailLinks();
  const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}`;

  if (!env.RESEND_API_KEY?.trim()) {
    if (env.NODE_ENV === "production") {
      console.error("[passwordReset] RESEND_API_KEY is not set — cannot send reset email.");
      throw new Error("RESEND_API_KEY is not configured");
    }
    console.warn("[passwordReset] RESEND_API_KEY unset — dev reset link:", user.email, resetUrl);
    return;
  }

  await sendHtmlEmail({
    to: user.email,
    subject: "Set or reset your OrdoStage password",
    html: resetEmailHtml(resetUrl),
  });
}

/**
 * Create a Better Auth–compatible verification row and send the reset email.
 * @returns false if no user exists (enumeration-safe callers still return a generic success message).
 * @throws if email cannot be sent in production or Resend returns an error (caller maps to HTTP errors).
 */
export async function createPasswordResetTokenAndSendEmail(emailInput: string): Promise<boolean> {
  const user = await findUserByEmailLoose(emailInput);
  if (!user) return false;

  const token = generateId(24);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await prisma.verification.create({
    data: {
      id: generateId(),
      identifier: `reset-password:${token}`,
      value: user.id,
      expiresAt,
    },
  });

  const origin = appOriginForEmailLinks();
  const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}`;

  if (!env.RESEND_API_KEY?.trim()) {
    if (env.NODE_ENV === "production") {
      await prisma.verification.deleteMany({ where: { identifier: `reset-password:${token}` } });
      throw new Error("RESEND_API_KEY is not configured");
    }
    console.warn("[passwordReset] RESEND_API_KEY unset — dev reset link:", user.email, resetUrl);
    return true;
  }

  try {
    await sendHtmlEmail({
      to: user.email,
      subject: "Set or reset your OrdoStage password",
      html: resetEmailHtml(resetUrl),
    });
  } catch (e) {
    await prisma.verification.deleteMany({ where: { identifier: `reset-password:${token}` } });
    throw e;
  }

  return true;
}
