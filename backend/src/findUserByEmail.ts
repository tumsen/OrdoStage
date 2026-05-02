import type { User } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { isPostgresDatabaseUrl } from "./databaseUrl";

/**
 * Find a user by email with the same rules we use for password reset and invites:
 * trim, strip common invisible chars, case-insensitive match on Postgres, credential accountId,
 * then Postgres trim-aware fallbacks (stored emails sometimes have accidental spaces).
 */
export async function findUserByEmailLoose(raw: string): Promise<User | null> {
  const trimmed = raw.trim().replace(/\u200c|\u200d|\ufeff/g, "");
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const pg = isPostgresDatabaseUrl(process.env.DATABASE_URL);

  if (pg) {
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

  if (!user && pg) {
    const uid = await prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM "User" WHERE lower(trim(both from email)) = ${lower} LIMIT 1`
    );
    if (uid[0]?.id) {
      user = await prisma.user.findUnique({ where: { id: uid[0].id } });
    }
  }

  if (!user && pg) {
    const row = await prisma.$queryRaw<Array<{ userId: string }>>(
      Prisma.sql`
        SELECT "userId" FROM "Account"
        WHERE "providerId" = 'credential'
          AND lower(trim(both from "accountId")) = ${lower}
        LIMIT 1`
    );
    if (row[0]?.userId) {
      user = await prisma.user.findUnique({ where: { id: row[0].userId } });
    }
  }

  return user;
}
