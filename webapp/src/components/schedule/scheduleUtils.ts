import type { EventDetail, InternalBookingDetail, TourDetail, TourShow } from "../../../../backend/src/types";
import {
  scheduleEventLabel,
  sortedTourScheduleEvents,
  tourShowCalendarDurationMinutes,
  tourShowCalendarStartTime,
} from "@/lib/tourScheduleDisplay";
import { addMinutesToUtcIso, wallClockYmdHhMmToUtcIso } from "@/lib/browserUserTime";
import { durationMinutesBetween, normalizeTimeHHMM } from "@/lib/showTiming";
import { timeProjectSurfaceStyle } from "@/lib/timeCatalogColors";
import type { CSSProperties } from "react";

export type BookingType = "rehearsal" | "maintenance" | "private" | "venue_booking" | "other";

/** Prefix on mirrored internal bookings (`events.ts` / `staffing.ts`) so the API can find rows with `title startsWith`. */
const INTERNAL_BOOKING_SYNC_TITLE_MARKER_RE =
  /^\[(event-show-job|event-show-staffing):[^\]]+\]\s*/;

/**
 * Split the machine-readable sync prefix from the human-readable title. The prefix must stay in
 * the stored `title` when updating mirrored rows so sync continues to match.
 */
export function splitInternalBookingSyncMarker(title: string): { marker: string; displayTitle: string } {
  const m = title.match(INTERNAL_BOOKING_SYNC_TITLE_MARKER_RE);
  if (!m?.[0]) return { marker: "", displayTitle: title };
  return { marker: m[0], displayTitle: title.slice(m[0].length) };
}

/** Title for UI lists and calendar chips (hides `[event-show-job:…]` / `[event-show-staffing:…]`). */
export function internalBookingDisplayTitle(title: string): string {
  return splitInternalBookingSyncMarker(title).displayTitle;
}

/** True when this booking row is auto-mirrored from an event show job or staffing (not a user booking). */
export function isMirroredSystemInternalBookingTitle(title: string): boolean {
  return (
    title.startsWith("[event-show-job:") || title.startsWith("[event-show-staffing:")
  );
}

export interface CalendarItem {
  id: string;
  title: string;
  kind: "event" | "booking" | "job" | "summary" | "tour" | "time";
  type?: BookingType;
  status?: string;
  startDate: string;
  endDate: string | null;
  raw: EventDetail | InternalBookingDetail | TourDetail;
  /** Time tracking month view — `TimeEntry.category` for pill coloring. */
  timeCategory?: string;
  /** Time tracking month view — job rows use job styling when category is work-like. */
  timeIsJob?: boolean;
  /** Time tracking — project accent (#RRGGBB) when set. */
  accentColor?: string | null;
  /** Time tracking — project hatch/fill pattern. */
  fillPattern?: string | null;
  /** Venue label for job rows and tour day rows (when known). */
  venueLabel?: string;
  /** When true, render greyed/faded and ignore interactions (used for conflict awareness). */
  disabled?: boolean;
  /** Render behind foreground event/show blocks without taking an overlap column. */
  renderBehind?: boolean;
}

/** Same instant semantics as API bookings (`…Z`) for the time grid. */
function toLocalDatetime(datePart: string, timePart: string): string {
  return wallClockYmdHhMmToUtcIso(datePart, timePart);
}

function addMinutesLocal(startIso: string, minutes: number): string | null {
  return addMinutesToUtcIso(startIso, minutes);
}

function tourShowVenueLabel(show: TourShow): string | undefined {
  const name = show.venueName?.trim();
  if (name) return name;
  const city = show.venueCity?.trim();
  if (city) return city;
  return undefined;
}

/** Duration for one schedule row; defaults to 60m when end missing or invalid. */
function tourScheduleRowDurationMinutes(startHHMM: string, endHHMM: string | null): number {
  if (!endHHMM || endHHMM === startHHMM) return 60;
  const d = durationMinutesBetween(startHHMM, endHHMM);
  if (d === null || d <= 0) return 60;
  if (d >= 24 * 60) return 60;
  return d;
}

