const DATE_ONLY_YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse date/datetime strings from HTTP JSON bodies on a typically **UTC** Node host.
 *
 * - `YYYY-MM-DD` (no time): treat as that **calendar** day everywhere by storing
 *   **UTC noon** (avoids `new Date("YYYY-MM-DD")` UTC-midnight semantics, which shows as
 *   the previous local calendar day in negative-offset zones).
 * - Any other string: `new Date(s)` (ISO with `Z` / offset from the client is correct).
 */
export function parseIncomingDateTime(s: string): Date {
  const t = s.trim();
  const m = DATE_ONLY_YMD.exec(t);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0));
  }
  return new Date(t);
}

export function parseIncomingDateTimeOrNull(s: string | null | undefined): Date | null {
  if (s == null || s === "") return null;
  return parseIncomingDateTime(s);
}
