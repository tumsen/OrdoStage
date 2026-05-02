/**
 * True when we should use PostgreSQL-specific queries (case-insensitive email, raw SQL).
 * Standard `postgres://` URLs match; Prisma Accelerate / Data Proxy often use `prisma://`
 * or `prisma+postgres://` while still talking to Postgres — this app is Postgres-only
 * (see prisma/schema.prisma), so those count too.
 */
export function isPostgresDatabaseUrl(url: string | undefined): boolean {
  const u = url ?? "";
  if (u.startsWith("postgresql:") || u.startsWith("postgres:")) return true;
  if (/^prisma\+postgres(ql)?:/i.test(u)) return true;
  if (u.startsWith("prisma://")) return true;
  return false;
}