function calendarItemsForTourShow(tour: TourDetail, show: TourShow): CalendarItem[] {
  const day = show.date.slice(0, 10);
  const venueLabel = tourShowVenueLabel(show);
  const evs = sortedTourScheduleEvents(show).filter((ev) => normalizeTimeHHMM(ev.startTime));

  if (evs.length > 0) {
    return evs.map((ev) => {
      const s = normalizeTimeHHMM(ev.startTime)!;
      const e = normalizeTimeHHMM(ev.endTime);
      const durMin = tourScheduleRowDurationMinutes(s, e);
      const startDate = toLocalDatetime(day, s);
      const endDate = addMinutesLocal(startDate, durMin);
      return {
        id: `tour:${tour.id}:show:${show.id}:ev:${ev.id}`,
        title: `${tour.name} · ${scheduleEventLabel(ev)}`,
        kind: "tour" as const,
        status: tour.status,
        startDate,
        endDate,
        raw: tour,
        venueLabel,
      } satisfies CalendarItem;
    });
  }

  const startHHMM = tourShowCalendarStartTime(show);
  const hasTime = typeof startHHMM === "string" && /^\d{2}:\d{2}$/.test(startHHMM);
  const startDate = hasTime ? toLocalDatetime(day, startHHMM) : day;
  const dur = tourShowCalendarDurationMinutes(show);
  const endDate: string | null =
    hasTime && dur !== null && dur > 0 ? addMinutesLocal(startDate, dur) : null;
  const typeLabel =
    show.type === "travel" ? "Travel" : show.type === "day_off" ? "Day off" : "Show";
  return [
    {
      id: `tour:${tour.id}:show:${show.id}`,
      title: `${tour.name} · ${typeLabel}`,
      kind: "tour",
      status: tour.status,
      startDate,
      endDate,
      raw: tour,
      venueLabel,
    } satisfies CalendarItem,
  ];
}

/** Date anchor for the schedule grid: event window, or earliest show date when window is unset. */
export function eventCalendarStart(e: EventDetail): string | null {
  if (e.startDate) return e.startDate;
  if (!e.shows?.length) return null;
  const sorted = [...e.shows]
    .map((s) => s.showDate)
    .filter(Boolean)
    .sort();
  return sorted[0] ?? null;
}

/** Local `YYYY-MM-DD` keys for an event (rollup start + each show). */
export function eventCalendarDateKeys(e: EventDetail): string[] {
  const keys = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((raw ?? "").trim());
    if (m) keys.add(m[0]!);
  };
  add(eventCalendarStart(e));
  for (const s of e.shows ?? []) add(s.showDate);
  return [...keys];
}

/** True when any show/anchor day falls in inclusive `YYYY-MM-DD` range (empty bound = open). */
export function eventMatchesDateRange(
  e: EventDetail,
  dateFrom: string,
  dateTo: string,
): boolean {
  if (!dateFrom && !dateTo) return true;
  const dates = eventCalendarDateKeys(e);
  if (dates.length === 0) return false;
  return dates.some((d) => {
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });
}

export interface ToCalendarItemsOptions {
  /** When set, only include show-job rows assigned to this person (still includes events/bookings as usual). */
  personIdFilter?: string | null;
}

/** Per-show confirmation; falls back to event rollup when missing (legacy payloads). */
export function calendarStatusForShow(
  show: { status?: string | null },
  event: EventDetail
): string {
  const raw = show.status ?? event.status;
  if (raw === "confirmed" || raw === "cancelled" || raw === "draft") return raw;
  return "draft";
}

