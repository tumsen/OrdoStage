import { mergedScheduleEvents } from "./tourScheduleEvents";
import {
  endTimeFromStartAndDuration,
  normalizeTimeHHMM,
  timeToMinutes,
} from "./timeHHMM";
import { wallClockInstantFromStoredDayAndHHMM, getClientWallClockZone } from "../clientWallClock";
import type {
  ProductionCostCategory,
  ProductionCostLine,
  ProductionPlannerRow,
  ProductionPlannerTask,
} from "../types";

type TaskCategory = ProductionPlannerTask["category"];

const EVENT_SLOT_LABELS: Record<string, string> = {
  get_in: "Get-in",
  get_out: "Get-out",
  rehearsal: "Rehearsal",
  soundcheck: "Soundcheck",
  break: "Break",
};

const TOUR_KIND_LABELS: Record<string, string> = {
  get_in: "Get-in",
  get_out: "Get-out",
  show: "Show",
  rehearsal: "Rehearsal",
  soundcheck: "Soundcheck",
  travel: "Travel",
  custom: "Custom",
};

function iso(d: Date): string {
  return d.toISOString();
}

function ymdFromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function durationMinutesBetween(start: string, end: string): number | null {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s === null || e === null) return null;
  return e >= s ? e - s : e + 24 * 60 - s;
}

function instantFromDayAndTime(day: Date, hhmm: string | null | undefined, durationMin: number): {
  start: Date;
  end: Date;
} | null {
  if (!hhmm?.trim()) return null;
  const zone = getClientWallClockZone();
  const start = wallClockInstantFromStoredDayAndHHMM(day, hhmm, zone);
  if (!start) return null;
  const endNorm = endTimeFromStartAndDuration(normalizeTimeHHMM(hhmm), durationMin);
  const end = endNorm
    ? wallClockInstantFromStoredDayAndHHMM(day, endNorm, zone)
    : null;
  const endDate = end ?? new Date(start.getTime() + durationMin * 60_000);
  return { start, end: endDate };
}

function daySpanInstant(day: Date): { start: Date; end: Date } {
  const zone = getClientWallClockZone();
  const start =
    wallClockInstantFromStoredDayAndHHMM(day, "00:00", zone) ?? new Date(day);
  const end =
    wallClockInstantFromStoredDayAndHHMM(day, "23:59", zone) ??
    new Date(start.getTime() + 24 * 60 * 60_000 - 60_000);
  return { start, end: end ?? new Date(start.getTime() + 24 * 60 * 60_000 - 60_000) };
}

function makeTask(
  id: string,
  label: string,
  category: TaskCategory,
  start: Date,
  end: Date,
  extra?: Partial<ProductionPlannerTask>
): ProductionPlannerTask {
  return {
    id,
    label,
    category,
    start: iso(start),
    end: iso(end),
    status: extra?.status ?? null,
    dayLabel: extra?.dayLabel ?? null,
    venueLabel: extra?.venueLabel ?? null,
    departmentName: extra?.departmentName ?? null,
    assigneeName: extra?.assigneeName ?? null,
    costPlannedCents: extra?.costPlannedCents ?? null,
    costActualCents: extra?.costActualCents ?? null,
  };
}

function summarizeCosts(
  lines: ProductionCostLine[],
  currencyCode: string,
  loggedLaborMinutes: number
): ProductionPlannerRow["costSummary"] {
  const byCat = new Map<ProductionCostCategory, { planned: number; actual: number }>();
  let plannedCents = 0;
  let actualCents = 0;
  for (const line of lines) {
    plannedCents += line.plannedCents;
    actualCents += line.actualCents ?? 0;
    const cur = byCat.get(line.category) ?? { planned: 0, actual: 0 };
    cur.planned += line.plannedCents;
    cur.actual += line.actualCents ?? 0;
    byCat.set(line.category, cur);
  }
  return {
    currencyCode,
    plannedCents,
    actualCents,
    varianceCents: actualCents - plannedCents,
    loggedLaborMinutes,
    byCategory: [...byCat.entries()].map(([category, v]) => ({
      category,
      plannedCents: v.planned,
      actualCents: v.actual,
    })),
  };
}

function costTasksFromLines(lines: ProductionCostLine[]): ProductionPlannerTask[] {
  return lines
    .filter((l) => l.startDate)
    .map((line) => {
      const start = new Date(line.startDate!);
      const end = line.endDate ? new Date(line.endDate) : new Date(start.getTime() + 24 * 60 * 60_000);
      return makeTask(`cost:${line.id}`, line.label, "cost", start, end, {
        costPlannedCents: line.plannedCents,
        costActualCents: line.actualCents,
      });
    });
}

