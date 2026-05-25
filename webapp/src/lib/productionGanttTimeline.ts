import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export const MONTH_COLUMN_COUNT = 12;

export type GanttTimelineScale = "months" | "weeks" | "days" | "hours";

export type GanttMonthColumn = {
  key: string;
  start: Date;
  end: Date;
  label: string;
};

export type GanttWeekColumn = {
  key: string;
  start: Date;
  end: Date;
  dayCount: number;
};

/** Hour grid when zoomed in (≈ one day fills much of the screen). */
const HOURS_ZOOM_THRESHOLD = 72;
const HOURS_PX_PER_DAY_THRESHOLD = 88;

/** 12 month columns when fully zoomed out. */
const MONTHS_ZOOM_THRESHOLD = 12;
const MONTHS_PX_PER_DAY_THRESHOLD = 6;

/** Week columns when moderately zoomed out. */
const WEEKS_ZOOM_THRESHOLD = 28;
const WEEKS_PX_PER_DAY_THRESHOLD = 14;

export function resolveTimelineScale(zoom: number, pixelsPerDay: number): GanttTimelineScale {
  if (zoom >= HOURS_ZOOM_THRESHOLD || pixelsPerDay >= HOURS_PX_PER_DAY_THRESHOLD) {
    return "hours";
  }
  if (zoom <= MONTHS_ZOOM_THRESHOLD || pixelsPerDay <= MONTHS_PX_PER_DAY_THRESHOLD) {
    return "months";
  }
  if (zoom <= WEEKS_ZOOM_THRESHOLD || pixelsPerDay <= WEEKS_PX_PER_DAY_THRESHOLD) {
    return "weeks";
  }
  return "days";
}

/** Approximate scale from zoom alone (for labels before layout measure). */
export function resolveTimelineScaleFromZoom(zoom: number): GanttTimelineScale {
  if (zoom >= HOURS_ZOOM_THRESHOLD) return "hours";
  if (zoom <= MONTHS_ZOOM_THRESHOLD) return "months";
  if (zoom <= WEEKS_ZOOM_THRESHOLD) return "weeks";
  return "days";
}

export function scaleLabel(scale: GanttTimelineScale): string {
  if (scale === "hours") return "Hourly";
  if (scale === "months") return "12 months";
  if (scale === "weeks") return "Weekly";
  return "Daily";
}

export function buildMonthColumns(anchor: Date, count = MONTH_COLUMN_COUNT): GanttMonthColumn[] {
  const start = startOfMonth(anchor);
  return Array.from({ length: count }, (_, i) => {
    const monthStart = addMonths(start, i);
    const monthEnd = addMonths(monthStart, 1);
    return {
      key: format(monthStart, "yyyy-MM"),
      start: monthStart,
      end: monthEnd,
      label: format(monthStart, "MMM yyyy"),
    };
  });
}

export function buildDayColumns(rangeStart: Date, rangeEnd: Date): Date[] {
  const count = differenceInCalendarDays(rangeEnd, rangeStart);
  return Array.from({ length: Math.max(1, count) }, (_, i) => addDays(rangeStart, i));
}

export function buildWeekColumns(rangeStart: Date, rangeEnd: Date): GanttWeekColumn[] {
  const weeks: GanttWeekColumn[] = [];
  let cur = startOfWeek(rangeStart, { weekStartsOn: 1 });
  const endMs = rangeEnd.getTime();

  while (cur.getTime() < endMs) {
    const weekEndExclusive = addDays(endOfWeek(cur, { weekStartsOn: 1 }), 1);
    const clippedStart = cur.getTime() < rangeStart.getTime() ? rangeStart : cur;
    const clippedEnd =
      weekEndExclusive.getTime() > endMs ? new Date(endMs) : weekEndExclusive;
    const dayCount = Math.max(1, differenceInCalendarDays(clippedEnd, clippedStart));
    weeks.push({
      key: format(cur, "yyyy-'W'II"),
      start: cur,
      end: weekEndExclusive,
      dayCount,
    });
    cur = addWeeks(cur, 1);
  }

  return weeks.length > 0 ? weeks : [{ key: "w0", start: rangeStart, end: addDays(rangeStart, 7), dayCount: 7 }];
}

export function columnWidthForScale(
  scale: GanttTimelineScale,
  pixelsPerDay: number,
  timelineViewportPx?: number
): number {
  if (scale === "months") {
    const vw = Math.max(200, timelineViewportPx ?? 800);
    return Math.max(48, Math.floor(vw / MONTH_COLUMN_COUNT));
  }
  if (scale === "weeks") return Math.max(56, pixelsPerDay * 7);
  return pixelsPerDay;
}

export function headerHeightForScale(scale: GanttTimelineScale): number {
  return scale === "hours" ? 64 : 52;
}

/** Show all 24 hour labels when zoomed in enough; otherwise every 3 hours in hourly mode. */
const ALL_HOUR_LABELS_ZOOM = 90;
const ALL_HOUR_LABELS_PX_PER_DAY = 150;

export function hourLabelStep(zoom: number, pixelsPerDay: number): 1 | 3 {
  if (zoom >= ALL_HOUR_LABELS_ZOOM || pixelsPerDay >= ALL_HOUR_LABELS_PX_PER_DAY) return 1;
  return 3;
}

export function formatWeekHeader(weekStart: Date): { primary: string; secondary: string } {
  const weekEnd = addDays(endOfWeek(weekStart, { weekStartsOn: 1 }), 0);
  return {
    primary: `W${format(weekStart, "w")}`,
    secondary:
      weekStart.getMonth() === weekEnd.getMonth()
        ? `${format(weekStart, "d")}–${format(weekEnd, "d MMM")}`
        : `${format(weekStart, "d MMM")}–${format(weekEnd, "d MMM")}`,
  };
}