export function toCalendarItems(
  events: EventDetail[],
  bookings: InternalBookingDetail[],
  tours: TourDetail[] = [],
  options?: ToCalendarItemsOptions
): CalendarItem[] {
  const personJobFilter = options?.personIdFilter;

  const jobItems: CalendarItem[] = [];
  for (const e of events) {
    for (const show of e.shows ?? []) {
      for (const job of show.jobs ?? []) {
        if (
          personJobFilter &&
          job.personId !== personJobFilter &&
          !(job.people ?? []).some((p) => p.id === personJobFilter)
        ) {
          continue;
        }
        const day = typeof job.jobDate === "string" ? job.jobDate.slice(0, 10) : "";
        if (!day) continue;
        const hasTime = /^\d{2}:\d{2}$/.test(job.startTime);
        if (!hasTime) continue;
        const startDate = toLocalDatetime(day, job.startTime);
        const endDate =
          job.durationMinutes > 0 ? addMinutesLocal(startDate, job.durationMinutes) : null;
        const venueName = job.venue?.name ?? show.venue?.name;
        jobItems.push({
          id: `${e.id}:show:${show.id}:job:${job.id}`,
          title: `${job.title} · ${e.title}`,
          kind: "job",
          status: calendarStatusForShow(show, e),
          startDate,
          endDate,
          raw: e,
          venueLabel: venueName,
        });
      }
    }
  }

  const eventItems = events.flatMap((e) => {
    const shows = (e.shows ?? [])
      .filter((s) => Boolean(s.showDate))
      .sort((a, b) => {
        const d = a.showDate.localeCompare(b.showDate);
        if (d !== 0) return d;
        return a.showTime.localeCompare(b.showTime);
      });

    if (shows.length > 0) {
      return shows.map((show) => {
        const day = show.showDate.slice(0, 10);
        const hasTime = /^\d{2}:\d{2}$/.test(show.showTime);
        const startDate = hasTime ? toLocalDatetime(day, show.showTime) : day;
        const endDate: string | null =
          hasTime && show.durationMinutes > 0
            ? addMinutesLocal(startDate, show.durationMinutes)
            : null;

        return {
          id: `${e.id}:show:${show.id}`,
          title: e.title,
          kind: "event" as const,
          status: calendarStatusForShow(show, e),
          startDate,
          endDate,
          raw: e,
        } satisfies CalendarItem;
      });
    }

    const startDate = eventCalendarStart(e);
    if (!startDate) return [];
    return [
      {
        id: e.id,
        title: e.title,
        kind: "event" as const,
        status: e.status,
        startDate,
        endDate: e.endDate,
        raw: e,
      } satisfies CalendarItem,
    ];
  });

  const bookingItems: CalendarItem[] = bookings
    .filter((b) => !isMirroredSystemInternalBookingTitle(b.title))
    .map((b) => ({
    id: b.id,
    title: internalBookingDisplayTitle(b.title),
    kind: "booking",
    type: b.type as BookingType,
    startDate: b.startDate,
    endDate: b.endDate,
    raw: b,
    renderBehind: Boolean(b.eventId),
  }));

  const tourItems: CalendarItem[] = tours.flatMap((tour) =>
    (tour.shows ?? [])
      .filter((show) => Boolean(show.date))
      .flatMap((show) => calendarItemsForTourShow(tour, show))
  );

  return [...eventItems, ...tourItems, ...jobItems, ...bookingItems];
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
  const dayKeyFromField = (raw: string): string => {
    const t = raw.trim();
    if (!t) return "";
    if (t.includes("T")) {
      const d = new Date(t);
      if (!Number.isFinite(d.getTime())) return t.slice(0, 10);
      return toDateStr(d);
    }
    return t.slice(0, 10);
  };
  return items.filter((item) => {
    if (!item.startDate) return false;
    const startKey = dayKeyFromField(item.startDate);
    const endKey = item.endDate ? dayKeyFromField(item.endDate) : startKey;
    return dateStr >= startKey && dateStr <= endKey;
  });
}

export function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local calendar days for one month (length 28–31). */
export function getMonthCalendarDays(anchor: Date): Date[] {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const days: Date[] = [];
  for (let d = 1; d <= last; d += 1) {
    days.push(new Date(y, m, d));
  }
  return days;
}

/**
 * Which venue id a schedule row occupies (internal booking, event/show/job).
 * Tour rows are excluded (no stable venue id in the model).
 */
