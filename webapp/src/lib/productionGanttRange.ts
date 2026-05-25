import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";

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

export type GanttVisibleRange = {
  from: string;
  to: string;
  dayCount: number;
};

function rangeFromDates(fromDate: Date, toDate: Date): GanttVisibleRange {
  const from = startOfDay(fromDate);
  const to = startOfDay(toDate);
  const dayCount = Math.max(1, differenceInCalendarDays(to, from) + 1);
  return { from: toYmd(from), to: toYmd(to), dayCount };
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

/** Visible window length (days) for a zoom step; low zoom ≈ 12 months. */
export function visibleDayCountForZoom(zoom: number): number {
  const z = clampGanttZoom(zoom);
  if (z <= 12) return 365;
  if (z <= 28) return 84;
  if (z < 50) return 42;
  if (z < 70) return 21;
  if (z < 90) return 10;
  return 3;
}

/** Center a day window on anchor, optionally clipped to production bounds. */
export function visibleRangeCenteredOn(
  anchor: Date,
  dayCount: number,
  bounds: { from: string; to: string } | null
): GanttVisibleRange {
  const count = Math.max(1, dayCount);
  const half = Math.floor(count / 2);
  let from = subDays(startOfDay(anchor), half);
  let to = addDays(from, count - 1);

  if (bounds) {
    const bFrom = startOfDay(parseISO(`${bounds.from}T00:00:00`));
    const bTo = startOfDay(parseISO(`${bounds.to}T00:00:00`));
    if (from.getTime() < bFrom.getTime()) {
      from = bFrom;
      to = addDays(from, count - 1);
    }
    if (to.getTime() > bTo.getTime()) {
      to = bTo;
      from = subDays(to, count - 1);
    }
    if (from.getTime() < bFrom.getTime()) from = bFrom;
  }

  return rangeFromDates(from, to);
}

/** Compute visible from/to from zoom; aligns with timeline scale (12 months at low zoom). */
export function visibleRangeForZoom(
  zoom: number,
  anchor: Date,
  productionSpan: { from: string; to: string } | null
): GanttVisibleRange {
  const z = clampGanttZoom(zoom);

  if (z <= 12) {
    const anchorMonth = startOfMonth(anchor);
    if (productionSpan) {
      const prodFrom = startOfMonth(parseISO(`${productionSpan.from}T00:00:00`));
      const prodTo = startOfDay(parseISO(`${productionSpan.to}T00:00:00`));
      const twelveEnd = subDays(addMonths(prodFrom, 12), 1);
      if (prodTo.getTime() <= twelveEnd.getTime()) {
        return rangeFromDates(prodFrom, prodTo);
      }
      let start = startOfMonth(subMonths(anchorMonth, 5));
      if (start.getTime() < prodFrom.getTime()) start = prodFrom;
      let end = subDays(addMonths(start, 12), 1);
      if (end.getTime() > prodTo.getTime()) end = prodTo;
      return rangeFromDates(start, end);
    }
    const start = startOfMonth(subMonths(anchorMonth, 5));
    const end = subDays(addMonths(start, 12), 1);
    return rangeFromDates(start, end);
  }

  let dayCount = visibleDayCountForZoom(zoom);
  if (productionSpan) {
    const prodDays =
      differenceInCalendarDays(
        parseISO(`${productionSpan.to}T00:00:00`),
        parseISO(`${productionSpan.from}T00:00:00`)
      ) + 1;
    dayCount = Math.min(dayCount, prodDays);
  }
  return visibleRangeCenteredOn(anchor, dayCount, productionSpan);
}

export function midpointOfRange(from: string, to: string): Date {
  const a = parseISO(`${from}T00:00:00`).getTime();
  const b = parseISO(`${to}T00:00:00`).getTime();
  return startOfDay(new Date((a + b) / 2));
}

export function zoomLabel(zoom: number, scale?: import("./productionGanttTimeline").GanttTimelineScale): string {
  if (scale === "hours") return "Hourly view";
  if (scale === "months") return "12-month view";
  if (scale === "weeks") return "Weekly view";
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
