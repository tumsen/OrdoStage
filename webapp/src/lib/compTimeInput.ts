/** Max comp time balance: 999 hours 59 minutes. */
export const COMP_TIME_MAX_MINUTES = 999 * 60 + 59;

/** Total minutes → "H:MM" or "HHH:MM" (no fixed hour padding while typing). */
export function formatCompTimeHhhMm(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes)) return "0:00";
  const sign = totalMinutes < 0 ? "-" : "";
  const capped = Math.min(
    COMP_TIME_MAX_MINUTES,
    Math.max(0, Math.abs(Math.round(totalMinutes)))
  );
  const h = Math.floor(capped / 60);
  const m = capped % 60;
  return `${sign}${h}:${String(m).padStart(2, "0")}`;
}

/**
 * Parse "400", "400:00", "400:30", or "-12:15" as hours:minutes (plain number = hours).
 * Returns null when invalid.
 */
export function parseCompTimeHhhMm(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return 0;

  const negative = trimmed.startsWith("-");
  const body = negative ? trimmed.slice(1).trim() : trimmed;
  if (!body) return null;

  if (body.includes(":")) {
    const [rawH = "", rawM = ""] = body.split(":");
    const h = parseInt(rawH.replace(/\D/g, ""), 10);
    const m = parseInt((rawM.replace(/\D/g, "") || "0").slice(0, 2), 10);
    if (Number.isNaN(h) || Number.isNaN(m) || m > 59 || h > 999) return null;
    const total = h * 60 + m;
    if (total > COMP_TIME_MAX_MINUTES) return null;
    return negative ? -total : total;
  }

  const digits = body.replace(/\D/g, "");
  if (!digits) return null;
  const h = parseInt(digits, 10);
  if (Number.isNaN(h) || h > 999) return null;
  const total = h * 60;
  if (total > COMP_TIME_MAX_MINUTES) return null;
  return negative ? -total : total;
}

/** Normalize free-form input to canonical HHH:MM on blur. */
export function normalizeCompTimeHhhMm(input: string): string {
  const parsed = parseCompTimeHhhMm(input);
  if (parsed === null) return input.trim();
  return formatCompTimeHhhMm(parsed);
}
