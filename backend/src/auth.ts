import { generateId } from "@better-auth/core/utils/id";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { prisma } from "./prisma";
import { env } from "./env";
import { sendHtmlEmail } from "./resendMail";
import { sendPasswordResetEmailWithKnownToken } from "./passwordResetFlow";

async function sendOTPEmail(email: string, otp: string) {
  if (!env.RESEND_API_KEY?.trim()) {
    console.warn("[auth] RESEND_API_KEY is not set — OTP email not sent.", email, otp);
    return;
  }
  try {
    await sendHtmlEmail({
      to: email,
      subject: "Your login code",
      html: `<p>Your login code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`,
    });
  } catch (e) {
    console.error("[auth] OTP email failed:", e);
    throw e;
  }
}

function originsFromFrontendUrl(): string[] {
  const raw = env.FRONTEND_URL?.trim();
  if (!raw) return [];
  try {
    return [new URL(raw).origin];
  } catch {
    return [];
  }
}

/**
 * Email/password sign-in uses the first `credential` account row. Multiple rows (invite + reset,
 * etc.) can leave a stale row first; `updatePassword` may still leave ambiguous orders.
 * After reset, delete ALL credential rows and insert exactly ONE row with the freshly updated
 * hash (reuse hash bytes — no plaintext) and `accountId = email`, matching normal sign-up.
 */
async function squashCredentialAccountsAfterReset(user: { id: string; email: string }) {
  const rows = await prisma.account.findMany({
    where: { userId: user.id, providerId: "credential" },
    orderBy: { updatedAt: "desc" },
  });
  if (rows.length === 0) return;
  const hash =
    rows.find((r) => r.password != null && String(r.password).length > 0)?.password ?? null;
  if (!hash) {
    console.error("[auth] squashCredentialAccountsAfterReset: no password hash on credential rows", user.id);
    return;
  }
  const accountId = user.email.trim().toLowerCase();
  const only = rows.length === 1 ? rows[0] : undefined;
  if (only && only.accountId === accountId) return;

  await prisma.$transaction(async (tx) => {
    await tx.account.deleteMany({
      where: { userId: user.id, providerId: "credential" },
    });
    await tx.account.create({
      data: {
        id: generateId(),
        userId: user.id,
        providerId: "credential",
        accountId,
        password: hash,
      },
    });
  });
  console.info("[auth] squashed credential Account to single row for userId=%s", user.id);
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BACKEND_URL,
  trustedOrigins: [
    "http://localhost:*",
    "http://127.0.0.1:*",
    "https://*.railway.app",
    "https://*.up.railway.app",
    "https://ordostage.com",
    "https://www.ordostage.com",
    "https://*.onrender.com",
    ...originsFromFrontendUrl(),
  ],
  emailAndPassword: {
    enabled: true,
    /** Force re-login with the new password; avoids stale sessions after reset. */
    revokeSessionsOnPasswordReset: true,
    async sendResetPassword(payload: { user: { email: string }; token: string; url?: string }) {
      await sendPasswordResetEmailWithKnownToken(payload.user, payload.token);
    },
    async onPasswordReset({ user }) {
      await squashCredentialAccountsAfterReset(user);
    },
  },
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "sign-in") return;
        await sendOTPEmail(email, String(otp));
      },
    }),
  ],
  user: {
    additionalFields: {
      organizationId: {
        type: "string",
        required: false,
        input: false,
      },
      orgRole: {
        type: "string",
        required: false,
        input: false,
      },
      isAdmin: {
        type: "boolean",
        required: false,
        input: false,
      },
    },
  },
  advanced: {
    trustedProxyHeaders: true,
    disableCSRFCheck: true,
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      partitioned: true,
    },
  },
});
