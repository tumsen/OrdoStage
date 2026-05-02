import type { User } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { isPostgresDatabaseUrl } from "./databaseUrl";

/**
 * Find a user by email for password reset and invites:
 * User.email / credential accountId (with trim fallbacks on Postgres), then — when still unmatched —
 * a **directory Person** row whose email equals the input and sits in an org the user belongs to
 * (`User.organizationId` or `OrganizationMembership`). Only used when that resolves to exactly one User.
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

  if (!user && pg) {
    const viaPerson = await prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`
        SELECT DISTINCT u.id
        FROM "User" u
        WHERE EXISTS (
          SELECT 1
          FROM "Person" p
          WHERE p.email IS NOT NULL
            AND trim(both from p.email) <> ''
            AND lower(trim(both from p.email)) = ${lower}
            AND (
              (u."organizationId" IS NOT NULL AND p."organizationId" = u."organizationId")
              OR EXISTS (
                SELECT 1 FROM "OrganizationMembership" m
                WHERE m."userId" = u.id
                  AND m."organizationId" = p."organizationId"
              )
            )
        )
      `
    );
    if (viaPerson.length === 1 && viaPerson[0]?.id) {
      console.info("[findUserByEmail] matched User via Person directory email (single org link)");
      user = await prisma.user.findUnique({ where: { id: viaPerson[0].id } });
    } else if (viaPerson.length > 1) {
      console.warn(
        "[findUserByEmail] multiple Users linked to Person email; skip ambiguous password-reset lookup"
      );
    }
  }

  return user;
}
