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
  ],
  emailAndPassword: {
    enabled: true,
    async sendResetPassword({ user, token }: { user: { email: string }; token: string }) {
      await sendPasswordResetEmailWithKnownToken(user, token);
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
