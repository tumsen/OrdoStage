import { verifyPassword } from "better-auth/crypto";
import type { PrismaClient } from "@prisma/client";

/** Returns true if the password matches the user's credential (email/password) login. */
export async function verifyUserCredentialPassword(
  prisma: PrismaClient,
  userId: string,
  plainPassword: string
): Promise<boolean> {
  const trimmed = plainPassword.trim();
  if (!trimmed) return false;

  const account = await prisma.account.findFirst({
    where: { userId, providerId: "credential" },
    select: { password: true },
  });
  const hash = account?.password;
  if (!hash || typeof hash !== "string") return false;

  return verifyPassword({ hash, password: trimmed });
}
