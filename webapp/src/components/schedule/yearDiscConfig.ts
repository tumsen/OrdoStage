import type { EventDetail, Person, TimeCategory, TimeReportEntry, TourDetail, Venue } from "../../../../backend/src/types";
import {
  calendarItemVenueIdForFilter,
  scheduleVisibilityFilterKey,
  toDateStr,
  type CalendarItem,
  type ScheduleVisibilityFilterKey,
} from "@/components/schedule/scheduleUtils";

/** What a single ring on the year disc displays. */
export type YearDiscRingSource =
  | { type: "schedule_all" }
  | { type: "schedule_filter"; filter: ScheduleVisibilityFilterKey }
  | { type: "specific_event"; eventId: string }
  | { type: "specific_tour"; tourId: string }
  | { type: "venue"; venueId: string }
  | { type: "time_category"; category: TimeCategory; personId?: string }
  | { type: "time_person"; personId: string; categories?: TimeCategory[] };

export type YearDiscRingConfig = {
  id: string;
  /** Optional override; otherwise derived from source + lookups. */
  label?: string;
  color?: string;
  source: YearDiscRingSource;
};

export type YearDiscConfig = {
  rings: YearDiscRingConfig[];
  /** How the disc maps days around the circle. Defaults to calendar year. */
  range?: YearDiscRangeSettings;
};

/** Full calendar year (Jan 1–Dec 31) or a custom span from start date through today. */
export type YearDiscRangeMode = "calendar_year" | "start_to_today";

export type YearDiscRangeSettings = {
  mode: YearDiscRangeMode;
  /** ISO YYYY-MM-DD — used when mode is `start_to_today`. */
  startDate?: string;
};

export const DEFAULT_YEAR_DISC_RANGE: YearDiscRangeSettings = {
  mode: "calendar_year",
};

export type YearDiscTimeline = {
  mode: YearDiscRangeMode;
  totalDays: number;
  from: string;
  to: string;
  rangeLabel: string;
  startDate: Date;
  endDate: Date;
  /** Calendar year when mode is `calendar_year`. */
  year?: number;
  dateFromDiscDay: (day: number) => Date;
  discDayFromDate: (date: Date) => number | null;
  clipSpan: (span: YearDiscSpan) => { startDay: number; endDay: number } | null;
};

export type YearDiscSpan = {
  id: string;
  title: string;
  startDate: string;
  endDate: string | null;
  opacity?: number;
  calendarItem?: CalendarItem;
  timeEntryId?: string;
};

export type YearDiscResolveContext = {
  calendarItems: CalendarItem[];
  events: EventDetail[];
  tours: TourDetail[];
  venues: Venue[];
  people: Person[];
  timeEntries?: TimeReportEntry[];
};

const SCHEDULE_FILTER_LABELS: Record<ScheduleVisibilityFilterKey, string> = {
  event: "Events",
  tour: "Tours",
  rehearsal: "Rehearsals",
  maintenance: "Maintenance",
  private: "Private",
  venue_booking: "Venue bookings",
  other: "Other bookings",
};

const TIME_CATEGORY_LABELS: Record<TimeCategory, string> = {
  work: "Work time",
  vacation: "Vacation",
  sick: "Sick leave",
  holiday: "Holiday",
  travel_allowance: "Travel allowance",
};

export const YEAR_DISC_RING_PALETTE = [
  "rgba(79, 70, 229, 0.92)",
  "rgba(162, 28, 175, 0.92)",
  "rgba(217, 119, 6, 0.92)",
  "rgba(225, 29, 72, 0.92)",
  "rgba(37, 99, 235, 0.88)",
  "rgba(13, 148, 136, 0.92)",
  "rgba(234, 88, 12, 0.92)",
  "rgba(100, 116, 139, 0.92)",
  "rgba(168, 85, 247, 0.92)",
  "rgba(22, 163, 74, 0.92)",
  "rgba(244, 63, 94, 0.92)",
  "rgba(14, 165, 233, 0.92)",
] as const;

