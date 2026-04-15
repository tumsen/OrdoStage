import { type Context, type Next } from "hono";
import { prisma } from "./prisma";
import { env } from "./env";
import { auth } from "./auth";

type Variables = { user: typeof auth.$Infer.Session.user | null };

export async function adminMiddleware(
  c: Context<{ Variables: Variables }>,
  next: Next
) {
  const user = c.get("user");
  if (!user)
    return c.json(
      { error: { message: "Unauthorized", code: "UNAUTHORIZED" } },
      401
    );

  // Check isAdmin flag OR ADMIN_EMAILS env var
  const adminEmails = env.ADMIN_EMAILS.split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  const isAdmin = (user as any).isAdmin || adminEmails.includes(user.email);

  if (!isAdmin)
    return c.json(
      { error: { message: "Forbidden", code: "FORBIDDEN" } },
      403
    );

  // Auto-promote to admin if in ADMIN_EMAILS
  if (!(user as any).isAdmin && adminEmails.includes(user.email)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { isAdmin: true },
    });
  }

  await next();
}
