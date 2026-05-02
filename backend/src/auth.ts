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
 * Better Auth sign-in uses `accounts.find(p => p.providerId === "credential")` (first match).
 * Duplicate credential rows (e.g. invited user + password reset) can leave a stale row first
 * and break login even after a successful reset. Keep a single row, preferring accountId = email.
 */
async function dedupeCredentialAccounts(userId: string, email: string) {
  const rows = await prisma.account.findMany({
    where: { userId, providerId: "credential" },
    orderBy: { updatedAt: "desc" },
  });
  if (rows.length <= 1) return;
  const emailLower = email.trim().toLowerCase();
  const keeper: (typeof rows)[0] =
    rows.find((r) => r.accountId === emailLower) ??
    rows.find((r) => r.password != null && String(r.password).length > 0) ??
    rows[0]!;
  const dropIds = rows.filter((r) => r.id !== keeper.id).map((r) => r.id);
  if (dropIds.length > 0) {
    await prisma.account.deleteMany({ where: { id: { in: dropIds } } });
    console.info("[auth] removed duplicate credential Account row(s) for userId=%s", userId);
  }
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
      await dedupeCredentialAccounts(user.id, user.email);
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
