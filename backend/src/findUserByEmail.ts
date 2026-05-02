import type { User } from "@prisma/client";
import { prisma } from "./prisma";
import { isPostgresDatabaseUrl } from "./databaseUrl";

/**
 * Find a user by email with the same rules we use for password reset and invites:
 * trim, strip common invisible chars, case-insensitive match on Postgres, then credential accountId.
 */
export async function findUserByEmailLoose(raw: string): Promise<User | null> {
  const trimmed = raw.trim().replace(/\u200c|\u200d|\ufeff/g, "");
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  if (isPostgresDatabaseUrl(process.env.DATABASE_URL)) {
    const byInsensitive = await prisma.user.findFirst({
      where: { email: { equals: trimmed, mode: "insensitive" } },
    });
    if (byInsensitive) return byInsensitive;
  }

  let user = await prisma.user.findUnique({ where: { email: lower } });
  if (!user && lower !== trimmed) {
    user = await prisma.user.findUnique({ where: { email: trimmed } });
  }
  if (!user) {
    const acct = await prisma.account.findFirst({
      where: {
        providerId: "credential",
        OR: [{ accountId: lower }, { accountId: trimmed }],
      },
      select: { userId: true },
    });
    if (acct) {
      user = await prisma.user.findUnique({ where: { id: acct.userId } });
    }
  }
  return user;
}
