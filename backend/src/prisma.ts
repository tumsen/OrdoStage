import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function initSqlitePragmas(client: PrismaClient) {
  await client.$queryRawUnsafe("PRAGMA journal_mode = WAL;");
  await client.$queryRawUnsafe("PRAGMA foreign_keys = ON;");
  await client.$queryRawUnsafe("PRAGMA busy_timeout = 10000;");
  await client.$queryRawUnsafe("PRAGMA synchronous = NORMAL;");
}

initSqlitePragmas(prisma);

export { prisma };
