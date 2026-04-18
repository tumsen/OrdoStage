/** True when the URL targets PostgreSQL (postgresql:// or postgres://). */
export function isPostgresDatabaseUrl(url: string | undefined): boolean {
  const u = url ?? "";
  return u.startsWith("postgresql:") || u.startsWith("postgres:");
}