type EventRowInput = {
  id: string;
  title: string;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  venue: { name: string } | null;
  shows: Array<{
    id: string;
    showDate: Date;
    showTime: string;
    durationMinutes: number;
    status: string;
    venue: { name: string };
    getInTime: string | null;
    getInDurationMinutes: number | null;
    getOutTime: string | null;
    getOutDurationMinutes: number | null;
    rehearsalTime: string | null;
    rehearsalDurationMinutes: number | null;
    soundcheckTime: string | null;
    soundcheckDurationMinutes: number | null;
    breakTime: string | null;
    breakDurationMinutes: number | null;
    jobs: Array<{
      id: string;
      title: string;
      jobDate: Date;
      startTime: string;
      durationMinutes: number;
      venue: { name: string };
      department: { name: string } | null;
      person: { name: string } | null;
      assignments: Array<{ person: { name: string } }>;
    }>;
  }>;
};

export function buildEventPlannerRow(
  event: EventRowInput,
  costLines: ProductionCostLine[],
  loggedLaborMinutes: number,
  currencyCode: string
): ProductionPlannerRow {
  const tasks: ProductionPlannerTask[] = [];

  if (event.startDate && event.endDate) {
    tasks.push(
      makeTask(
        `event-window:${event.id}`,
        "Production window",
        "production_window",
        event.startDate,
        event.endDate,
        { status: event.status }
      )
    );
  }

  for (const show of event.shows) {
    const day = show.showDate;
    const dayLabel = ymdFromDate(day);
    const venueLabel = show.venue?.name ?? null;

    const perf = instantFromDayAndTime(day, show.showTime, show.durationMinutes);
    if (perf) {
      tasks.push(
        makeTask(`show:${show.id}`, "Performance", "performance", perf.start, perf.end, {
          status: show.status,
          dayLabel,
          venueLabel,
        })
      );
    }

    const slots: Array<[string, string | null, number | null]> = [
      ["get_in", show.getInTime, show.getInDurationMinutes ?? 60],
      ["rehearsal", show.rehearsalTime, show.rehearsalDurationMinutes ?? 60],
      ["soundcheck", show.soundcheckTime, show.soundcheckDurationMinutes ?? 60],
      ["get_out", show.getOutTime, show.getOutDurationMinutes ?? 60],
      ["break", show.breakTime, show.breakDurationMinutes ?? 30],
    ];
    for (const [key, time, dur] of slots) {
      const span = instantFromDayAndTime(day, time, dur ?? 60);
      if (!span) continue;
      tasks.push(
        makeTask(
          `slot:${show.id}:${key}`,
          EVENT_SLOT_LABELS[key] ?? key,
          key === "get_in" ? "get_in" : key === "get_out" ? "get_out" : key === "rehearsal" ? "rehearsal" : key === "soundcheck" ? "soundcheck" : "custom",
          span.start,
          span.end,
          { dayLabel, venueLabel }
        )
      );
    }

    for (const job of show.jobs) {
      const span = instantFromDayAndTime(job.jobDate, job.startTime, job.durationMinutes);
      if (!span) continue;
      const assignees = job.assignments.map((a) => a.person.name).join(", ") || job.person?.name || null;
      tasks.push(
        makeTask(`job:${job.id}`, job.title, "job", span.start, span.end, {
          dayLabel: ymdFromDate(job.jobDate),
          venueLabel: job.venue?.name ?? venueLabel,
          departmentName: job.department?.name ?? null,
          assigneeName: assignees,
        })
      );
    }
  }

  tasks.push(...costTasksFromLines(costLines));

  const showDates = event.shows.map((s) => s.showDate.getTime());
  const startDate =
    event.startDate?.toISOString().slice(0, 10) ??
    (showDates.length ? ymdFromDate(new Date(Math.min(...showDates))) : null);
  const endDate =
    event.endDate?.toISOString().slice(0, 10) ??
    (showDates.length ? ymdFromDate(new Date(Math.max(...showDates))) : null);

  return {
    id: event.id,
    kind: "event",
    title: event.title,
    status: event.status,
    startDate,
    endDate,
    venueLabel: event.venue?.name ?? event.shows[0]?.venue?.name ?? null,
    href: `/events/${event.id}`,
    tasks,
    costs: costLines,
    costSummary: summarizeCosts(costLines, currencyCode, loggedLaborMinutes),
  };
}

type TourRowInput = {
  id: string;
  name: string;
  status: string;
  shows: Array<{
    id: string;
    date: Date;
    dayKey: string;
    type: string;
    fromLocation: string | null;
    toLocation: string | null;
    venueName: string | null;
    venueCity: string | null;
    showTime: string | null;
    getInTime: string | null;
    rehearsalTime: string | null;
    soundcheckTime: string | null;
    doorsTime: string | null;
    scheduleEvents: Array<{
      id: string;
      kind: string;
      customLabel: string | null;
      startTime: string;
      endTime: string;
      sortOrder: number;
    }>;
  }>;
};

