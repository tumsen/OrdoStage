import type { EventDetail, InternalBookingDetail } from "../../../../backend/src/types";

export type BookingType = "rehearsal" | "maintenance" | "private" | "other";

export interface CalendarItem {
  id: string;
  title: string;
  kind: "event" | "booking";
  type?: BookingType;
  status?: string;
  startDate: string;
  endDate: string | null;
  raw: EventDetail | InternalBookingDetail;
}

export function toCalendarItems(
  events: EventDetail[],
  bookings: InternalBookingDetail[]
): CalendarItem[] {
  const eventItems: CalendarItem[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    kind: "event",
    status: e.status,
    startDate: e.startDate,
    endDate: e.endDate,
    raw: e,
  }));

  const bookingItems: CalendarItem[] = bookings.map((b) => ({
    id: b.id,
    title: b.title,
    kind: "booking",
    type: b.type as BookingType,
    startDate: b.startDate,
    endDate: b.endDate,
    raw: b,
  }));

  return [...eventItems, ...bookingItems];
}

export function getMonthDays(year: number, month: number): (Date | null)[] {
  // month is 0-indexed
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Day of week for first day (0=Sun...6=Sat), convert to Mon-based (0=Mon...6=Sun)
  const startDow = (firstDay.getDay() + 6) % 7;

  const cells: (Date | null)[] = [];

  // Padding before
  for (let i = 0; i < startDow; i++) {
    cells.push(null);
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push(new Date(year, month, d));
  }

  // Pad to complete last row (multiple of 7)
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

export function itemsForDay(items: CalendarItem[], date: Date): CalendarItem[] {
  const dateStr = toDateStr(date);
  return items.filter((item) => {
    const start = item.startDate.slice(0, 10);
    const end = item.endDate ? item.endDate.slice(0, 10) : start;
    return dateStr >= start && dateStr <= end;
  });
}

export function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  // If it's midnight exactly treat it as date-only
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) {
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const ITEM_COLORS: Record<string, string> = {
  event: "bg-indigo-600/80 text-indigo-100 border border-indigo-500/40",
  rehearsal: "bg-amber-600/80 text-amber-100 border border-amber-500/40",
  maintenance: "bg-slate-600/80 text-slate-100 border border-slate-500/40",
  private: "bg-purple-600/80 text-purple-100 border border-purple-500/40",
  other: "bg-blue-600/80 text-blue-100 border border-blue-500/40",
};

export function itemColor(item: CalendarItem): string {
  if (item.kind === "event") return ITEM_COLORS.event;
  return ITEM_COLORS[item.type ?? "other"] ?? ITEM_COLORS.other;
}

/** ISO string includes a time component (not date-only). */
export function hasTimedStart(item: CalendarItem): boolean {
  return /\dT\d/.test(item.startDate);
}

export function getItemTimeRange(item: CalendarItem): { start: Date; end: Date; hasExplicitTime: boolean } {
  const start = new Date(item.startDate);
  const end = item.endDate ? new Date(item.endDate) : new Date(start.getTime() + 60 * 60 * 1000);
  const hasExplicitTime = hasTimedStart(item);
  return { start, end, hasExplicitTime };
}

/**
 * Position a timed block inside a single calendar day column (local timezone).
 * Uses millisecond deltas so spans past midnight render correctly up to end of day.
 */
export function layoutTimedBlockInDay(
  day: Date,
  start: Date,
  end: Date,
  hourHeightPx: number
): { top: number; height: number; clippedStart: Date; clippedEnd: Date } | null {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const clippedStart = start < dayStart ? dayStart : start;
  const clippedEnd = end > dayEnd ? dayEnd : end;
  if (clippedEnd.getTime() <= clippedStart.getTime()) return null;

  const msPerHour = 60 * 60 * 1000;
  const top = ((clippedStart.getTime() - dayStart.getTime()) / msPerHour) * hourHeightPx;
  const height = Math.max(
    16,
    ((clippedEnd.getTime() - clippedStart.getTime()) / msPerHour) * hourHeightPx
  );
  return { top, height, clippedStart, clippedEnd };
}

/** Format for HTML datetime-local inputs (local time). */
export function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Overlap column layout ────────────────────────────────────────────────────

export interface TimedBlock {
  item: CalendarItem;
  start: Date;
  end: Date;
  hasExplicitTime: boolean;
}

export interface LaidOutBlock extends TimedBlock {
  colIndex: number;
  totalCols: number;
}

/**
 * Assigns non-overlapping column slots to timed blocks so they render side-by-side
 * instead of stacking. Works per-day column.
 */
export function computeOverlapLayout(blocks: TimedBlock[]): LaidOutBlock[] {
  if (blocks.length === 0) return [];

  const sorted = [...blocks].sort((a, b) => a.start.getTime() - b.start.getTime());
  const colEndTimes: Date[] = [];

  const assigned: Array<TimedBlock & { colIndex: number; totalCols: number }> = sorted.map(
    (entry) => {
      let colIndex = -1;
      for (let c = 0; c < colEndTimes.length; c++) {
        if (entry.start.getTime() >= colEndTimes[c]!.getTime()) {
          colIndex = c;
          colEndTimes[c] = entry.end;
          break;
        }
      }
      if (colIndex === -1) {
        colIndex = colEndTimes.length;
        colEndTimes.push(entry.end);
      }
      return { ...entry, colIndex, totalCols: 1 };
    }
  );

  // Re-calculate totalCols = highest colIndex among all concurrently overlapping items + 1
  for (const r of assigned) {
    const concurrent = assigned.filter(
      (o) => r.start.getTime() < o.end.getTime() && r.end.getTime() > o.start.getTime()
    );
    r.totalCols = Math.max(...concurrent.map((c) => c.colIndex)) + 1;
  }

  return assigned;
}
