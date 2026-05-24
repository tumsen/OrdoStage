import {
  addDays,
  addWeeks,
  differenceInCalendarDays,
  endOfWeek,
  format,
  startOfWeek,
} from "date-fns";

export type GanttTimelineScale = "weeks" | "days" | "hours";

export type GanttWeekColumn = {
  key: string;
  start: Date;
  end: Date;
  dayCount: number;
};

/** Hour grid when zoomed in (≈ one day fills much of the screen). */
const HOURS_ZOOM_THRESHOLD = 72;
const HOURS_PX_PER_DAY_THRESHOLD = 88;

/** Week columns when zoomed out (fit-all / compressed). */
const WEEKS_ZOOM_THRESHOLD = 28;
const WEEKS_PX_PER_DAY_THRESHOLD = 14;

export function resolveTimelineScale(zoom: number, pixelsPerDay: number): GanttTimelineScale {
  if (zoom >= HOURS_ZOOM_THRESHOLD || pixelsPerDay >= HOURS_PX_PER_DAY_THRESHOLD) {
    return "hours";
  }
  if (zoom <= WEEKS_ZOOM_THRESHOLD || pixelsPerDay <= WEEKS_PX_PER_DAY_THRESHOLD) {
    return "weeks";
  }
  return "days";
}

/** Approximate scale from zoom alone (for labels before layout measure). */
export function resolveTimelineScaleFromZoom(zoom: number): GanttTimelineScale {
  if (zoom >= HOURS_ZOOM_THRESHOLD) return "hours";
  if (zoom <= WEEKS_ZOOM_THRESHOLD) return "weeks";
  return "days";
}

export function scaleLabel(scale: GanttTimelineScale): string {
  if (scale === "hours") return "Hourly";
  if (scale === "weeks") return "Weekly";
  return "Daily";
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

export function columnWidthForScale(scale: GanttTimelineScale, pixelsPerDay: number): number {
  if (scale === "weeks") return Math.max(56, pixelsPerDay * 7);
  return pixelsPerDay;
}

export function headerHeightForScale(scale: GanttTimelineScale): number {
  return scale === "hours" ? 64 : 52;
}

export const HOUR_TICKS = [0, 6, 12, 18] as const;

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