export const DEFAULT_YEAR_DISC_CONFIG: YearDiscConfig = {
  rings: [
    { id: "ring-event", source: { type: "schedule_filter", filter: "event" } },
    { id: "ring-tour", source: { type: "schedule_filter", filter: "tour" } },
    { id: "ring-rehearsal", source: { type: "schedule_filter", filter: "rehearsal" } },
    { id: "ring-venue", source: { type: "schedule_filter", filter: "venue_booking" } },
    { id: "ring-other", source: { type: "schedule_filter", filter: "other" } },
  ],
  range: DEFAULT_YEAR_DISC_RANGE,
};

export const YEAR_DISC_MAX_RINGS = 12;

/** The disc always has one tick per day on a full circle. */
export const YEAR_DISC_DAYS = 365;

const SCHEDULE_FILTERS: ScheduleVisibilityFilterKey[] = [
  "event",
  "tour",
  "rehearsal",
  "maintenance",
  "private",
  "venue_booking",
  "other",
];

const TIME_CATEGORIES: TimeCategory[] = ["work", "vacation", "sick", "holiday", "travel_allowance"];

export type YearDiscSourceOption =
  | { group: "schedule"; value: YearDiscRingSource; label: string }
  | { group: "time"; value: YearDiscRingSource; label: string; needsTimeData: boolean };

/** Flat list for the ring source picker (entity ids chosen separately when needed). */
export function yearDiscSourceOptions(): YearDiscSourceOption[] {
  const schedule: YearDiscSourceOption[] = [
    { group: "schedule", value: { type: "schedule_all" }, label: "All schedule" },
    ...SCHEDULE_FILTERS.map(
      (filter): YearDiscSourceOption => ({
        group: "schedule",
        value: { type: "schedule_filter", filter },
        label: `All ${SCHEDULE_FILTER_LABELS[filter].toLowerCase()}`,
      })
    ),
    { group: "schedule", value: { type: "specific_event", eventId: "" }, label: "Specific event" },
    { group: "schedule", value: { type: "specific_tour", tourId: "" }, label: "Specific tour" },
    { group: "schedule", value: { type: "venue", venueId: "" }, label: "Specific venue" },
  ];

  const time: YearDiscSourceOption[] = [
    ...TIME_CATEGORIES.map(
      (category): YearDiscSourceOption => ({
        group: "time",
        value: { type: "time_category", category },
        label: `All ${TIME_CATEGORY_LABELS[category].toLowerCase()}`,
        needsTimeData: true,
      })
    ),
    {
      group: "time",
      value: { type: "time_person", personId: "", categories: [] },
      label: "Specific person (all time)",
      needsTimeData: true,
    },
    ...TIME_CATEGORIES.map(
      (category): YearDiscSourceOption => ({
        group: "time",
        value: { type: "time_person", personId: "", categories: [category] },
        label: `Specific person (${TIME_CATEGORY_LABELS[category].toLowerCase()})`,
        needsTimeData: true,
      })
    ),
  ];

  return [...schedule, ...time];
}

export function ringUsesTimeData(source: YearDiscRingSource): boolean {
  return source.type === "time_category" || source.type === "time_person";
}

export function ringNeedsEntityPicker(source: YearDiscRingSource): "event" | "tour" | "venue" | "person" | null {
  if (source.type === "specific_event") return "event";
  if (source.type === "specific_tour") return "tour";
  if (source.type === "venue") return "venue";
  if (source.type === "time_person") return "person";
  if (source.type === "time_category" && source.personId) return "person";
  return null;
}

export function newYearDiscRingId(): string {
  return `ring-${crypto.randomUUID().slice(0, 8)}`;
}

export function createYearDiscRing(source: YearDiscRingSource = { type: "schedule_filter", filter: "event" }): YearDiscRingConfig {
  return { id: newYearDiscRingId(), source };
}