export function buildTourPlannerRow(
  tour: TourRowInput,
  costLines: ProductionCostLine[],
  loggedLaborMinutes: number,
  currencyCode: string
): ProductionPlannerRow {
  const tasks: ProductionPlannerTask[] = [];

  for (const show of tour.shows) {
    const day = show.date;
    const dayLabel = show.dayKey || ymdFromDate(day);
    const venueLabel =
      show.venueName?.trim() ||
      [show.venueCity, show.toLocation].filter(Boolean).join(" · ") ||
      null;

    if (show.type === "travel") {
      const span = daySpanInstant(day);
      const label = [show.fromLocation, show.toLocation].filter(Boolean).join(" → ") || "Travel day";
      tasks.push(makeTask(`travel:${show.id}`, label, "travel", span.start, span.end, { dayLabel }));
      continue;
    }

    if (show.type === "day_off") {
      const span = daySpanInstant(day);
      tasks.push(makeTask(`off:${show.id}`, "Day off", "day_off", span.start, span.end, { dayLabel }));
      continue;
    }

    const evs = mergedScheduleEvents(show);
    if (evs.length === 0 && show.showTime) {
      const span = instantFromDayAndTime(day, show.showTime, 90);
      if (span) {
        tasks.push(
          makeTask(`tour-show:${show.id}`, "Show", "performance", span.start, span.end, {
            dayLabel,
            venueLabel,
          })
        );
      }
      continue;
    }

    for (const ev of evs) {
      const label =
        ev.kind === "custom" && ev.customLabel?.trim()
          ? ev.customLabel.trim()
          : TOUR_KIND_LABELS[ev.kind] ?? ev.kind;
      const startNorm = normalizeTimeHHMM(ev.startTime);
      const endNorm = normalizeTimeHHMM(ev.endTime);
      let mins = startNorm && endNorm ? durationMinutesBetween(startNorm, endNorm) : null;
      if (mins == null || mins <= 0) mins = 60;
      const span = instantFromDayAndTime(day, startNorm || ev.startTime, mins);
      if (!span) continue;
      const cat: TaskCategory =
        ev.kind === "show"
          ? "performance"
          : ev.kind === "get_in"
            ? "get_in"
            : ev.kind === "get_out"
              ? "get_out"
              : ev.kind === "rehearsal"
                ? "rehearsal"
                : ev.kind === "soundcheck"
                  ? "soundcheck"
                  : ev.kind === "travel"
                    ? "travel"
                    : "custom";
      tasks.push(
        makeTask(`tour-ev:${ev.id}`, label, cat, span.start, span.end, { dayLabel, venueLabel })
      );
    }
  }

  tasks.push(...costTasksFromLines(costLines));

  const dates = tour.shows.map((s) => s.date.getTime());
  const startDate = dates.length ? ymdFromDate(new Date(Math.min(...dates))) : null;
  const endDate = dates.length ? ymdFromDate(new Date(Math.max(...dates))) : null;

  return {
    id: tour.id,
    kind: "tour",
    title: tour.name,
    status: tour.status,
    startDate,
    endDate,
    venueLabel: null,
    href: `/tours/${tour.id}`,
    tasks,
    costs: costLines,
    costSummary: summarizeCosts(costLines, currencyCode, loggedLaborMinutes),
  };
}

export function mergePlannerTotals(
  rows: ProductionPlannerRow[],
  currencyCode: string
): ProductionPlannerRow["costSummary"] {
  const byCat = new Map<ProductionCostCategory, { planned: number; actual: number }>();
  let plannedCents = 0;
  let actualCents = 0;
  let loggedLaborMinutes = 0;
  for (const row of rows) {
    plannedCents += row.costSummary.plannedCents;
    actualCents += row.costSummary.actualCents;
    loggedLaborMinutes += row.costSummary.loggedLaborMinutes;
    for (const c of row.costSummary.byCategory) {
      const cur = byCat.get(c.category) ?? { planned: 0, actual: 0 };
      cur.planned += c.plannedCents;
      cur.actual += c.actualCents;
      byCat.set(c.category, cur);
    }
  }
  return {
    currencyCode,
    plannedCents,
    actualCents,
    varianceCents: actualCents - plannedCents,
    loggedLaborMinutes,
    byCategory: [...byCat.entries()].map(([category, v]) => ({
      category,
      plannedCents: v.planned,
      actualCents: v.actual,
    })),
  };
}
