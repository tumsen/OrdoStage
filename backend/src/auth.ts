import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { prisma } from "./prisma";
import { env } from "./env";

async function sendOTPEmail(email: string, otp: string) {
  if (env.RESEND_API_KEY) {
    // Production: use Resend
    const { Resend } = await import("resend");
    const resend = new Resend(env.RESEND_API_KEY);
    await resend.emails.send({
      from: env.FROM_EMAIL || "OrdoStage <noreply@ordostage.com>",
      to: email,
      subject: "Your login code",
      html: `<p>Your login code is: <strong>${otp}</strong></p><p>This code expires in 10 minutes.</p>`,
    });
  } else {
    // Development (Vibecode): use Vibecode SDK
    try {
      const { createVibecodeSDK } = await import("@vibecodeapp/backend-sdk");
      const vibecode = createVibecodeSDK();
      await vibecode.email.sendOTP({
        to: email,
        code: otp,
        fromName: "OrdoStage",
        lang: "en",
      });
    } catch {
      console.log(`[DEV] OTP for ${email}: ${otp}`);
    }
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
    "https://*.dev.vibecode.run",
    "https://*.vibecode.run",
    "https://*.vibecodeapp.com",
    "https://*.vibecode.dev",
    "https://vibecode.dev",
    "https://*.railway.app",
    "https://*.up.railway.app",
    "https://ordostage.com",
    "https://www.ordostage.com",
    "https://*.onrender.com",
  ],
  emailAndPassword: {
    enabled: true,
    async sendResetPassword({ user, token }: { user: { email: string }; token: string }) {
      const frontendUrl = env.FRONTEND_URL || env.BACKEND_URL;
      const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
      if (env.RESEND_API_KEY) {
        const { Resend } = await import("resend");
        const resend = new Resend(env.RESEND_API_KEY);
        await resend.emails.send({
          from: env.FROM_EMAIL || "OrdoStage <noreply@ordostage.com>",
          to: user.email,
          subject: "Reset your password",
          html: `<p>Click the link below to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p>`,
        });
      } else {
        console.log(`[DEV] Password reset link for ${user.email}: ${resetUrl}`);
      }
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