/** Build a disc config with `count` rings (1–12), using defaults for the first slots. */
export function buildYearDiscConfig(count: number, base: YearDiscConfig = DEFAULT_YEAR_DISC_CONFIG): YearDiscConfig {
  const n = Math.max(1, Math.min(YEAR_DISC_MAX_RINGS, count));
  const rings: YearDiscRingConfig[] = [];
  for (let i = 0; i < n; i++) {
    if (base.rings[i]) {
      rings.push({ ...base.rings[i], id: base.rings[i].id || newYearDiscRingId() });
    } else {
      rings.push(createYearDiscRing({ type: "schedule_filter", filter: "event" }));
    }
  }
  return { rings };
}

function isScheduleFilterKey(value: string): value is ScheduleVisibilityFilterKey {
  return (SCHEDULE_FILTERS as string[]).includes(value);
}

function isTimeCategory(value: string): value is TimeCategory {
  return (TIME_CATEGORIES as string[]).includes(value);
}

function parseRingSource(raw: unknown): YearDiscRingSource | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const type = s.type;
  if (type === "schedule_all") return { type: "schedule_all" };
  if (type === "schedule_filter" && typeof s.filter === "string" && isScheduleFilterKey(s.filter)) {
    return { type: "schedule_filter", filter: s.filter };
  }
  if (type === "specific_event" && typeof s.eventId === "string") {
    return { type: "specific_event", eventId: s.eventId };
  }
  if (type === "specific_tour" && typeof s.tourId === "string") {
    return { type: "specific_tour", tourId: s.tourId };
  }
  if (type === "venue" && typeof s.venueId === "string") {
    return { type: "venue", venueId: s.venueId };
  }
  if (type === "time_category" && typeof s.category === "string" && isTimeCategory(s.category)) {
    return {
      type: "time_category",
      category: s.category,
      ...(typeof s.personId === "string" && s.personId ? { personId: s.personId } : {}),
    };
  }
  if (type === "time_person" && typeof s.personId === "string") {
    const categories = Array.isArray(s.categories)
      ? s.categories.filter((c): c is TimeCategory => typeof c === "string" && isTimeCategory(c))
      : undefined;
    return { type: "time_person", personId: s.personId, categories };
  }
  return null;
}

function parseRangeSettings(raw: unknown): YearDiscRangeSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_YEAR_DISC_RANGE;
  const r = raw as Record<string, unknown>;
  if (r.mode === "start_to_today") {
    const startDate =
      typeof r.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.startDate)
        ? r.startDate
        : `${new Date().getFullYear()}-01-01`;
    return { mode: "start_to_today", startDate };
  }
  return { mode: "calendar_year" };
}

