import { parseDurationHours } from "@/lib/durationHours";

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
 * Parse HHHHH:MM or HHHHH,DD / HHHHH.DD (optional leading `-`) as total minutes.
 * Empty → 0. Invalid → null.
 */
export function parseCompTimeHhhMm(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return 0;

  const hours = parseDurationHours(trimmed, { allowNegative: true });
  if (hours === null) return 0;
  if (Number.isNaN(hours)) return null;

  const total = Math.round(Math.abs(hours) * 60);
  if (total > COMP_TIME_MAX_MINUTES) return null;
  if (Math.floor(total / 60) > 999) return null;
  return hours < 0 ? -total : total;
}

/** Normalize free-form input to canonical HHH:MM on blur. */
export function normalizeCompTimeHhhMm(input: string): string {
  const parsed = parseCompTimeHhhMm(input);
  if (parsed === null) return input.trim();
  return formatCompTimeHhhMm(parsed);
}