export function calendarItemVenueIdForFilter(item: CalendarItem): string | null {
  if (item.kind === "summary" || item.kind === "time") return null;
  if (item.id.startsWith("tour:")) return null;
  if (item.kind === "booking") {
    const booking = item.raw as InternalBookingDetail;
    return booking.venueId ?? null;
  }
  if (item.kind === "job") {
    const event = item.raw as EventDetail;
    const jm = /:job:([^:]+)$/.exec(item.id);
    if (!jm) return null;
    for (const s of event.shows ?? []) {
      const job = s.jobs?.find((j) => j.id === jm[1]);
      if (job?.venueId) return job.venueId;
    }
    return null;
  }
  if (item.kind === "event") {
    const event = item.raw as EventDetail;
    const showMatch = /:show:([^:]+)$/.exec(item.id);
    if (showMatch?.[1]) {
      const show = (event.shows ?? []).find((s) => s.id === showMatch[1]);
      if (show?.venueId) return show.venueId;
    }
    return event.venueId ?? null;
  }
  return null;
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
  tour: "bg-fuchsia-700/85 text-fuchsia-100 border border-fuchsia-500/45",
  job: "bg-teal-600/80 text-teal-100 border border-teal-500/40",
  rehearsal: "bg-amber-600/80 text-amber-100 border border-amber-500/40",
  maintenance: "bg-slate-600/80 text-slate-100 border border-slate-500/40",
  private: "bg-purple-600/80 text-purple-100 border border-purple-500/40",
  venue_booking: "bg-rose-600/80 text-rose-100 border border-rose-500/40",
  other: "bg-blue-600/80 text-blue-100 border border-blue-500/40",
};

function timeCategoryPillClass(cat: string, isJob?: boolean): string {
  if (cat === "vacation") return "bg-emerald-500/35 text-emerald-50 border border-emerald-400/50";
  if (cat === "sick") return "bg-orange-500/35 text-orange-50 border border-orange-400/50";
  if (cat === "holiday") return "bg-purple-500/35 text-purple-50 border border-purple-400/50";
  if (cat === "extra_vacation") return "bg-teal-500/35 text-teal-50 border border-teal-400/50";
  if (cat === "comp_time") return "bg-cyan-500/35 text-cyan-50 border border-cyan-400/50";
  if (cat === "comp_settlement_earned" || cat === "comp_settlement_used") {
    return "bg-amber-500/25 text-amber-50 border border-dashed border-amber-400/55";
  }
  if (cat === "travel_allowance") return "bg-amber-500/30 text-amber-50 border border-amber-400/50";
  if (isJob) return "bg-emerald-500/30 text-emerald-50 border border-emerald-400/45";
  return "bg-sky-500/30 text-sky-50 border border-sky-400/45";
}

/** Inline project colour/fill for Tid month pills (when `accentColor` is set). */
export function itemSurfaceStyle(item: CalendarItem): CSSProperties | undefined {
  if (item.kind !== "time" || !item.accentColor || !/^#[0-9A-Fa-f]{6}$/.test(item.accentColor)) {
    return undefined;
  }
  return timeProjectSurfaceStyle(item.accentColor, item.fillPattern);
}

export function itemColor(item: CalendarItem): string {
  if (item.kind === "time") {
    if (item.accentColor && /^#[0-9A-Fa-f]{6}$/.test(item.accentColor)) {
      return "border text-white";
    }
    return timeCategoryPillClass(item.timeCategory ?? "work", item.timeIsJob);
  }
  if (item.kind === "job") return ITEM_COLORS.job;
  if (item.kind === "tour") return ITEM_COLORS.tour;
  if (item.kind === "event") return ITEM_COLORS.event;
  if (item.kind === "summary") return "bg-sky-600/80 text-sky-100 border border-sky-500/40";
  return ITEM_COLORS[item.type ?? "other"] ?? ITEM_COLORS.other;
}

/** Keys aligned with Schedule "Show:" toggles (`ScheduleFilters` visibility). */
export type ScheduleVisibilityFilterKey =
  | "event"
  | "tour"
  | "rehearsal"
  | "maintenance"
  | "private"
  | "venue_booking"
  | "other";

/**
 * Which Schedule visibility checkbox controls this row. Internal bookings use
 * `InternalBooking.type` from `raw` so `venue_booking` is not misclassified when
 * `item.type` is missing and the row incorrectly follows "Other bookings".
 */
export function scheduleVisibilityFilterKey(item: CalendarItem): ScheduleVisibilityFilterKey {
  if (item.kind === "tour") return "tour";
  if (item.kind === "event" || item.kind === "job") return "event";
  if (item.kind === "summary") return "other";
  if (item.kind === "time") return "other";
  if (item.kind === "booking") {
    const raw = item.raw as InternalBookingDetail;
    const t = (raw.type ?? item.type ?? "other").trim().toLowerCase();
    if (t === "rehearsal") return "rehearsal";
    if (t === "maintenance") return "maintenance";
    if (t === "private") return "private";
    if (t === "venue_booking") return "venue_booking";
    return "other";
  }
  return "other";
}

