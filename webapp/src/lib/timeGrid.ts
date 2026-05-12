/** Rolling 24h window per column: column `dayYmd` is [local midnight for day + startHour] through +24h. */

export const MINUTES_PER_DAY = 24 * 60;

/** Snap drag / edit times to this grid (e.g. 5 → only :00 :05 :10 …). */
export const TIME_SNAP_MINUTES = 5;

export function windowStartForColumnDay(dayYmd: string, startHour: number): Date {
  const [y, mo, d] = dayYmd.split("-").map(Number);
  return new Date(y, (mo ?? 1) - 1, d ?? 1, startHour, 0, 0, 0);
}

/** Which week column owns this instant (rolling window). */
export function columnDayYmdForInstant(t: Date, startHour: number): string {
  let ws = new Date(t.getFullYear(), t.getMonth(), t.getDate(), startHour, 0, 0, 0);
  if (t < ws) {
    ws = new Date(ws.getTime() - 24 * 60 * 60 * 1000);
  }
  const y = ws.getFullYear();
  const mo = ws.getMonth() + 1;
  const d = ws.getDate();
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function minutesFromWindowStart(t: Date, columnDayYmd: string, startHour: number): number {
  const ws = windowStartForColumnDay(columnDayYmd, startHour);
  return (t.getTime() - ws.getTime()) / 60000;
}

export function dateFromColumnAndWindowMinutes(
  columnDayYmd: string,
  minutesFromStart: number,
  startHour: number
): Date {
  const ws = windowStartForColumnDay(columnDayYmd, startHour);
  return new Date(ws.getTime() + minutesFromStart * 60000);
}

export function clampMinutesToDay(m: number): number {
  return Math.max(0, Math.min(MINUTES_PER_DAY, m));
}

/** Snap a position in the rolling day window (0…1440) to the time grid. */
export function snapWindowMinutes(m: number): number {
  const stepped = Math.round(m / TIME_SNAP_MINUTES) * TIME_SNAP_MINUTES;
  return clampMinutesToDay(stepped);
}

/** Linear minutes in the rolling window from pointer Y (smooth drag preview; snap at commit). */
export function rawWindowMinutesFromY(
  clientY: number,
  columnRectTop: number,
  columnHeightPx: number
): number {
  const y = clientY - columnRectTop;
  const clamped = Math.max(0, Math.min(columnHeightPx, y));
  return (clamped / columnHeightPx) * MINUTES_PER_DAY;
}

export function formatHourLabel(hour24: number, timeFormat: "12h" | "24h"): string {
  const h = ((hour24 % 24) + 24) % 24;
  if (timeFormat === "24h") {
    return `${String(h).padStart(2, "0")}:00`;
  }
  const period = h >= 12 ? "PM" : "AM";
  const x = h % 12 === 0 ? 12 : h % 12;
  return `${x} ${period}`;
}

export function bottomBoundaryLabel(startHour: number, timeFormat: "12h" | "24h"): string {
  if (timeFormat === "24h" && startHour === 0) {
    return "24:00";
  }
  return formatHourLabel(startHour, timeFormat);
}

/** da/de use comma as decimal separator; en uses dot. */
export function commaDecimalForLanguage(language: "en" | "da" | "de"): boolean {
  return language === "da" || language === "de";
}

/** One decimal place (e.g. 7.4 or 7,4). */
export function formatOneDecimalHour(hours: number, commaDecimal: boolean): string {
  const rounded = Math.round(hours * 10) / 10;
  const s = Number.isFinite(rounded) ? rounded.toFixed(1) : "0.0";
  return commaDecimal ? s.replace(".", ",") : s;
}

/** Total minutes as duration: HH:mm (e.g. 07:24, 04:30). */
export function formatTotalMinutesAsHHMM(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Whole clock hour 0–23 as decimal hours (e.g. 7,0 next to 07:00). */
export function formatWholeClockHourDecimal(hour24: number, commaDecimal: boolean): string {
  const h = ((hour24 % 24) + 24) % 24;
  return formatOneDecimalHour(h, commaDecimal);
}

/** Bottom ruler tick: 24,0 for end-of-day 24:00; else whole hour for boundary label. */
export function formatGridBottomDecimalHours(
  startHour: number,
  timeFormat: "12h" | "24h",
  commaDecimal: boolean
): string {
  if (timeFormat === "24h" && startHour === 0) {
    return commaDecimal ? "24,0" : "24.0";
  }
  const h = ((startHour % 24) + 24) % 24;
  return formatOneDecimalHour(h, commaDecimal);
}

/** Whether [startsAt, endsAt) overlaps the rolling 24h window for this column. */
export function rangeOverlapsColumnWindow(
  startsAt: Date,
  endsAt: Date,
  columnDayYmd: string,
  startHour: number
): boolean {
  const ws = windowStartForColumnDay(columnDayYmd, startHour).getTime();
  const we = ws + MINUTES_PER_DAY * 60 * 1000;
  return startsAt.getTime() < we && endsAt.getTime() > ws;
}

/**
 * Visible segment of a time range inside one column (percentage top + height).
 * Used by time tracking week blocks and create-drag previews across multiple days.
 */
export function rangeMetricsInColumn(
  startsAt: Date,
  endsAt: Date,
  columnDayYmd: string,
  startHour: number
): { topPct: number; heightPct: number } | null {
  const startWin = minutesFromWindowStart(startsAt, columnDayYmd, startHour);
  let endWin = minutesFromWindowStart(endsAt, columnDayYmd, startHour);
  if (endWin < startWin) endWin += MINUTES_PER_DAY;
  const visibleEnd = Math.min(endWin, MINUTES_PER_DAY);
  const topPct = (Math.max(0, startWin) / MINUTES_PER_DAY) * 100;
  const heightPct = ((visibleEnd - Math.max(0, startWin)) / MINUTES_PER_DAY) * 100;
  if (heightPct <= 0.01) return null;
  return { topPct, heightPct };
}
