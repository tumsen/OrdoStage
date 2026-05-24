import { addDays, differenceInCalendarDays, format, parseISO, startOfDay, subDays } from "date-fns";

const STORAGE_ZOOM = "ordo.productionPlanner.zoom";
const SPAN_PADDING_DAYS = 2;
const API_PADDING_DAYS = 60;

export const MIN_GANTT_ZOOM = 0;
export const MAX_GANTT_ZOOM = 100;

/** Minimum column width when fully compressed (fit-all mode). */
export const MIN_PX_PER_DAY = 10;
/** Floor for “one day fills the timeline” zoom. */
export const MIN_ONE_DAY_PX = 120;

export function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function clampGanttZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 0;
  return Math.min(MAX_GANTT_ZOOM, Math.max(MIN_GANTT_ZOOM, Math.round(zoom)));
}

export function readPersistedGanttZoom(fallback = 0): number {
  if (typeof window === "undefined") return clampGanttZoom(fallback);
  try {
    const raw = window.localStorage.getItem(STORAGE_ZOOM);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return clampGanttZoom(n);
    }
  } catch {
    /* ignore */
  }
  return clampGanttZoom(fallback);
}

export function writePersistedGanttZoom(zoom: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_ZOOM, String(clampGanttZoom(zoom)));
  } catch {
    /* ignore */
  }
}

/** Inclusive span from earliest task start to latest task end on the chart. */
export function ganttTaskSpanFromLines(
  lines: Array<{ task: { start: string; end: string } }>
): { from: string; to: string; dayCount: number } | null {
  if (lines.length === 0) return null;

  let minMs = Infinity;
  let maxMs = -Infinity;
  for (const line of lines) {
    const startMs = new Date(line.task.start).getTime();
    const endMs = new Date(line.task.end).getTime();
    if (!Number.isNaN(startMs)) minMs = Math.min(minMs, startMs);
    if (!Number.isNaN(endMs)) maxMs = Math.max(maxMs, endMs);
  }
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) return null;

  const fromDate = subDays(startOfDay(new Date(minMs)), SPAN_PADDING_DAYS);
  const toDate = addDays(startOfDay(new Date(maxMs)), SPAN_PADDING_DAYS);
  const dayCount = differenceInCalendarDays(toDate, fromDate) + 1;
  return { from: toYmd(fromDate), to: toYmd(toDate), dayCount };
}

/**
 * Pixels per day column from zoom (0 = fit entire plan in viewport, 100 = one day ≈ full width).
 */
export function pixelsPerDayForZoom(
  zoom: number,
  dayCount: number,
  timelineViewportPx: number
): number {
  const days = Math.max(1, dayCount);
  const viewport = Math.max(200, timelineViewportPx);
  const fitAllPx = Math.max(MIN_PX_PER_DAY, viewport / days);
  const oneDayPx = Math.max(fitAllPx, viewport, MIN_ONE_DAY_PX);
  const t = clampGanttZoom(zoom) / MAX_GANTT_ZOOM;
  return Math.round(fitAllPx + t * (oneDayPx - fitAllPx));
}

export function zoomLabel(zoom: number): string {
  const z = clampGanttZoom(zoom);
  if (z <= 0) return "Fit plan";
  if (z >= 100) return "1 day / screen";
  if (z < 35) return "Wide";
  if (z < 70) return "Medium";
  return "Detailed";
}

/** Wide query window for API fetch (single production returns all phases regardless). */
export function apiRangeForPlanner(
  lines: Array<{ task: { start: string; end: string } }> | undefined
): { from: string; to: string } {
  const span = lines?.length ? ganttTaskSpanFromLines(lines) : null;
  if (span) {
    const from = subDays(parseISO(`${span.from}T00:00:00`), API_PADDING_DAYS);
    const to = addDays(parseISO(`${span.to}T00:00:00`), API_PADDING_DAYS);
    return { from: toYmd(from), to: toYmd(to) };
  }
  const today = startOfDay(new Date());
  return { from: toYmd(subDays(today, 365)), to: toYmd(addDays(today, 730)) };
}
