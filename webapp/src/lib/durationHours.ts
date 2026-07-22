/**
 * Duration / quantity hours across the app.
 * Accept `HHHHH:MM` or decimal `HHHHH,DD` / `HHHHH.DD` (locale).
 * Calculated displays use both: `37:30 · 37,50`.
 */

const MAX_HOUR_DIGITS = 5;
const MAX_FRACTION_DIGITS = 2;

/** Max typed length for `HHHHH,DD` / `HHHHH:MM`. */
export const DURATION_HOURS_INPUT_MAX_LENGTH = MAX_HOUR_DIGITS + 1 + MAX_FRACTION_DIGITS;

/** Compact fixed-width input for HHHHH,DD / HHHHH:MM. */
export const DURATION_HOURS_INPUT_CLASS =
  "h-8 w-[calc(8ch+1rem)] shrink-0 bg-white/5 border-white/10 text-white placeholder:text-white/20 text-sm tabular-nums px-2";

/**
 * Parse "37:30", "37.5", "37,5", or "37" → decimal hours.
 * Empty → null. Invalid → NaN. Optional leading `-` when `allowNegative`.
 */
export function parseDurationHours(raw: string, opts?: { allowNegative?: boolean }): number | null {
  let s = raw.trim();
  if (s === "") return null;

  let negative = false;
  if (s.startsWith("-")) {
    if (!opts?.allowNegative) return Number.NaN;
    negative = true;
    s = s.slice(1).trim();
    if (!s) return Number.NaN;
  } else if (s.startsWith("+")) {
    s = s.slice(1).trim();
    if (!s) return Number.NaN;
  }

  const colon = new RegExp(`^(\\d{1,${MAX_HOUR_DIGITS}}):([0-5]?\\d)$`).exec(s);
  if (colon) {
    const hours = Number.parseInt(colon[1], 10);
    const minutes = Number.parseInt(colon[2], 10);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes >= 60) return Number.NaN;
    const value = hours + minutes / 60;
    return negative ? -value : value;
  }

  const normalized = s.replace(",", ".");
  if (!new RegExp(`^\\d{1,${MAX_HOUR_DIGITS}}(\\.\\d{1,${MAX_FRACTION_DIGITS}})?$`).test(normalized)) {
    return Number.NaN;
  }
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n)) return Number.NaN;
  return negative ? -n : n;
}

/** Parse duration string → total minutes (rounded). Empty → null. Invalid → NaN. */
export function parseDurationHoursToMinutes(
  raw: string,
  opts?: { allowNegative?: boolean }
): number | null {
  const hours = parseDurationHours(raw, opts);
  if (hours === null) return null;
  if (Number.isNaN(hours)) return Number.NaN;
  return Math.round(hours * 60);
}

/** Decimal hours → `h:mm` (minutes 00–59, rounded). Supports negative. */
export function formatDurationHoursHHMM(hours: number): string {
  if (!Number.isFinite(hours)) return "0:00";
  const sign = hours < 0 ? "-" : "";
  const totalMinutes = Math.round(Math.abs(hours) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${sign}${h}:${String(m).padStart(2, "0")}`;
}

/** Decimal hours → two-fraction-digit string (`.` or `,` per locale). */
export function formatDurationHoursDecimal(hours: number, commaDecimal = false): string {
  if (!Number.isFinite(hours)) return commaDecimal ? "0,00" : "0.00";
  const s = (Math.round(hours * 100) / 100).toFixed(2);
  return commaDecimal ? s.replace(".", ",") : s;
}

/**
 * Compact value for hours input fields (no forced trailing zeros).
 * Uses `,` when `commaDecimal` is true (da/de).
 */
export function formatDurationHoursForInput(hours: number, commaDecimal = false): string {
  if (!Number.isFinite(hours)) return "";
  const rounded = Math.round(hours * 100) / 100;
  const s = String(rounded);
  return commaDecimal ? s.replace(".", ",") : s;
}

/** Both formats for calculated displays, e.g. `37:30 · 37.50` or `37:30 · 37,50`. */
export function formatDurationHoursBoth(hours: number, commaDecimal = false): string {
  return `${formatDurationHoursHHMM(hours)} · ${formatDurationHoursDecimal(hours, commaDecimal)}`;
}

/** Total minutes → both formats via decimal hours. */
export function formatMinutesAsDurationBoth(minutes: number, commaDecimal = false): string {
  return formatDurationHoursBoth(minutes / 60, commaDecimal);
}

/** Signed minutes for overtime/deltas, e.g. `+1:30 · +1,50`. */
export function formatSignedMinutesAsDurationBoth(minutes: number, commaDecimal = false): string {
  const rounded = Math.round(minutes);
  if (rounded === 0) return formatMinutesAsDurationBoth(0, commaDecimal);
  const body = formatMinutesAsDurationBoth(Math.abs(rounded), commaDecimal);
  return rounded > 0 ? `+${body}` : `-${body}`;
}
