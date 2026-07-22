/**
 * Contract / duration hours: accept `hhhhh:mm` or decimal (`hhhhh,dd` / `hhhhh.dd`).
 * Stored and calculated as decimal hours. Max: 5 hour digits + separator + 2 fraction/minute digits.
 */

const MAX_HOUR_DIGITS = 5;
const MAX_FRACTION_DIGITS = 2;

/** Parse "37:30", "37.5", "37,5", or "37" → decimal hours. Empty → null. Invalid → NaN. */
export function parseDurationHours(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return null;

  const colon = new RegExp(`^(\\d{1,${MAX_HOUR_DIGITS}}):([0-5]?\\d)$`).exec(s);
  if (colon) {
    const hours = Number.parseInt(colon[1], 10);
    const minutes = Number.parseInt(colon[2], 10);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes >= 60) return Number.NaN;
    return hours + minutes / 60;
  }

  const normalized = s.replace(",", ".");
  if (!new RegExp(`^\\d{1,${MAX_HOUR_DIGITS}}(\\.\\d{1,${MAX_FRACTION_DIGITS}})?$`).test(normalized)) {
    return Number.NaN;
  }
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Max typed length for `HHHHH,DD` / `HHHHH:MM`. */
export const DURATION_HOURS_INPUT_MAX_LENGTH = MAX_HOUR_DIGITS + 1 + MAX_FRACTION_DIGITS;

/** Decimal hours → `h:mm` (minutes 00–59, rounded). */
export function formatDurationHoursHHMM(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Decimal hours → two-fraction-digit string (`.` or `,` per locale). */
export function formatDurationHoursDecimal(hours: number, commaDecimal = false): string {
  const s = (Math.round(hours * 100) / 100).toFixed(2);
  return commaDecimal ? s.replace(".", ",") : s;
}

/**
 * Compact value for the hours input field (no trailing zeros).
 * Uses `,` when `commaDecimal` is true (da/de).
 */
export function formatDurationHoursForInput(hours: number, commaDecimal = false): string {
  const rounded = Math.round(hours * 100) / 100;
  const s = String(rounded);
  return commaDecimal ? s.replace(".", ",") : s;
}

/** Both formats for display boxes, e.g. `37:30 · 37.50` or `37:30 · 37,50`. */
export function formatDurationHoursBoth(hours: number, commaDecimal = false): string {
  return `${formatDurationHoursHHMM(hours)} · ${formatDurationHoursDecimal(hours, commaDecimal)}`;
}
