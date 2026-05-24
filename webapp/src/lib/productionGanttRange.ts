import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns";

export const MIN_GANTT_VISIBLE_DAYS = 1;
export const MAX_GANTT_VISIBLE_DAYS = 365;

/** Quick picks for the visible-day selector (within 1–365). */
export const GANTT_VISIBLE_DAY_PRESETS = [7, 14, 30, 60, 90, 180, 365] as const;

const STORAGE_START = "ordo.productionPlanner.rangeStart";
const STORAGE_DAYS = "ordo.productionPlanner.visibleDays";

export function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function clampGanttVisibleDays(days: number): number {
  if (!Number.isFinite(days)) return 90;
  return Math.min(MAX_GANTT_VISIBLE_DAYS, Math.max(MIN_GANTT_VISIBLE_DAYS, Math.round(days)));
}

/** Inclusive calendar-day span between two YYYY-MM-DD strings. */
export function visibleDaysBetween(fromYmd: string, toYmd: string): number {
  const start = parseISO(`${fromYmd}T00:00:00`);
  const end = parseISO(`${toYmd}T00:00:00`);
  return Math.max(MIN_GANTT_VISIBLE_DAYS, differenceInCalendarDays(end, start) + 1);
}

/**
 * Build an inclusive Gantt window: `visibleDays` columns starting on `start` (day 1 = start).
 * Returns `to` as the last visible calendar day.
 */
export function ganttRangeFromStart(
  start: Date,
  visibleDays: number
): { from: string; to: string; visibleDays: number } {
  const clamped = clampGanttVisibleDays(visibleDays);
  const fromDate = startOfDay(start);
  const toDate = addDays(fromDate, clamped - 1);
  return { from: toYmd(fromDate), to: toYmd(toDate), visibleDays: clamped };
}

/** Page the timeline forward/back by one full visible window. */
export function shiftGanttRangeStart(
  start: Date,
  visibleDays: number,
  direction: -1 | 1
): Date {
  return addDays(startOfDay(start), direction * clampGanttVisibleDays(visibleDays));
}

export function readPersistedGanttRangeStart(fallback: Date): Date {
  if (typeof window === "undefined") return startOfDay(fallback);
  try {
    const raw = window.localStorage.getItem(STORAGE_START);
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const d = parseISO(`${raw}T00:00:00`);
      if (!Number.isNaN(d.getTime())) return startOfDay(d);
    }
  } catch {
    /* ignore */
  }
  return startOfDay(fallback);
}

export function writePersistedGanttRangeStart(start: Date): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_START, toYmd(startOfDay(start)));
  } catch {
    /* ignore */
  }
}

export function readPersistedGanttVisibleDays(fallback = 90): number {
  if (typeof window === "undefined") return clampGanttVisibleDays(fallback);
  try {
    const raw = window.localStorage.getItem(STORAGE_DAYS);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return clampGanttVisibleDays(n);
    }
    // Migrate legacy month / quarter / season presets
    const legacy = window.localStorage.getItem("ordo.viewMode.productionPlanner");
    if (legacy === "month") return 30;
    if (legacy === "quarter") return 90;
    if (legacy === "season") return 180;
  } catch {
    /* ignore */
  }
  return clampGanttVisibleDays(fallback);
}

export function writePersistedGanttVisibleDays(days: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_DAYS, String(clampGanttVisibleDays(days)));
  } catch {
    /* ignore */
  }
}

/** Pick start + day count that covers production start/end (inclusive). */
export function ganttRangeForProductionSpan(
  productionStartYmd: string,
  productionEndYmd: string
): { start: Date; visibleDays: number } {
  const start = startOfDay(parseISO(`${productionStartYmd}T00:00:00`));
  const end = startOfDay(parseISO(`${productionEndYmd}T00:00:00`));
  const visibleDays = clampGanttVisibleDays(differenceInCalendarDays(end, start) + 1);
  return { start, visibleDays };
}