/**
 * Whether a calendar row passes the Schedule "Show:" toggles. Internal bookings that occupy a
 * venue (`venueId`) also match the "Venue bookings" toggle so maintenance/rehearsal/etc. appear
 * when viewing venue-heavy schedules even if their DB `type` is not `venue_booking`.
 */
export function passesScheduleVisibilityFilters(
  visibility: Record<ScheduleVisibilityFilterKey, boolean>,
  item: CalendarItem
): boolean {
  const key = scheduleVisibilityFilterKey(item);
  if (visibility[key]) return true;
  if (!visibility.venue_booking || item.kind !== "booking") return false;
  const raw = item.raw as InternalBookingDetail;
  const t = (raw.type ?? "").trim().toLowerCase();
  if (t === "venue_booking") return false;
  return Boolean(raw.venueId?.trim());
}

/** ISO string includes a time component (not date-only). */
export function hasTimedStart(item: CalendarItem): boolean {
  if (!item.startDate) return false;
  return /\dT\d/.test(item.startDate);
}

/** Venue name for calendar chips (events, jobs, tours, internal bookings). */
export function calendarItemVenueName(item: CalendarItem): string | undefined {
  if (item.kind === "job" || item.kind === "tour") {
    const v = item.venueLabel?.trim();
    return v || undefined;
  }
  if (item.kind === "event") {
    const v = (item.raw as EventDetail).venue?.name?.trim();
    return v || undefined;
  }
  if (item.kind === "booking") {
    const v = (item.raw as InternalBookingDetail).venue?.name?.trim();
    return v || undefined;
  }
  return undefined;
}

