import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { createPasswordResetTokenAndSendEmail } from "../passwordResetFlow";

const ACCOUNT_DELETE_PHRASE = "DELETE";

/**
 * DELETE /api/me/account — irreversible; body must be { phrase: "DELETE" }
 */
const accountRouter = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

const PasswordResetEmailSchema = z.object({
  /** Avoid strict RFC parsing differing between clients; normalize server-side */
  email: z
    .string()
    .trim()
    .min(3)
    .max(254)
    .refine((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), { message: "Invalid email address" }),
});

/** Public — returns generic message when email unknown; surfaces Resend/config errors to the client. */
accountRouter.post(
  "/account/request-password-reset",
  zValidator("json", PasswordResetEmailSchema),
  async (c) => {
    const email = c.req.valid("json").email.trim().toLowerCase();
    const generic = {
      data: {
        status: true as const,
        message: "If this email exists in our system, check your email for the reset link.",
      },
    };

    try {
      const sent = await createPasswordResetTokenAndSendEmail(email);
      if (!sent) {
        console.info("[password-reset] no user matches this email; generic response (enumeration-safe)");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("RESEND_API_KEY") || msg.includes("FROM_EMAIL")) {
        return c.json(
          {
            error: {
              message:
                "Password reset email is not configured on the server (RESEND_API_KEY / FROM_EMAIL).",
              code: "EMAIL_UNAVAILABLE",
            },
          },
          503
        );
      }
      console.error("[account] request-password-reset:", e);
      return c.json(
        {
          error: {
            message: "We could not send the email. Try again later or contact support.",
            code: "EMAIL_SEND_FAILED",
          },
        },
        502
      );
    }

    return c.json(generic);
  }
);

accountRouter.delete("/me/account", async (c) => {
  const sessionUser = c.get("user");
  if (!sessionUser?.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  let body: { phrase?: string };
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  if (body.phrase !== ACCOUNT_DELETE_PHRASE) {
    return c.json(
      {
        error: {
          message: `Confirmation phrase required: send JSON { "phrase": "${ACCOUNT_DELETE_PHRASE}" }`,
          code: "BAD_REQUEST",
        },
      },
      400
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { id: true, organizationId: true, orgRole: true },
  });
  if (!user) {
    return c.json({ error: { message: "User not found", code: "NOT_FOUND" } }, 404);
  }

  const orgId = user.organizationId;
  if (orgId) {
    const memberCount = await prisma.user.count({ where: { organizationId: orgId } });
    if (user.orgRole === "owner" && memberCount > 1) {
      return c.json(
        {
          error: {
            message: "Transfer ownership to another member before deleting your account.",
            code: "OWNER_MUST_TRANSFER",
          },
        },
        400
      );
    }
  }

  await prisma.session.deleteMany({ where: { userId: user.id } });
  await prisma.account.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });

  if (orgId) {
    const left = await prisma.user.count({ where: { organizationId: orgId } });
    if (left === 0) {
      await prisma.organization.delete({ where: { id: orgId } });
    }
  }

  return new Response(null, { status: 204 });
});

export default accountRouter;