export function normalizeYearDiscRange(raw: unknown): YearDiscRangeSettings {
  return parseRangeSettings(raw);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function daysInCalendarYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

function dayOfCalendarYear(date: Date): number {
  const jan1 = new Date(date.getFullYear(), 0, 1);
  return Math.floor((startOfLocalDay(date).getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

export function daysBetweenInclusive(start: Date, end: Date): number {
  const ms = startOfLocalDay(end).getTime() - startOfLocalDay(start).getTime();
  return Math.max(1, Math.floor(ms / (24 * 60 * 60 * 1000)) + 1);
}

export function todayIsoDateLocal(): string {
  return toDateStr(new Date());
}

export function parseIsoDateLocal(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** API from/to for schedule + time data given disc range settings. */
export function yearDiscFetchRange(
  settings: YearDiscRangeSettings,
  calendarYear: number,
  now: Date = new Date()
): { from: string; to: string } {
  if (settings.mode === "start_to_today") {
    const anchorIso = settings.startDate ?? toDateStr(now);
    const anchor = parseIsoDateLocal(anchorIso) ?? startOfLocalDay(now);
    const start = addLocalDays(startOfLocalDay(anchor), -(YEAR_DISC_DAYS - 1));
    return { from: toDateStr(start), to: toDateStr(startOfLocalDay(anchor)) };
  }
  return { from: `${calendarYear}-01-01`, to: `${calendarYear}-12-31` };
}

function calendarDayFromDiscDay(year: number, discDay: number): number {
  const yearLen = daysInCalendarYear(year);
  if (yearLen === YEAR_DISC_DAYS) return discDay;
  return Math.min(
    yearLen,
    Math.round(((discDay - 1) * (yearLen - 1)) / (YEAR_DISC_DAYS - 1)) + 1
  );
}

function discDayFromCalendarDay(year: number, calendarDay: number): number {
  const yearLen = daysInCalendarYear(year);
  if (yearLen === YEAR_DISC_DAYS) return calendarDay;
  return Math.min(
    YEAR_DISC_DAYS,
    Math.round(((calendarDay - 1) * (YEAR_DISC_DAYS - 1)) / (yearLen - 1)) + 1
  );
}

/** Map disc settings to the timeline used for rendering. */
export function buildYearDiscTimeline(
  settings: YearDiscRangeSettings,
  calendarYear: number,
  now: Date = new Date()
): YearDiscTimeline {
  const today = startOfLocalDay(now);
  const totalDays = YEAR_DISC_DAYS;

  if (settings.mode === "start_to_today") {
    const parsedAnchor = settings.startDate ? parseIsoDateLocal(settings.startDate) : null;
    const endDate = startOfLocalDay(parsedAnchor ?? today);
    const startDate = addLocalDays(endDate, -(YEAR_DISC_DAYS - 1));
    const from = toDateStr(startDate);
    const to = toDateStr(endDate);

    const dateFromDiscDay = (day: number): Date => addLocalDays(startDate, day - 1);

    const discDayFromDate = (date: Date): number | null => {
      const d = startOfLocalDay(date);
      if (d < startDate || d > endDate) return null;
      return daysBetweenInclusive(startDate, d);
    };

    const clipSpan = (span: YearDiscSpan): { startDay: number; endDay: number } | null => {
      const spanStart = startOfLocalDay(new Date(span.startDate));
      const spanEnd = startOfLocalDay(new Date(span.endDate ?? span.startDate));
      if (spanEnd < startDate || spanStart > endDate) return null;
      const clippedStart = spanStart < startDate ? startDate : spanStart;
      const clippedEnd = spanEnd > endDate ? endDate : spanEnd;
      const startDay = discDayFromDate(clippedStart);
      const endDay = discDayFromDate(clippedEnd);
      if (startDay === null || endDay === null) return null;
      return { startDay, endDay };
    };

    const endLabel = endDate.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    return {
      mode: "start_to_today",
      totalDays,
      from,
      to,
      rangeLabel: `365 days → ${endLabel}`,
      startDate,
      endDate,
      dateFromDiscDay,
      discDayFromDate,
      clipSpan,
    };
  }

  const year = calendarYear;
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);

  const dateFromDiscDay = (day: number): Date => new Date(year, 0, calendarDayFromDiscDay(year, day));

  const discDayFromDate = (date: Date): number | null => {
    if (date.getFullYear() !== year) return null;
    return discDayFromCalendarDay(year, dayOfCalendarYear(date));
  };

  const clipSpan = (span: YearDiscSpan): { startDay: number; endDay: number } | null => {
    const spanStart = new Date(span.startDate);
    const spanEnd = new Date(span.endDate ?? span.startDate);
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
    if (spanEnd < yearStart || spanStart > yearEnd) return null;
    const clippedStart = spanStart < yearStart ? yearStart : spanStart;
    const clippedEnd = spanEnd > yearEnd ? yearEnd : spanEnd;
    return {
      startDay: discDayFromCalendarDay(year, dayOfCalendarYear(clippedStart)),
      endDay: discDayFromCalendarDay(year, dayOfCalendarYear(clippedEnd)),
    };
  };

  return {
    mode: "calendar_year",
    year,
    totalDays,
    from: `${year}-01-01`,
    to: `${year}-12-31`,
    rangeLabel: String(year),
    startDate,
    endDate,
    dateFromDiscDay,
    discDayFromDate,
    clipSpan,
  };
}

export function defaultDiscDay(timeline: YearDiscTimeline, now: Date = new Date()): number {
  const todayDay = timeline.discDayFromDate(now);
  if (todayDay !== null) return todayDay;
  return timeline.mode === "calendar_year" ? 1 : YEAR_DISC_DAYS;
}

export function normalizeYearDiscConfig(raw: unknown): YearDiscConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_YEAR_DISC_CONFIG;
  const ringsRaw = (raw as { rings?: unknown }).rings;
  const rangeRaw = (raw as { range?: unknown }).range;
  const range = rangeRaw !== undefined ? parseRangeSettings(rangeRaw) : DEFAULT_YEAR_DISC_RANGE;
  if (!Array.isArray(ringsRaw) || ringsRaw.length === 0) {
    return { ...DEFAULT_YEAR_DISC_CONFIG, range };
  }

  const rings: YearDiscRingConfig[] = [];
  for (const entry of ringsRaw.slice(0, YEAR_DISC_MAX_RINGS)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const source = parseRingSource(e.source);
    if (!source) continue;
    rings.push({
      id: typeof e.id === "string" && e.id ? e.id : newYearDiscRingId(),
      ...(typeof e.label === "string" && e.label.trim() ? { label: e.label.trim() } : {}),
      ...(typeof e.color === "string" && e.color.trim() ? { color: e.color.trim() } : {}),
      source,
    });
  }

  return rings.length > 0 ? { rings, range } : { ...DEFAULT_YEAR_DISC_CONFIG, range };
}

export function yearDiscRingColor(ring: YearDiscRingConfig, index: number): string {
  return ring.color ?? YEAR_DISC_RING_PALETTE[index % YEAR_DISC_RING_PALETTE.length]!;
}

export function calendarItemEventId(item: CalendarItem): string | null {
  if (item.kind === "event" || item.kind === "job") {
    return (item.raw as EventDetail).id;
  }
  return null;
}

export function calendarItemTourId(item: CalendarItem): string | null {
  if (item.kind !== "tour") return null;
  const match = /^tour:([^:]+)/.exec(item.id);
  return match?.[1] ?? null;
}

/** Optional header filters for year disc (venue uses API query param). */
export function filterCalendarItemsForYearDisc(
  items: CalendarItem[],
  filters: { eventId: string; tourId: string }
): CalendarItem[] {
  let out = items;
  if (filters.eventId !== "all") {
    out = out.filter((item) => calendarItemEventId(item) === filters.eventId);
  }
  if (filters.tourId !== "all") {
    out = out.filter((item) => calendarItemTourId(item) === filters.tourId);
  }
  return out;
}

function sourceOptionKey(source: YearDiscRingSource): string {
  if (source.type === "schedule_all") return "schedule_all";
  if (source.type === "schedule_filter") return `schedule_filter:${source.filter}`;
  if (source.type === "specific_event") return "specific_event";
  if (source.type === "specific_tour") return "specific_tour";
  if (source.type === "venue") return "venue";
  if (source.type === "time_category") {
    return source.personId
      ? `time_category:${source.category}:${source.personId}`
      : `time_category:${source.category}`;
  }
  const cats = source.categories?.length ? source.categories.join(",") : "all";
  return `time_person:${cats}`;
}

export function matchSourceOption(source: YearDiscRingSource, option: YearDiscRingSource): boolean {
  return sourceOptionKey(source) === sourceOptionKey(option);
}

export function yearDiscRingLabel(ring: YearDiscRingConfig, ctx: YearDiscResolveContext): string {
  if (ring.label?.trim()) return ring.label.trim();
  const source = ring.source;
  if (source.type === "schedule_all") return "All schedule";
  if (source.type === "schedule_filter") return SCHEDULE_FILTER_LABELS[source.filter];
  if (source.type === "specific_event") {
    const event = ctx.events.find((e) => e.id === source.eventId);
    return event ? `Event: ${event.title}` : "Specific event";
  }
  if (source.type === "specific_tour") {
    const tour = ctx.tours.find((t) => t.id === source.tourId);
    return tour ? `Tour: ${tour.name}` : "Specific tour";
  }
  if (source.type === "venue") {
    const venue = ctx.venues.find((v) => v.id === source.venueId);
    return venue ? `Venue: ${venue.name}` : "Specific venue";
  }
  if (source.type === "time_category") {
    const base = TIME_CATEGORY_LABELS[source.category];
    if (source.personId) {
      const person = ctx.people.find((p) => p.id === source.personId);
      return person ? `${base} · ${person.name}` : base;
    }
    return `All ${base.toLowerCase()}`;
  }
  if (source.type === "time_person") {
    const person = ctx.people.find((p) => p.id === source.personId);
    const name = person?.name ?? "Person";
    if (source.categories?.length === 1) {
      return `${name} · ${TIME_CATEGORY_LABELS[source.categories[0]!]}`;
    }
    return `${name} · time`;
  }
  return "Ring";
}

function calendarItemMatchesRing(item: CalendarItem, source: YearDiscRingSource): boolean {
  if (item.kind === "summary") return false;
  if (source.type === "schedule_all") return true;
  if (source.type === "schedule_filter") {
    return scheduleVisibilityFilterKey(item) === source.filter;
  }
  if (source.type === "specific_event") {
    if (!source.eventId) return false;
    return calendarItemEventId(item) === source.eventId;
  }
  if (source.type === "specific_tour") {
    if (!source.tourId) return false;
    return calendarItemTourId(item) === source.tourId;
  }
  if (source.type === "venue") {
    if (!source.venueId) return false;
    return calendarItemVenueIdForFilter(item) === source.venueId;
  }
  return false;
}

function timeEntryMatchesRing(entry: TimeReportEntry, source: YearDiscRingSource): boolean {
  if (source.type === "time_category") {
    if (entry.category !== source.category) return false;
    if (source.personId && entry.personId !== source.personId) return false;
    return true;
  }
  if (source.type === "time_person") {
    if (!source.personId || entry.personId !== source.personId) return false;
    if (source.categories?.length) return source.categories.includes(entry.category);
    return true;
  }
  return false;
}

function calendarItemToSpan(item: CalendarItem): YearDiscSpan {
  return {
    id: item.id,
    title: item.title,
    startDate: item.startDate,
    endDate: item.endDate,
    opacity: item.disabled ? 0.35 : 1,
    calendarItem: item,
  };
}

function timeEntryToSpan(entry: TimeReportEntry): YearDiscSpan {
  const title = entry.note?.trim()
    ? `${entry.personName} · ${entry.note}`
    : `${entry.personName} · ${TIME_CATEGORY_LABELS[entry.category] ?? entry.category}`;
  return {
    id: `time:${entry.id}`,
    title,
    startDate: entry.startsAt,
    endDate: entry.endsAt,
    timeEntryId: entry.id,
  };
}

/** Items shown on one ring for the given year. */
export function resolveYearDiscRingSpans(
  ring: YearDiscRingConfig,
  ctx: YearDiscResolveContext
): YearDiscSpan[] {
  const source = ring.source;
  if (ringUsesTimeData(source)) {
    const entries = ctx.timeEntries ?? [];
    return entries.filter((e) => timeEntryMatchesRing(e, source)).map(timeEntryToSpan);
  }
  return ctx.calendarItems
    .filter((item) => calendarItemMatchesRing(item, source))
    .map(calendarItemToSpan);
}

export function serializeYearDiscConfig(config: YearDiscConfig): string {
  return JSON.stringify(config);
}

export function deserializeYearDiscConfig(raw: string | null): YearDiscConfig {
  if (!raw) return DEFAULT_YEAR_DISC_CONFIG;
  try {
    return normalizeYearDiscConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_YEAR_DISC_CONFIG;
  }
}