/** Local time (or range) for calendar tooltips and compact lines. */
export function calendarItemTimeRangeLabel(item: CalendarItem, hour12?: boolean): string {
  if (!hasTimedStart(item)) return "";
  const start = new Date(item.startDate);
  if (!Number.isFinite(start.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  if (hour12 != null) opts.hour12 = hour12;
  const a = start.toLocaleTimeString(undefined, opts);
  if (item.endDate) {
    const end = new Date(item.endDate);
    if (!Number.isFinite(end.getTime())) return a;
    return `${a}–${end.toLocaleTimeString(undefined, opts)}`;
  }
  return a;
}

/** One-line summary for tooltips when a venue booking sits behind an event. */
export function calendarVenueBookingSummaryLine(item: CalendarItem): string {
  if (item.kind !== "booking") return item.title;
  const v = calendarItemVenueName(item);
  const t = calendarItemTimeRangeLabel(item);
  return [item.title, v && `@ ${v}`, t].filter(Boolean).join(" · ");
}

export function calendarBlocksOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

export function eventShowIdFromJobCalendarItem(item: CalendarItem): string | null {
  if (item.kind !== "job") return null;
  const m = /^[^:]+:show:([^:]+):job:/.exec(item.id);
  return m?.[1] ?? null;
}

export function eventIdFromEventCalendarItem(item: CalendarItem): string | null {
  if (item.kind !== "event" && item.kind !== "job") return null;
  return (item.raw as EventDetail).id ?? null;
}

/** Show jobs that overlap an event-linked venue booking stack on that booking, not in a side column. */
export function jobStacksOnEventVenueBooking(
  job: TimedBlock,
  backgroundItems: TimedBlock[]
): boolean {
  if (job.item.kind !== "job") return false;
  const eventId = eventIdFromEventCalendarItem(job.item);
  if (!eventId) return false;
  return backgroundItems.some((bg) => {
    if (bg.item.renderBehind !== true || bg.item.kind !== "booking") return false;
    const booking = bg.item.raw as InternalBookingDetail & { eventId?: string | null };
    if (booking.eventId !== eventId) return false;
    return calendarBlocksOverlap(job.start, job.end, bg.start, bg.end);
  });
}

/** Share the show/event overlap column so jobs sit on top of the venue booking band. */
export function columnAnchorForStackedJob(
  job: TimedBlock,
  laidOut: LaidOutBlock[],
  _backgroundItems: TimedBlock[]
): { colIndex: number; totalCols: number } {
  const eventId = eventIdFromEventCalendarItem(job.item);
  if (!eventId) return { colIndex: 0, totalCols: 1 };

  const showId = eventShowIdFromJobCalendarItem(job.item);
  if (showId) {
    const showPill = laidOut.find(
      (fg) => fg.item.kind === "event" && fg.item.id === `${eventId}:show:${showId}`
    );
    if (showPill) return { colIndex: showPill.colIndex, totalCols: showPill.totalCols };
  }

  const overlappingShow = laidOut.find(
    (fg) =>
      fg.item.kind === "event" &&
      eventIdFromEventCalendarItem(fg.item) === eventId &&
      calendarBlocksOverlap(job.start, job.end, fg.start, fg.end)
  );
  if (overlappingShow) {
    return { colIndex: overlappingShow.colIndex, totalCols: overlappingShow.totalCols };
  }

  const sameEventShow = laidOut.find(
    (fg) => fg.item.kind === "event" && eventIdFromEventCalendarItem(fg.item) === eventId
  );
  if (sameEventShow) {
    return { colIndex: sameEventShow.colIndex, totalCols: sameEventShow.totalCols };
  }

  return { colIndex: 0, totalCols: 1 };
}

export function stackedJobOnBookingColor(_item: CalendarItem): string {
  return "bg-teal-600/50 text-teal-50 border border-teal-400/45 shadow-sm";
}

/** Venue booking row linked to this calendar event (same `eventId`, overlapping times). */
export function backingVenueBookingForEvent(
  item: CalendarItem,
  candidates: CalendarItem[]
): CalendarItem | null {
  if (item.kind !== "event" && item.kind !== "job") return null;
  const eventId = (item.raw as EventDetail).id;
  const itemStart = new Date(item.startDate);
  const itemEnd = item.endDate ? new Date(item.endDate) : new Date(itemStart.getTime() + 60 * 60 * 1000);
  if (!Number.isFinite(itemStart.getTime()) || !Number.isFinite(itemEnd.getTime())) return null;

  return (
    candidates.find((candidate) => {
      if (candidate.renderBehind !== true || candidate.kind !== "booking") return false;
      const booking = candidate.raw as InternalBookingDetail & { eventId?: string | null };
      if (booking.eventId !== eventId) return false;
      const bookingStart = new Date(candidate.startDate);
      const bookingEnd = candidate.endDate
        ? new Date(candidate.endDate)
        : new Date(bookingStart.getTime() + 60 * 60 * 1000);
      if (!Number.isFinite(bookingStart.getTime()) || !Number.isFinite(bookingEnd.getTime())) return false;
      return bookingStart.getTime() < itemEnd.getTime() && bookingEnd.getTime() > itemStart.getTime();
    }) ?? null
  );
}

/**
 * Event-linked venue bookings (`renderBehind`) that do not overlap any foreground **event** or **job**
 * pill this day — they still need their own chip (e.g. booking extends beyond the show date).
 */
export function orphanBackingVenueBookings(
  foregroundItems: CalendarItem[],
  backingItems: CalendarItem[]
): CalendarItem[] {
  const linkedIds = new Set<string>();
  for (const fg of foregroundItems) {
    const b = backingVenueBookingForEvent(fg, backingItems);
    if (b) linkedIds.add(b.id);
  }
  return backingItems.filter((b) => !linkedIds.has(b.id));
}

export function getItemTimeRange(item: CalendarItem): { start: Date; end: Date; hasExplicitTime: boolean } {
  const start = new Date(item.startDate || 0);
  const end = item.endDate ? new Date(item.endDate) : new Date(start.getTime() + 60 * 60 * 1000);
  const hasExplicitTime = hasTimedStart(item);
  return { start, end, hasExplicitTime };
}

/** True if [rangeStart, rangeEnd] overlaps any timed item (interval overlap; touching endpoints do not count). */
export function selectionOverlapsExplicitTimedItems(
  items: CalendarItem[],
  rangeStart: Date,
  rangeEnd: Date
): boolean {
  for (const item of items) {
    if (item.kind === "summary") continue;
    const { start, end, hasExplicitTime } = getItemTimeRange(item);
    if (!hasExplicitTime) continue;
    if (rangeStart < end && rangeEnd > start) return true;
  }
  return false;
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
