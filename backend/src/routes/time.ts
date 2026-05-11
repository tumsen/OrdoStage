import { Hono } from "hono";
import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { canAction, canView } from "../requestRole";
import type { EffectiveRole } from "../effectiveRole";
import { isPostgresDatabaseUrl } from "../databaseUrl";
import { getCountryRuleSet, type TravelAllowanceType, type TravelClaimDayLine } from "../rules/countryRuleSets";
import {
  CreateTimeTagSchema,
  PatchTimeTagSchema,
  CreateTimeProjectSchema,
  PatchTimeProjectSchema,
  CreateTimeEntrySchema,
  PatchTimeEntrySchema,
  CreateTimeTravelClaimSchema,
  PatchTimeTravelClaimSchema,
  ApproveTimesheetSchema,
  SetPersonContractSchema,
  TIME_CATEGORIES,
  type TimeCategory,
} from "../types";

const timeRouter = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    effectiveRole?: EffectiveRole;
  };
}>();

function iso(d: Date) {
  return d.toISOString();
}

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Calendar day in UTC, e.g. "12 May 2026" — matches how show dates are stored. */
function formatDayUtc(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Ensure every org event/performance and tour/show has a matching TimeProject row so
 * they appear in pickers without manual link steps.
 */
async function syncEventShowTimeProjects(organizationId: string) {
  const events = await prisma.event.findMany({
    where: { organizationId },
    select: {
      id: true,
      title: true,
      shows: {
        select: { id: true, showDate: true, showTime: true },
        orderBy: { showDate: "asc" },
      },
    },
    orderBy: { title: "asc" },
  });

  for (const ev of events) {
    const eventTitle = ev.title.trim() || "Untitled event";

    const existingEvProj = await prisma.timeProject.findFirst({
      where: { organizationId, eventId: ev.id, eventShowId: null },
    });
    if (existingEvProj) {
      if (existingEvProj.name !== eventTitle) {
        await prisma.timeProject.update({
          where: { id: existingEvProj.id },
          data: { name: eventTitle },
        });
      }
    } else {
      await prisma.timeProject.create({
        data: {
          organizationId,
          name: eventTitle,
          eventId: ev.id,
          eventShowId: null,
          sortOrder: 0,
        },
      });
    }

    for (const show of ev.shows) {
      const datePart = formatDayUtc(show.showDate);
      const baseTitle = `${eventTitle} · ${datePart}`;
      const targetName = show.showTime?.trim()
        ? `${baseTitle} ${show.showTime.trim()}`
        : baseTitle;
      const existingShowProj = await prisma.timeProject.findFirst({
        where: { organizationId, eventShowId: show.id },
      });
      if (existingShowProj) {
        if (existingShowProj.name !== targetName || existingShowProj.eventId !== ev.id) {
          await prisma.timeProject.update({
            where: { id: existingShowProj.id },
            data: { name: targetName, eventId: ev.id },
          });
        }
      } else {
        await prisma.timeProject.create({
          data: {
            organizationId,
            name: targetName,
            eventId: ev.id,
            eventShowId: show.id,
            sortOrder: 0,
          },
        });
      }
    }
  }

  const tours = await prisma.tour.findMany({
    where: { organizationId },
    select: {
      id: true,
      name: true,
      shows: {
        select: { id: true, date: true, showTime: true },
        orderBy: { date: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  for (const tour of tours) {
    const tourTitle = tour.name.trim() || "Untitled tour";
    const tourProjectName = `Tour · ${tourTitle}`;
    const existingTourProj = await prisma.timeProject.findFirst({
      where: { organizationId, tourId: tour.id, tourShowId: null },
    });
    if (existingTourProj) {
      if (existingTourProj.name !== tourProjectName) {
        await prisma.timeProject.update({
          where: { id: existingTourProj.id },
          data: { name: tourProjectName },
        });
      }
    } else {
      await prisma.timeProject.create({
        data: {
          organizationId,
          name: tourProjectName,
          tourId: tour.id,
          tourShowId: null,
          sortOrder: 0,
        },
      });
    }

    for (const show of tour.shows) {
      const datePart = formatDayUtc(show.date);
      const baseTitle = `${tourTitle} · ${datePart}`;
      const targetName = show.showTime?.trim()
        ? `${baseTitle} ${show.showTime.trim()}`
        : baseTitle;
      const existingShowProj = await prisma.timeProject.findFirst({
        where: { organizationId, tourShowId: show.id },
      });
      if (existingShowProj) {
        if (existingShowProj.name !== targetName || existingShowProj.tourId !== tour.id) {
          await prisma.timeProject.update({
            where: { id: existingShowProj.id },
            data: { name: targetName, tourId: tour.id },
          });
        }
      } else {
        await prisma.timeProject.create({
          data: {
            organizationId,
            name: targetName,
            tourId: tour.id,
            tourShowId: show.id,
            sortOrder: 0,
          },
        });
      }
    }
  }
}

function toDateTimeFromDateAndTime(dateIso: string, hhmm: string): Date | null {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return null;
  const [hhRaw, mmRaw] = hhmm.split(":");
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh, mm, 0, 0));
}

const TOUR_TIME_JOB_PREFIX = "tourshow:";
const TOUR_EVENT_JOB_PREFIX = "tourevent:";
const DEFAULT_TOUR_JOB_DURATION_MIN = 180;

function tourPlanJobId(tourShowId: string) {
  return `${TOUR_TIME_JOB_PREFIX}${tourShowId}`;
}

function tourEventPlanJobId(scheduleEventId: string) {
  return `${TOUR_EVENT_JOB_PREFIX}${scheduleEventId}`;
}

/** Parse strict HH:mm; return minutes from midnight, or NaN. */
function minutesFromMidnightHHMM(raw: string): number {
  const t = raw.trim();
  const m = /^(\d{2}):(\d{2})$/.exec(t);
  if (!m) return NaN;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return NaN;
  return hh * 60 + mm;
}

function durationMinutesFromHHMM(startHHMM: string, endHHMM: string): number {
  const a = minutesFromMidnightHHMM(startHHMM);
  let b = minutesFromMidnightHHMM(endHHMM);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 60;
  if (b <= a) b += 24 * 60;
  return Math.max(15, b - a);
}

const SCHED_KIND_LABEL: Record<string, string> = {
  get_in: "Get-in",
  get_out: "Get-out",
  show: "Show",
  rehearsal: "Rehearsal",
  soundcheck: "Soundcheck",
  travel: "Travel",
  custom: "Custom",
};

function scheduleEventPlanTitle(ev: { kind: string; customLabel: string | null }): string {
  if (ev.kind === "custom" && ev.customLabel?.trim()) return ev.customLabel.trim();
  return SCHED_KIND_LABEL[ev.kind] ?? ev.kind;
}

function utcDayKeyFromDate(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const EVT_STAFF_PREFIX = "evtstaff:";
function eventStaffPlanJobId(staffingId: string) {
  return `${EVT_STAFF_PREFIX}${staffingId}`;
}

const IBOOKP_PREFIX = "ibookp:";
function internalBookingPlanJobId(linkId: string, dayKey: string) {
  return `${IBOOKP_PREFIX}${linkId}:${dayKey}`;
}

function tourDayTitle(show: {
  type: string;
  tour: { name: string };
  venueName: string | null;
  venueCity: string | null;
  fromLocation: string | null;
  toLocation: string | null;
}): string {
  const tourTitle = show.tour.name.trim() || "Tour";
  if (show.type === "travel") {
    const leg = [show.fromLocation?.trim(), show.toLocation?.trim()].filter(Boolean).join(" → ");
    return leg ? `${tourTitle} · ${leg}` : `${tourTitle} · Travel`;
  }
  if (show.type === "day_off") return `${tourTitle} · Day off`;
  const venue = show.venueName?.trim() || show.venueCity?.trim() || "Venue TBC";
  return `${tourTitle} · ${venue}`;
}

function tourDayStartHHMM(show: { type: string; showTime: string | null }): string {
  if (show.showTime?.trim() && /^\d{2}:\d{2}$/.test(show.showTime.trim())) return show.showTime.trim();
  if (show.type === "day_off") return "12:00";
  return "19:00";
}

function tourDayDurationMin(show: { type: string }): number {
  if (show.type === "day_off") return 60;
  return DEFAULT_TOUR_JOB_DURATION_MIN;
}

/** Stable calendar anchor for API `jobDate` / `showDate` (matches tour `dayKey` semantics). */
function tourJobDateIsoAnchor(show: { dayKey: string; date: Date }): string {
  if (show.dayKey && /^\d{4}-\d{2}-\d{2}$/.test(show.dayKey.trim())) {
    return `${show.dayKey.trim()}T12:00:00.000Z`;
  }
  return show.date.toISOString();
}

type PlanJobRow = {
  id: string;
  source: "event" | "event_staffing" | "tour" | "internal_booking";
  title: string;
  jobDate: string;
  startTime: string;
  durationMinutes: number;
  plannedStartsAt: string;
  plannedEndsAt: string;
  eventId: string;
  eventTitle: string;
  showId: string;
  showDate: string;
  venueName: string;
  timeProjectId: string | null;
  tourShowId: string | null;
  tourScheduleEventId: string | null;
  eventShowStaffingId: string | null;
  internalBookingPersonId: string | null;
  internalBookingDayKey: string | null;
};

function buildTourPlanJobRow(
  show: {
    id: string;
    dayKey: string;
    type: string;
    date: Date;
    showTime: string | null;
    venueName: string | null;
    venueCity: string | null;
    fromLocation: string | null;
    toLocation: string | null;
    tour: { id: string; name: string };
  },
  projectIdByShow: Map<string, string>
): PlanJobRow {
  const title = tourDayTitle(show);
  const startHHMM = tourDayStartHHMM(show);
  const durationMinutes = tourDayDurationMin(show);
  const jobDateIso = tourJobDateIsoAnchor(show);
  const plannedStart = toDateTimeFromDateAndTime(jobDateIso, startHHMM);
  const plannedEnd =
    plannedStart != null ? new Date(plannedStart.getTime() + durationMinutes * 60_000) : null;
  const tourTitle = show.tour.name.trim() || "Tour";
  const venueLabel =
    show.type === "travel"
      ? [show.fromLocation, show.toLocation].filter(Boolean).join(" → ") || "Travel"
      : show.type === "day_off"
        ? "—"
        : show.venueName?.trim() || show.venueCity?.trim() || "Venue TBC";
  return {
    id: tourPlanJobId(show.id),
    source: "tour" as const,
    title,
    jobDate: jobDateIso,
    startTime: startHHMM,
    durationMinutes,
    plannedStartsAt: plannedStart ? iso(plannedStart) : jobDateIso,
    plannedEndsAt: plannedEnd ? iso(plannedEnd) : jobDateIso,
    eventId: show.tour.id,
    eventTitle: tourTitle,
    showId: show.id,
    showDate: jobDateIso,
    venueName: venueLabel,
    timeProjectId: projectIdByShow.get(show.id) ?? null,
    tourShowId: show.id,
    tourScheduleEventId: null as string | null,
    eventShowStaffingId: null as string | null,
    internalBookingPersonId: null as string | null,
    internalBookingDayKey: null as string | null,
  };
}

function buildTourScheduleEventPlanRow(
  show: {
    id: string;
    dayKey: string;
    type: string;
    date: Date;
    showTime: string | null;
    venueName: string | null;
    venueCity: string | null;
    fromLocation: string | null;
    toLocation: string | null;
    tour: { id: string; name: string };
  },
  ev: { id: string; kind: string; customLabel: string | null; startTime: string; endTime: string },
  projectIdByShow: Map<string, string>
): PlanJobRow {
  const startHHMM = ev.startTime.trim();
  const endHHMM = ev.endTime.trim();
  const durationMinutes = durationMinutesFromHHMM(startHHMM, endHHMM);
  const jobDateIso = tourJobDateIsoAnchor(show);
  const plannedStart = toDateTimeFromDateAndTime(jobDateIso, startHHMM);
  const plannedEnd =
    plannedStart != null ? new Date(plannedStart.getTime() + durationMinutes * 60_000) : null;
  const dayLine = tourDayTitle(show);
  const title = `${dayLine} · ${scheduleEventPlanTitle(ev)}`;
  const tourTitle = show.tour.name.trim() || "Tour";
  const venueLabel =
    show.type === "travel"
      ? [show.fromLocation, show.toLocation].filter(Boolean).join(" → ") || "Travel"
      : show.type === "day_off"
        ? "—"
        : show.venueName?.trim() || show.venueCity?.trim() || "Venue TBC";
  return {
    id: tourEventPlanJobId(ev.id),
    source: "tour" as const,
    title,
    jobDate: jobDateIso,
    startTime: startHHMM,
    durationMinutes,
    plannedStartsAt: plannedStart ? iso(plannedStart) : jobDateIso,
    plannedEndsAt: plannedEnd ? iso(plannedEnd) : jobDateIso,
    eventId: show.tour.id,
    eventTitle: tourTitle,
    showId: show.id,
    showDate: jobDateIso,
    venueName: venueLabel,
    timeProjectId: projectIdByShow.get(show.id) ?? null,
    tourShowId: show.id,
    tourScheduleEventId: ev.id,
    eventShowStaffingId: null as string | null,
    internalBookingPersonId: null as string | null,
    internalBookingDayKey: null as string | null,
  };
}

function expandTourShowsToPlanJobRows(
  shows: {
    id: string;
    dayKey: string;
    type: string;
    date: Date;
    showTime: string | null;
    venueName: string | null;
    venueCity: string | null;
    fromLocation: string | null;
    toLocation: string | null;
    tour: { id: string; name: string };
    scheduleEvents: {
      id: string;
      kind: string;
      customLabel: string | null;
      startTime: string;
      endTime: string;
      sortOrder: number;
    }[];
  }[],
  projectIdByShow: Map<string, string>
): PlanJobRow[] {
  const rows: PlanJobRow[] = [];
  for (const show of shows) {
    const evs = (show.scheduleEvents ?? []).filter(
      (e) =>
        /^\d{2}:\d{2}$/.test((e.startTime ?? "").trim()) &&
        /^\d{2}:\d{2}$/.test((e.endTime ?? "").trim())
    );
    evs.sort((a, b) => a.sortOrder - b.sortOrder || a.startTime.localeCompare(b.startTime));
    if (evs.length > 0) {
      for (const ev of evs) {
        rows.push(buildTourScheduleEventPlanRow(show, ev, projectIdByShow));
      }
    } else {
      rows.push(buildTourPlanJobRow(show, projectIdByShow));
    }
  }
  return rows;
}

async function fetchEventStaffingPlanJobs(args: {
  organizationId: string;
  personId: string;
  rangeStart: Date;
  rangeEndExclusive: Date;
  eventShowJobs: { showId: string; jobDate: Date }[];
}): Promise<PlanJobRow[]> {
  await syncEventShowTimeProjects(args.organizationId);

  const jobDayByShow = new Set<string>();
  for (const j of args.eventShowJobs) {
    jobDayByShow.add(`${j.showId}:${utcDayKeyFromDate(j.jobDate)}`);
  }

  const staff = await prisma.eventShowStaffing.findMany({
    where: {
      personId: args.personId,
      show: {
        event: { organizationId: args.organizationId },
        status: { not: "cancelled" },
        showDate: { gte: args.rangeStart, lt: args.rangeEndExclusive },
      },
    },
    include: {
      show: {
        select: {
          id: true,
          showDate: true,
          showTime: true,
          durationMinutes: true,
          venue: { select: { name: true } },
          event: { select: { id: true, title: true } },
        },
      },
    },
  });

  const rows: PlanJobRow[] = [];
  for (const s of staff) {
    const dayKey = utcDayKeyFromDate(s.show.showDate);
    if (jobDayByShow.has(`${s.show.id}:${dayKey}`)) continue;

    let proj = await prisma.timeProject.findFirst({
      where: { organizationId: args.organizationId, eventShowId: s.show.id },
      select: { id: true },
    });
    if (!proj) {
      await syncEventShowTimeProjects(args.organizationId);
      proj = await prisma.timeProject.findFirst({
        where: { organizationId: args.organizationId, eventShowId: s.show.id },
        select: { id: true },
      });
    }

    const startHHMM =
      s.meetingTime?.trim() && /^\d{2}:\d{2}$/.test(s.meetingTime.trim())
        ? s.meetingTime.trim()
        : s.show.showTime?.trim() && /^\d{2}:\d{2}$/.test(s.show.showTime.trim())
          ? s.show.showTime.trim()
          : "18:00";
    const dur =
      s.meetingDurationMinutes && s.meetingDurationMinutes > 0
        ? s.meetingDurationMinutes
        : s.show.durationMinutes > 0
          ? s.show.durationMinutes
          : 180;
    const jobDateIso = s.show.showDate.toISOString();
    const plannedStart = toDateTimeFromDateAndTime(jobDateIso, startHHMM);
    const plannedEnd =
      plannedStart != null ? new Date(plannedStart.getTime() + dur * 60_000) : null;
    const roleLabel = s.role?.trim() || "Staff";
    rows.push({
      id: eventStaffPlanJobId(s.id),
      source: "event_staffing",
      title: `${roleLabel} · ${s.show.event.title}`,
      jobDate: jobDateIso,
      startTime: startHHMM,
      durationMinutes: dur,
      plannedStartsAt: plannedStart ? iso(plannedStart) : jobDateIso,
      plannedEndsAt: plannedEnd ? iso(plannedEnd) : jobDateIso,
      eventId: s.show.event.id,
      eventTitle: s.show.event.title,
      showId: s.show.id,
      showDate: jobDateIso,
      venueName: s.show.venue.name,
      timeProjectId: proj?.id ?? null,
      tourShowId: null,
      tourScheduleEventId: null,
      eventShowStaffingId: s.id,
      internalBookingPersonId: null,
      internalBookingDayKey: null,
    });
  }
  return rows;
}

async function fetchInternalBookingPlanJobsForRange(args: {
  organizationId: string;
  personId: string;
  rangeStart: Date;
  rangeEndExclusive: Date;
}): Promise<PlanJobRow[]> {
  const links = await prisma.internalBookingPerson.findMany({
    where: {
      personId: args.personId,
      booking: { organizationId: args.organizationId },
    },
    include: {
      booking: {
        select: {
          id: true,
          title: true,
          startDate: true,
          endDate: true,
          venue: { select: { name: true } },
        },
      },
    },
  });

  const rows: PlanJobRow[] = [];
  const DEFAULT_IBOOK_MIN = 480;

  for (let t = utcDayStart(args.rangeStart); t.getTime() < args.rangeEndExclusive.getTime(); t = new Date(t.getTime() + 86_400_000)) {
    const dayKey = utcDayKeyFromDate(t);
    for (const link of links) {
      const b = link.booking;
      const first = utcDayStart(b.startDate);
      const last = b.endDate ? utcDayStart(b.endDate) : first;
      if (t.getTime() < first.getTime() || t.getTime() > last.getTime()) continue;

      const onStartDay = dayKey === utcDayKeyFromDate(b.startDate);
      const startHHMM = onStartDay
        ? `${String(b.startDate.getUTCHours()).padStart(2, "0")}:${String(b.startDate.getUTCMinutes()).padStart(2, "0")}`
        : "09:00";
      const jobDateIso = t.toISOString();
      const plannedStart = toDateTimeFromDateAndTime(jobDateIso, startHHMM);
      const plannedEnd =
        plannedStart != null
          ? new Date(plannedStart.getTime() + DEFAULT_IBOOK_MIN * 60_000)
          : null;
      const title = (b.title || "").trim() || "Internal booking";
      rows.push({
        id: internalBookingPlanJobId(link.id, dayKey),
        source: "internal_booking",
        title: link.role?.trim() ? `${title} · ${link.role.trim()}` : title,
        jobDate: jobDateIso,
        startTime: startHHMM,
        durationMinutes: DEFAULT_IBOOK_MIN,
        plannedStartsAt: plannedStart ? iso(plannedStart) : jobDateIso,
        plannedEndsAt: plannedEnd ? iso(plannedEnd) : jobDateIso,
        eventId: b.id,
        eventTitle: title,
        showId: b.id,
        showDate: jobDateIso,
        venueName: b.venue?.name ?? "—",
        timeProjectId: null,
        tourShowId: null,
        tourScheduleEventId: null,
        eventShowStaffingId: null,
        internalBookingPersonId: link.id,
        internalBookingDayKey: dayKey,
      });
    }
  }
  return rows;
}

async function fetchTourPlanJobsForPerson(args: {
  organizationId: string;
  personId: string;
  rangeStart: Date;
  rangeEndExclusive: Date;
}) {
  await syncEventShowTimeProjects(args.organizationId);

  const shows = await prisma.tourShow.findMany({
    where: {
      tour: { organizationId: args.organizationId },
      date: { gte: args.rangeStart, lt: args.rangeEndExclusive },
      OR: [
        { showPeople: { some: { personId: args.personId } } },
        {
          AND: [
            { showPeople: { none: {} } },
            { tour: { people: { some: { personId: args.personId } } } },
          ],
        },
      ],
    },
    include: {
      tour: { select: { id: true, name: true } },
      scheduleEvents: {
        select: {
          id: true,
          kind: true,
          customLabel: true,
          startTime: true,
          endTime: true,
          sortOrder: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ date: "asc" }, { order: "asc" }],
  });

  const showIds = shows.map((s) => s.id);
  const projects =
    showIds.length === 0
      ? []
      : await prisma.timeProject.findMany({
          where: { organizationId: args.organizationId, tourShowId: { in: showIds } },
          select: { id: true, tourShowId: true },
        });
  const projectIdByShow = new Map(projects.map((p) => [p.tourShowId!, p.id]));

  const missing = shows.filter((s) => !projectIdByShow.has(s.id));
  if (missing.length) {
    await syncEventShowTimeProjects(args.organizationId);
    const again = await prisma.timeProject.findMany({
      where: { organizationId: args.organizationId, tourShowId: { in: missing.map((m) => m.id) } },
      select: { id: true, tourShowId: true },
    });
    for (const p of again) projectIdByShow.set(p.tourShowId!, p.id);
  }

  return expandTourShowsToPlanJobRows(shows, projectIdByShow);
}

async function fetchTourPlanJobsFromDate(args: {
  organizationId: string;
  personId: string;
  fromDate: Date;
  take: number;
}) {
  await syncEventShowTimeProjects(args.organizationId);

  const shows = await prisma.tourShow.findMany({
    where: {
      tour: { organizationId: args.organizationId },
      date: { gte: args.fromDate },
      OR: [
        { showPeople: { some: { personId: args.personId } } },
        {
          AND: [
            { showPeople: { none: {} } },
            { tour: { people: { some: { personId: args.personId } } } },
          ],
        },
      ],
    },
    include: {
      tour: { select: { id: true, name: true } },
      scheduleEvents: {
        select: {
          id: true,
          kind: true,
          customLabel: true,
          startTime: true,
          endTime: true,
          sortOrder: true,
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ date: "asc" }, { order: "asc" }],
    take: args.take,
  });

  const showIds = shows.map((s) => s.id);
  const projects =
    showIds.length === 0
      ? []
      : await prisma.timeProject.findMany({
          where: { organizationId: args.organizationId, tourShowId: { in: showIds } },
          select: { id: true, tourShowId: true },
        });
  const projectIdByShow = new Map(projects.map((p) => [p.tourShowId!, p.id]));

  const missing = shows.filter((s) => !projectIdByShow.has(s.id));
  if (missing.length) {
    await syncEventShowTimeProjects(args.organizationId);
    const again = await prisma.timeProject.findMany({
      where: { organizationId: args.organizationId, tourShowId: { in: missing.map((m) => m.id) } },
      select: { id: true, tourShowId: true },
    });
    for (const p of again) projectIdByShow.set(p.tourShowId!, p.id);
  }

  return expandTourShowsToPlanJobRows(shows, projectIdByShow);
}

async function resolvePersonIdForUser(organizationId: string, email: string | null | undefined) {
  if (!email?.trim()) return null;
  let person = await prisma.person.findFirst({
    where: { organizationId, email },
    select: { id: true },
  });
  if (!person && isPostgresDatabaseUrl(process.env.DATABASE_URL)) {
    person = await prisma.person.findFirst({
      where: { organizationId, email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
  }
  return person?.id ?? null;
}

function parseRange(c: { req: { query: (k: string) => string | undefined } }) {
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (!from || !to) return { error: "from and to (YYYY-MM-DD) are required" as const };
  const rangeStart = new Date(`${from}T00:00:00.000Z`);
  const toPlus = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(toPlus.getTime())) {
    return { error: "invalid date" as const };
  }
  const rangeEndExclusive = new Date(toPlus.getTime() + 86_400_000);
  return { rangeStart, rangeEndExclusive };
}

type TimeSpan = { startsAt: Date; endsAt: Date };

function subtractSpan(base: TimeSpan, blockers: TimeSpan[]): TimeSpan[] {
  let out: TimeSpan[] = [base];
  for (const b of blockers) {
    const next: TimeSpan[] = [];
    for (const s of out) {
      if (b.endsAt <= s.startsAt || b.startsAt >= s.endsAt) {
        next.push(s);
        continue;
      }
      if (b.startsAt > s.startsAt) {
        next.push({ startsAt: s.startsAt, endsAt: b.startsAt });
      }
      if (b.endsAt < s.endsAt) {
        next.push({ startsAt: b.endsAt, endsAt: s.endsAt });
      }
    }
    out = next.filter((s) => s.endsAt.getTime() > s.startsAt.getTime());
    if (out.length === 0) break;
  }
  return out;
}

async function computeNonOverlappingSpans(args: {
  organizationId: string;
  personId: string;
  startsAt: Date;
  endsAt: Date;
  excludeEntryId?: string;
}): Promise<TimeSpan[]> {
  const overlaps = await prisma.timeEntry.findMany({
    where: {
      organizationId: args.organizationId,
      personId: args.personId,
      startsAt: { lt: args.endsAt },
      endsAt: { gt: args.startsAt },
      ...(args.excludeEntryId ? { id: { not: args.excludeEntryId } } : {}),
    },
    select: { startsAt: true, endsAt: true },
    orderBy: { startsAt: "asc" },
  });
  return subtractSpan(
    { startsAt: args.startsAt, endsAt: args.endsAt },
    overlaps.map((o) => ({ startsAt: o.startsAt, endsAt: o.endsAt }))
  );
}

async function resolveTargetPersonId(
  c: Context,
  organizationId: string,
  queryPersonId: string | undefined
): Promise<
  { personId: string } | { error: string; status: 400 | 403 | 404 }
> {
  const user = c.get("user");
  const email = user?.email;
  const myId = await resolvePersonIdForUser(organizationId, email);
  if (!myId) {
    return { error: "No person profile linked to your account in this organization.", status: 400 };
  }
  if (queryPersonId && queryPersonId !== myId) {
    if (!canAction(c, "time.read_all")) {
      return { error: "Cannot view other people’s time.", status: 403 };
    }
    const exists = await prisma.person.findFirst({
      where: { id: queryPersonId, organizationId },
      select: { id: true },
    });
    if (!exists) return { error: "Person not found.", status: 404 };
    return { personId: queryPersonId };
  }
  return { personId: myId };
}

function serializeTag(row: {
  id: string;
  organizationId: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...row,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function serializeProject(row: {
  id: string;
  organizationId: string;
  name: string;
  color: string | null;
  eventId: string | null;
  eventShowId: string | null;
  tourId: string | null;
  tourShowId: string | null;
  isArchived: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...row,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function serializeEntry(row: {
  id: string;
  organizationId: string;
  userId: string;
  personId: string;
  startsAt: Date;
  endsAt: Date;
  kind: string;
  category: string;
  eventShowJobId: string | null;
  eventId: string | null;
  tourShowId: string | null;
  eventShowStaffingId: string | null;
  internalBookingPersonId: string | null;
  internalBookingDayKey: string | null;
  timeProjectId: string | null;
  note: string | null;
  isLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
  tagLinks: { timeTagId: string }[];
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    personId: row.personId,
    startsAt: iso(row.startsAt),
    endsAt: iso(row.endsAt),
    kind: row.kind,
    category: (row.category || "work") as TimeCategory,
    eventShowJobId: row.eventShowJobId,
    eventId: row.eventId,
    tourShowId: row.tourShowId,
    eventShowStaffingId: row.eventShowStaffingId,
    internalBookingPersonId: row.internalBookingPersonId,
    internalBookingDayKey: row.internalBookingDayKey,
    timeProjectId: row.timeProjectId,
    note: row.note,
    isLocked: row.isLocked,
    tagIds: row.tagLinks.map((t) => t.timeTagId),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function normalizeTravelDayLines(value: unknown): TravelClaimDayLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((line): line is Record<string, unknown> => Boolean(line) && typeof line === "object")
    .map((line) => ({
      date: typeof line.date === "string" ? line.date : "",
      city: typeof line.city === "string" ? line.city : "",
      hotel: typeof line.hotel === "string" ? line.hotel : "",
      breakfastProvided: line.breakfastProvided === true,
      lunchProvided: line.lunchProvided === true,
      dinnerProvided: line.dinnerProvided === true,
      lodgingCovered: line.lodgingCovered === true,
      lodgingByReceipt: line.lodgingByReceipt === true,
    }))
    .filter((line) => line.date.length > 0);
}

function serializeTravelClaim(row: {
  id: string;
  organizationId: string;
  personId: string;
  createdByUserId: string | null;
  startsAt: Date;
  endsAt: Date;
  destination: string;
  purpose: string;
  country: string;
  allowanceType: string;
  rateYear: number;
  foodRateCents: number;
  lodgingRateCents: number;
  breakfastProvided: boolean;
  lunchProvided: boolean;
  dinnerProvided: boolean;
  lodgingAllowance: boolean;
  lodgingCovered: boolean;
  foodCoveredByReceipts: boolean;
  isTemporaryWorkplace: boolean;
  hasUsualResidence: boolean;
  overnightAwayFromHome: boolean;
  cannotReturnHome: boolean;
  twelveMonthRuleOk: boolean;
  salaryReductionAgreement: boolean;
  receivesBIncome: boolean;
  excludedWorkerType: boolean;
  transportsPeopleOrGoods: boolean;
  lodgingByReceipt: boolean;
  dayLines: unknown;
  eventId: string | null;
  eventShowJobId: string | null;
  timeProjectId: string | null;
  notes: string | null;
  foodAmountCents: number;
  lodgingAmountCents: number;
  totalAmountCents: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    personId: row.personId,
    createdByUserId: row.createdByUserId,
    startsAt: iso(row.startsAt),
    endsAt: iso(row.endsAt),
    destination: row.destination,
    purpose: row.purpose,
    country: row.country,
    allowanceType: row.allowanceType as TravelAllowanceType,
    rateYear: row.rateYear,
    foodRateCents: row.foodRateCents,
    lodgingRateCents: row.lodgingRateCents,
    breakfastProvided: row.breakfastProvided,
    lunchProvided: row.lunchProvided,
    dinnerProvided: row.dinnerProvided,
    lodgingAllowance: row.lodgingAllowance,
    lodgingCovered: row.lodgingCovered,
    foodCoveredByReceipts: row.foodCoveredByReceipts,
    isTemporaryWorkplace: row.isTemporaryWorkplace,
    hasUsualResidence: row.hasUsualResidence,
    overnightAwayFromHome: row.overnightAwayFromHome,
    cannotReturnHome: row.cannotReturnHome,
    twelveMonthRuleOk: row.twelveMonthRuleOk,
    salaryReductionAgreement: row.salaryReductionAgreement,
    receivesBIncome: row.receivesBIncome,
    excludedWorkerType: row.excludedWorkerType,
    transportsPeopleOrGoods: row.transportsPeopleOrGoods,
    lodgingByReceipt: row.lodgingByReceipt,
    dayLines: normalizeTravelDayLines(row.dayLines),
    eventId: row.eventId,
    eventShowJobId: row.eventShowJobId,
    timeProjectId: row.timeProjectId,
    notes: row.notes,
    foodAmountCents: row.foodAmountCents,
    lodgingAmountCents: row.lodgingAmountCents,
    totalAmountCents: row.totalAmountCents,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function serializeTimesheetApproval(row: {
  id: string;
  organizationId: string;
  personId: string;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  reopenedAt: Date | null;
  reopenedByUserId: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    personId: row.personId,
    periodStart: iso(row.periodStart),
    periodEnd: iso(row.periodEnd),
    status: row.status as "approved" | "reopened",
    approvedAt: row.approvedAt ? iso(row.approvedAt) : null,
    approvedByUserId: row.approvedByUserId,
    reopenedAt: row.reopenedAt ? iso(row.reopenedAt) : null,
    reopenedByUserId: row.reopenedByUserId,
    note: row.note,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

async function findApprovedTimesheet(args: {
  organizationId: string;
  personId: string;
  startsAt: Date;
  endsAt: Date;
}) {
  return prisma.timesheetApproval.findFirst({
    where: {
      organizationId: args.organizationId,
      personId: args.personId,
      status: "approved",
      periodStart: { lt: args.endsAt },
      periodEnd: { gt: args.startsAt },
    },
    orderBy: { periodStart: "desc" },
  });
}

// GET /api/time/people — directory for admin filter / reports
timeRouter.get("/time/people", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time") || !canAction(c, "time.read_all")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const people = await prisma.person.findMany({
    where: { organizationId: user.organizationId, isActive: true },
    select: { id: true, name: true, email: true, weeklyContractHours: true, vacationDaysPerYear: true },
    orderBy: { name: "asc" },
  });
  return c.json({ data: people });
});

// PATCH /api/time/person-contract/:personId — set weekly contract hours
timeRouter.patch(
  "/time/person-contract/:personId",
  zValidator("json", SetPersonContractSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId) {
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    }
    if (!canAction(c, "time.read_all")) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }
    const personId = c.req.param("personId");
    const body = c.req.valid("json");
    const person = await prisma.person.findFirst({
      where: { id: personId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!person) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    await prisma.person.update({
      where: { id: personId },
      data: {
        ...(body.weeklyContractHours !== undefined ? { weeklyContractHours: body.weeklyContractHours } : {}),
        ...(body.vacationDaysPerYear !== undefined ? { vacationDaysPerYear: body.vacationDaysPerYear } : {}),
      },
    });
    return c.json({ ok: true });
  }
);

// GET /api/time/report — comprehensive time report with aggregations
timeRouter.get("/time/report", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time") || !canAction(c, "time.read_all")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const r = parseRange(c);
  if ("error" in r) return c.json({ error: { message: r.error, code: "BAD_REQUEST" } }, 400);
  const { rangeStart, rangeEndExclusive } = r;

  const rangeDays = Math.round((rangeEndExclusive.getTime() - rangeStart.getTime()) / 86_400_000);

  const qPersonIds = c.req.query("personIds");
  const qProjectIds = c.req.query("projectIds");
  const qTagIds = c.req.query("tagIds");
  const qCategories = c.req.query("categories");

  const personIdFilter = qPersonIds ? qPersonIds.split(",").filter(Boolean) : [];
  const projectIdFilter = qProjectIds ? qProjectIds.split(",").filter(Boolean) : [];
  const tagIdFilter = qTagIds ? qTagIds.split(",").filter(Boolean) : [];
  const categoryFilter = qCategories
    ? qCategories.split(",").filter((x) => TIME_CATEGORIES.includes(x as never))
    : [];

  const where: Record<string, unknown> = {
    organizationId: user.organizationId,
    startsAt: { gte: rangeStart },
    endsAt: { lt: rangeEndExclusive },
  };
  if (personIdFilter.length) where.personId = { in: personIdFilter };
  if (categoryFilter.length) where.category = { in: categoryFilter };
  if (projectIdFilter.length) {
    const pf: unknown[] = projectIdFilter.map((id) => ({ timeProjectId: id }));
    if (projectIdFilter.includes("__none__")) pf.push({ timeProjectId: null });
    where.OR = pf;
  }
  if (tagIdFilter.length) {
    where.tagLinks = { some: { timeTagId: { in: tagIdFilter } } };
  }

  const rows = await prisma.timeEntry.findMany({
    where,
    include: {
      person: { select: { id: true, name: true, weeklyContractHours: true, vacationDaysPerYear: true } },
      timeProject: { select: { id: true, name: true } },
      tagLinks: { include: { timeTag: { select: { id: true, name: true } } } },
    },
    orderBy: { startsAt: "asc" },
    take: 5000,
  });

  type PersonAgg = {
    personName: string;
    workMinutes: number;
    vacationMinutes: number;
    sickMinutes: number;
    holidayMinutes: number;
    travelAllowanceMinutes: number;
    weeklyContractHours: number | null;
    vacationDaysPerYear: number | null;
  };
  type ProjectAgg = { projectName: string; workMinutes: number; totalMinutes: number };
  type DayAgg = {
    workMinutes: number;
    vacationMinutes: number;
    sickMinutes: number;
    holidayMinutes: number;
    travelAllowanceMinutes: number;
  };

  const byPerson = new Map<string, PersonAgg>();
  const byProject = new Map<string | null, ProjectAgg>();
  const byDay = new Map<string, DayAgg>();

  for (const row of rows) {
    const durMin = Math.max(0, (row.endsAt.getTime() - row.startsAt.getTime()) / 60_000);
    const cat = (row.category || "work") as string;
    const dateKey = row.startsAt.toISOString().substring(0, 10);

    // byPerson
    if (!byPerson.has(row.personId)) {
      byPerson.set(row.personId, {
        personName: row.person.name,
        workMinutes: 0,
        vacationMinutes: 0,
        sickMinutes: 0,
        holidayMinutes: 0,
        travelAllowanceMinutes: 0,
        weeklyContractHours: row.person.weeklyContractHours ?? null,
        vacationDaysPerYear: row.person.vacationDaysPerYear ?? null,
      });
    }
    const pa = byPerson.get(row.personId)!;
    if (cat === "work") pa.workMinutes += durMin;
    else if (cat === "vacation") pa.vacationMinutes += durMin;
    else if (cat === "sick") pa.sickMinutes += durMin;
    else if (cat === "holiday") pa.holidayMinutes += durMin;
    else if (cat === "travel_allowance") pa.travelAllowanceMinutes += durMin;

    // byProject
    const projKey = row.timeProjectId ?? null;
    if (!byProject.has(projKey)) {
      byProject.set(projKey, {
        projectName: row.timeProject?.name ?? "No project",
        workMinutes: 0,
        totalMinutes: 0,
      });
    }
    const pp = byProject.get(projKey)!;
    pp.totalMinutes += durMin;
    if (cat === "work") pp.workMinutes += durMin;

    // byDay
    if (!byDay.has(dateKey)) {
      byDay.set(dateKey, {
        workMinutes: 0,
        vacationMinutes: 0,
        sickMinutes: 0,
        holidayMinutes: 0,
        travelAllowanceMinutes: 0,
      });
    }
    const dp = byDay.get(dateKey)!;
    if (cat === "work") dp.workMinutes += durMin;
    else if (cat === "vacation") dp.vacationMinutes += durMin;
    else if (cat === "sick") dp.sickMinutes += durMin;
    else if (cat === "holiday") dp.holidayMinutes += durMin;
    else if (cat === "travel_allowance") dp.travelAllowanceMinutes += durMin;
  }

  const byPersonArr = [...byPerson.entries()].map(([personId, pa]) => {
    const total =
      pa.workMinutes +
      pa.vacationMinutes +
      pa.sickMinutes +
      pa.holidayMinutes +
      pa.travelAllowanceMinutes;
    const contractMinutes =
      pa.weeklyContractHours != null ? (rangeDays / 7) * pa.weeklyContractHours * 60 : null;
    // Vacation days: use hoursPerWorkDay = weeklyContractHours / 5; fall back to 8h
    const hoursPerDay = pa.weeklyContractHours != null ? pa.weeklyContractHours / 5 : 8;
    const vacationDaysUsed = Math.round((pa.vacationMinutes / 60 / hoursPerDay) * 10) / 10;
    const vacationDaysRemaining =
      pa.vacationDaysPerYear != null ? Math.round((pa.vacationDaysPerYear - vacationDaysUsed) * 10) / 10 : null;
    return {
      personId,
      personName: pa.personName,
      totalMinutes: total,
      workMinutes: pa.workMinutes,
      vacationMinutes: pa.vacationMinutes,
      sickMinutes: pa.sickMinutes,
      holidayMinutes: pa.holidayMinutes,
      travelAllowanceMinutes: pa.travelAllowanceMinutes,
      weeklyContractHours: pa.weeklyContractHours,
      contractMinutes,
      overtimeMinutes: contractMinutes != null ? pa.workMinutes - contractMinutes : null,
      vacationDaysPerYear: pa.vacationDaysPerYear,
      vacationDaysUsed: pa.vacationDaysPerYear != null || pa.vacationMinutes > 0 ? vacationDaysUsed : null,
      vacationDaysRemaining,
    };
  });

  const byProjectArr = [...byProject.entries()].map(([projectId, pp]) => ({
    projectId,
    projectName: pp.projectName,
    totalMinutes: pp.totalMinutes,
    workMinutes: pp.workMinutes,
  })).sort((a, b) => b.totalMinutes - a.totalMinutes);

  const byDayArr = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dp]) => ({
      date,
      totalMinutes:
        dp.workMinutes +
        dp.vacationMinutes +
        dp.sickMinutes +
        dp.holidayMinutes +
        dp.travelAllowanceMinutes,
      workMinutes: dp.workMinutes,
      vacationMinutes: dp.vacationMinutes,
      sickMinutes: dp.sickMinutes,
      holidayMinutes: dp.holidayMinutes,
      travelAllowanceMinutes: dp.travelAllowanceMinutes,
    }));

  const summaryWork = byPersonArr.reduce((s, p) => s + p.workMinutes, 0);
  const summaryVac = byPersonArr.reduce((s, p) => s + p.vacationMinutes, 0);
  const summarySick = byPersonArr.reduce((s, p) => s + p.sickMinutes, 0);
  const summaryHoliday = byPersonArr.reduce((s, p) => s + p.holidayMinutes, 0);
  const summaryTravelAllowance = byPersonArr.reduce((s, p) => s + p.travelAllowanceMinutes, 0);

  const entries = rows.map((row) => ({
    id: row.id,
    personId: row.personId,
    personName: row.person.name,
    startsAt: iso(row.startsAt),
    endsAt: iso(row.endsAt),
    durationMinutes: Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60_000),
    kind: row.kind,
    category: (row.category || "work") as TimeCategory,
    note: row.note,
    projectId: row.timeProjectId,
    projectName: row.timeProject?.name ?? null,
    tagIds: row.tagLinks.map((t) => t.timeTagId),
    tagNames: row.tagLinks.map((t) => t.timeTag.name),
  }));

  return c.json({
    data: {
      summary: {
        totalMinutes:
          summaryWork + summaryVac + summarySick + summaryHoliday + summaryTravelAllowance,
        workMinutes: summaryWork,
        vacationMinutes: summaryVac,
        sickMinutes: summarySick,
        holidayMinutes: summaryHoliday,
        travelAllowanceMinutes: summaryTravelAllowance,
        entryCount: rows.length,
        rangeDays,
      },
      byPerson: byPersonArr,
      byProject: byProjectArr,
      byDay: byDayArr,
      entries,
    },
  });
});

/** Lightweight events + shows for linking time projects (catalog admins). */
timeRouter.get("/time/catalog-event-options", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "time.manage_catalog")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const events = await prisma.event.findMany({
    where: { organizationId: user.organizationId },
    select: {
      id: true,
      title: true,
      shows: {
        select: { id: true, showDate: true, showTime: true, status: true },
        orderBy: { showDate: "asc" },
      },
    },
    orderBy: { title: "asc" },
  });
  return c.json({
    data: events.map((e) => ({
      id: e.id,
      title: e.title,
      shows: e.shows.map((s) => ({
        id: s.id,
        showDate: s.showDate.toISOString(),
        showTime: s.showTime,
        status: s.status,
      })),
    })),
  });
});

timeRouter.get("/time/tags", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const rows = await prisma.timeTag.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return c.json({ data: rows.map(serializeTag) });
});

timeRouter.post("/time/tags", zValidator("json", CreateTimeTagSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId || !user.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "time.manage_catalog")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const body = c.req.valid("json");
  const row = await prisma.timeTag.create({
    data: {
      organizationId: user.organizationId,
      name: body.name.trim(),
      sortOrder: body.sortOrder ?? 0,
      color: body.color ?? null,
    },
  });
  return c.json({ data: serializeTag(row) });
});

timeRouter.patch("/time/tags/:id", zValidator("json", PatchTimeTagSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "time.manage_catalog")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const existing = await prisma.timeTag.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  const row = await prisma.timeTag.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
    },
  });
  return c.json({ data: serializeTag(row) });
});

timeRouter.delete("/time/tags/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "time.manage_catalog")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const existing = await prisma.timeTag.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  await prisma.timeTag.delete({ where: { id } });
  return c.json({ ok: true });
});

timeRouter.get("/time/projects", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  await syncEventShowTimeProjects(user.organizationId);
  const archived = c.req.query("archived") === "1";
  const rows = await prisma.timeProject.findMany({
    where: {
      organizationId: user.organizationId,
      isArchived: archived ? true : false,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return c.json({ data: rows.map(serializeProject) });
});

timeRouter.post("/time/projects", zValidator("json", CreateTimeProjectSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId || !user.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "time.manage_catalog")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const body = c.req.valid("json");
  let eventId: string | null = body.eventId ?? null;
  let eventShowId: string | null = body.eventShowId ?? null;

  if (eventShowId) {
    const existingShowProj = await prisma.timeProject.findFirst({
      where: { organizationId: user.organizationId, eventShowId },
    });
    if (existingShowProj) {
      return c.json({ data: serializeProject(existingShowProj) });
    }
    const show = await prisma.eventShow.findFirst({
      where: {
        id: eventShowId,
        event: { organizationId: user.organizationId },
      },
      select: { id: true, eventId: true },
    });
    if (!show) {
      return c.json({ error: { message: "Show not found", code: "NOT_FOUND" } }, 404);
    }
    eventId = show.eventId;
    if (body.eventId != null && body.eventId !== show.eventId) {
      return c.json({ error: { message: "Show does not belong to that event", code: "BAD_REQUEST" } }, 400);
    }
  } else if (eventId) {
    const ev = await prisma.event.findFirst({
      where: { id: eventId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!ev) return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
    const existingEvProj = await prisma.timeProject.findFirst({
      where: { organizationId: user.organizationId, eventId, eventShowId: null },
    });
    if (existingEvProj) {
      return c.json({ data: serializeProject(existingEvProj) });
    }
  }
  if (body.tourShowId) {
    const show = await prisma.tourShow.findFirst({
      where: { id: body.tourShowId, tour: { organizationId: user.organizationId } },
      select: { id: true, tourId: true },
    });
    if (!show) {
      return c.json({ error: { message: "Tour show not found", code: "NOT_FOUND" } }, 404);
    }
    if (body.tourId != null && body.tourId !== show.tourId) {
      return c.json(
        { error: { message: "Tour show does not belong to that tour", code: "BAD_REQUEST" } },
        400
      );
    }
  } else if (body.tourId) {
    const tour = await prisma.tour.findFirst({
      where: { id: body.tourId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!tour) return c.json({ error: { message: "Tour not found", code: "NOT_FOUND" } }, 404);
  }

  const row = await prisma.timeProject.create({
    data: {
      organizationId: user.organizationId,
      name: body.name.trim(),
      eventId,
      eventShowId,
      tourId: body.tourId ?? null,
      tourShowId: body.tourShowId ?? null,
      sortOrder: body.sortOrder ?? 0,
      color: body.color ?? null,
    },
  });
  return c.json({ data: serializeProject(row) });
});

timeRouter.patch("/time/projects/:id", zValidator("json", PatchTimeProjectSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "time.manage_catalog")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const existing = await prisma.timeProject.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  if (body.eventShowId !== undefined && body.eventShowId !== null) {
    const show = await prisma.eventShow.findFirst({
      where: {
        id: body.eventShowId,
        event: { organizationId: user.organizationId },
      },
      select: { eventId: true },
    });
    if (!show) return c.json({ error: { message: "Show not found", code: "NOT_FOUND" } }, 404);
    if (body.eventId !== undefined && body.eventId !== null && body.eventId !== show.eventId) {
      return c.json({ error: { message: "Show does not belong to that event", code: "BAD_REQUEST" } }, 400);
    }
  } else if (body.eventId !== undefined && body.eventId !== null) {
    const ev = await prisma.event.findFirst({
      where: { id: body.eventId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!ev) return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  }
  if (body.tourShowId !== undefined && body.tourShowId !== null) {
    const show = await prisma.tourShow.findFirst({
      where: { id: body.tourShowId, tour: { organizationId: user.organizationId } },
      select: { tourId: true },
    });
    if (!show) return c.json({ error: { message: "Tour show not found", code: "NOT_FOUND" } }, 404);
    if (body.tourId !== undefined && body.tourId !== null && body.tourId !== show.tourId) {
      return c.json(
        { error: { message: "Tour show does not belong to that tour", code: "BAD_REQUEST" } },
        400
      );
    }
  } else if (body.tourId !== undefined && body.tourId !== null) {
    const tour = await prisma.tour.findFirst({
      where: { id: body.tourId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!tour) return c.json({ error: { message: "Tour not found", code: "NOT_FOUND" } }, 404);
  }
  const row = await prisma.timeProject.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.eventId !== undefined ? { eventId: body.eventId } : {}),
      ...(body.eventShowId !== undefined ? { eventShowId: body.eventShowId } : {}),
      ...(body.tourId !== undefined ? { tourId: body.tourId } : {}),
      ...(body.tourShowId !== undefined ? { tourShowId: body.tourShowId } : {}),
      ...(body.isArchived !== undefined ? { isArchived: body.isArchived } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
    },
  });
  return c.json({ data: serializeProject(row) });
});

timeRouter.delete("/time/projects/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "time.manage_catalog")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const existing = await prisma.timeProject.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  await prisma.timeProject.delete({ where: { id } });
  return c.json({ ok: true });
});

timeRouter.get("/time/jobs", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const r = parseRange(c);
  if ("error" in r) return c.json({ error: { message: r.error, code: "BAD_REQUEST" } }, 400);
  const { rangeStart, rangeEndExclusive } = r;
  const qPerson = c.req.query("personId");
  const target = await resolveTargetPersonId(c, user.organizationId, qPerson);
  if ("error" in target) {
    return c.json({ error: { message: target.error, code: "BAD_REQUEST" } }, target.status);
  }

  const jobs = await prisma.eventShowJob.findMany({
    where: {
      personId: target.personId,
      jobDate: { gte: rangeStart, lt: rangeEndExclusive },
      show: { event: { organizationId: user.organizationId } },
    },
    include: {
      venue: { select: { name: true } },
      show: { select: { id: true, showDate: true, event: { select: { id: true, title: true } } } },
    },
    orderBy: [{ jobDate: "asc" }, { sortOrder: "asc" }],
  });

  const eventRows = jobs.map((j) => {
    const plannedStart = toDateTimeFromDateAndTime(j.jobDate.toISOString(), j.startTime);
    const plannedEnd =
      plannedStart != null
        ? new Date(plannedStart.getTime() + j.durationMinutes * 60_000)
        : null;
    return {
      id: j.id,
      source: "event" as const,
      title: j.title,
      jobDate: iso(j.jobDate),
      startTime: j.startTime,
      durationMinutes: j.durationMinutes,
      plannedStartsAt: plannedStart ? iso(plannedStart) : iso(j.jobDate),
      plannedEndsAt: plannedEnd ? iso(plannedEnd) : iso(j.jobDate),
      eventId: j.show.event.id,
      eventTitle: j.show.event.title,
      showId: j.show.id,
      showDate: iso(j.show.showDate),
      venueName: j.venue.name,
      timeProjectId: null as string | null,
      tourShowId: null as string | null,
      tourScheduleEventId: null as string | null,
      eventShowStaffingId: null as string | null,
      internalBookingPersonId: null as string | null,
      internalBookingDayKey: null as string | null,
    };
  });

  const staffingRows = await fetchEventStaffingPlanJobs({
    organizationId: user.organizationId,
    personId: target.personId,
    rangeStart,
    rangeEndExclusive,
    eventShowJobs: jobs.map((j) => ({ showId: j.showId, jobDate: j.jobDate })),
  });

  const tourRows = await fetchTourPlanJobsForPerson({
    organizationId: user.organizationId,
    personId: target.personId,
    rangeStart,
    rangeEndExclusive,
  });

  const ibookRows = await fetchInternalBookingPlanJobsForRange({
    organizationId: user.organizationId,
    personId: target.personId,
    rangeStart,
    rangeEndExclusive,
  });

  const data = [...eventRows, ...staffingRows, ...tourRows, ...ibookRows].sort((a, b) => {
    const da = a.jobDate.localeCompare(b.jobDate);
    if (da !== 0) return da;
    return a.startTime.localeCompare(b.startTime);
  });
  return c.json({ data });
});

/** Assigned show jobs from today forward (for “upcoming” list beyond the visible week). */
timeRouter.get("/time/jobs/upcoming", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || "50")));
  const qPerson = c.req.query("personId");
  const target = await resolveTargetPersonId(c, user.organizationId, qPerson);
  if ("error" in target) {
    return c.json({ error: { message: target.error, code: "BAD_REQUEST" } }, target.status);
  }

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const fetchCap = Math.min(200, Math.max(limit * 4, limit));

  const jobs = await prisma.eventShowJob.findMany({
    where: {
      personId: target.personId,
      jobDate: { gte: todayStart },
      show: { event: { organizationId: user.organizationId } },
    },
    include: {
      venue: { select: { name: true } },
      show: { select: { id: true, showDate: true, event: { select: { id: true, title: true } } } },
    },
    orderBy: [{ jobDate: "asc" }, { sortOrder: "asc" }],
    take: fetchCap,
  });

  const eventRows = jobs.map((j) => {
    const plannedStart = toDateTimeFromDateAndTime(j.jobDate.toISOString(), j.startTime);
    const plannedEnd =
      plannedStart != null
        ? new Date(plannedStart.getTime() + j.durationMinutes * 60_000)
        : null;
    return {
      id: j.id,
      source: "event" as const,
      title: j.title,
      jobDate: iso(j.jobDate),
      startTime: j.startTime,
      durationMinutes: j.durationMinutes,
      plannedStartsAt: plannedStart ? iso(plannedStart) : iso(j.jobDate),
      plannedEndsAt: plannedEnd ? iso(plannedEnd) : iso(j.jobDate),
      eventId: j.show.event.id,
      eventTitle: j.show.event.title,
      showId: j.show.id,
      showDate: iso(j.show.showDate),
      venueName: j.venue.name,
      timeProjectId: null as string | null,
      tourShowId: null as string | null,
      tourScheduleEventId: null as string | null,
      eventShowStaffingId: null as string | null,
      internalBookingPersonId: null as string | null,
      internalBookingDayKey: null as string | null,
    };
  });

  const upcomingRangeEnd = new Date(todayStart.getTime() + 366 * 86_400_000);

  const staffingRows = await fetchEventStaffingPlanJobs({
    organizationId: user.organizationId,
    personId: target.personId,
    rangeStart: todayStart,
    rangeEndExclusive: upcomingRangeEnd,
    eventShowJobs: jobs.map((j) => ({ showId: j.showId, jobDate: j.jobDate })),
  });

  const tourRows = await fetchTourPlanJobsFromDate({
    organizationId: user.organizationId,
    personId: target.personId,
    fromDate: todayStart,
    take: fetchCap,
  });

  const ibookRows = await fetchInternalBookingPlanJobsForRange({
    organizationId: user.organizationId,
    personId: target.personId,
    rangeStart: todayStart,
    rangeEndExclusive: upcomingRangeEnd,
  });

  const merged = [...eventRows, ...staffingRows, ...tourRows, ...ibookRows].sort((a, b) => {
    const da = a.jobDate.localeCompare(b.jobDate);
    if (da !== 0) return da;
    return a.startTime.localeCompare(b.startTime);
  });
  const data = merged.slice(0, limit);
  return c.json({ data });
});

timeRouter.get("/time/entries", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const r = parseRange(c);
  if ("error" in r) return c.json({ error: { message: r.error, code: "BAD_REQUEST" } }, 400);
  const { rangeStart, rangeEndExclusive } = r;
  const qPerson = c.req.query("personId");
  const target = await resolveTargetPersonId(c, user.organizationId, qPerson);
  if ("error" in target) {
    return c.json({ error: { message: target.error, code: "BAD_REQUEST" } }, target.status);
  }

  const rows = await prisma.timeEntry.findMany({
    where: {
      organizationId: user.organizationId,
      personId: target.personId,
      startsAt: { lt: rangeEndExclusive },
      endsAt: { gt: rangeStart },
    },
    include: { tagLinks: { select: { timeTagId: true } } },
    orderBy: { startsAt: "asc" },
  });
  return c.json({ data: rows.map(serializeEntry) });
});

timeRouter.post("/time/entries", zValidator("json", CreateTimeEntrySchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId || !user.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time") || !canAction(c, "time.write")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const body = c.req.valid("json");
  const myPersonId = await resolvePersonIdForUser(user.organizationId, user.email);
  if (!myPersonId) {
    return c.json({ error: { message: "No linked person profile.", code: "BAD_REQUEST" } }, 400);
  }

  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(body.endsAt);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    return c.json({ error: { message: "Invalid time range", code: "BAD_REQUEST" } }, 400);
  }
  if (await findApprovedTimesheet({
    organizationId: user.organizationId,
    personId: myPersonId,
    startsAt,
    endsAt,
  })) {
    return c.json(
      { error: { message: "Timesheet is approved. Ask an admin to reopen it before editing.", code: "TIMESHEET_APPROVED" } },
      423
    );
  }

  let eventShowJobId: string | null = body.eventShowJobId ?? null;
  let eventId: string | null = body.eventId ?? null;
  let tourShowId: string | null = body.tourShowId ?? null;
  let eventShowStaffingId: string | null = body.eventShowStaffingId ?? null;
  let internalBookingPersonId: string | null = body.internalBookingPersonId ?? null;
  let internalBookingDayKey: string | null = body.internalBookingDayKey ?? null;

  if (body.kind === "job") {
    const nAssign =
      Number(Boolean(eventShowJobId)) +
      Number(Boolean(tourShowId)) +
      Number(Boolean(eventShowStaffingId)) +
      Number(Boolean(internalBookingPersonId));
    if (nAssign > 1) {
      return c.json(
        {
          error: {
            message:
              "Use only one assignment: eventShowJobId, tourShowId, eventShowStaffingId, or internal booking (person + day).",
            code: "BAD_REQUEST",
          },
        },
        400
      );
    }
    if (nAssign === 0) {
      return c.json(
        { error: { message: "Job entries require an assignment reference.", code: "BAD_REQUEST" } },
        400
      );
    }
    if (internalBookingPersonId && !internalBookingDayKey) {
      return c.json(
        {
          error: {
            message: "internalBookingDayKey (YYYY-MM-DD) is required with internalBookingPersonId.",
            code: "BAD_REQUEST",
          },
        },
        400
      );
    }
    if (!internalBookingPersonId && internalBookingDayKey) {
      return c.json(
        {
          error: { message: "internalBookingPersonId is required with internalBookingDayKey.", code: "BAD_REQUEST" } },
        400
      );
    }

    const tagIds = body.tagIds ?? [];
    if (tagIds.length) {
      const count = await prisma.timeTag.count({
        where: { organizationId: user.organizationId, id: { in: tagIds } },
      });
      if (count !== tagIds.length) {
        return c.json({ error: { message: "Invalid tag id", code: "BAD_REQUEST" } }, 400);
      }
    }

    if (tourShowId) {
      await syncEventShowTimeProjects(user.organizationId);
      const show = await prisma.tourShow.findFirst({
        where: {
          id: tourShowId,
          tour: { organizationId: user.organizationId },
          OR: [
            { showPeople: { some: { personId: myPersonId } } },
            {
              AND: [
                { showPeople: { none: {} } },
                { tour: { people: { some: { personId: myPersonId } } } },
              ],
            },
          ],
        },
        select: { id: true },
      });
      if (!show) {
        return c.json(
          { error: { message: "Tour show not found or you are not on the roster.", code: "NOT_FOUND" } }, 404
        );
      }

      let resolvedProjectId: string | null = body.timeProjectId ?? null;
      if (resolvedProjectId) {
        const p = await prisma.timeProject.findFirst({
          where: { id: resolvedProjectId, organizationId: user.organizationId },
        });
        if (!p) return c.json({ error: { message: "Project not found", code: "NOT_FOUND" } }, 404);
      } else {
        const p = await prisma.timeProject.findFirst({
          where: { organizationId: user.organizationId, tourShowId: show.id },
          select: { id: true },
        });
        resolvedProjectId = p?.id ?? null;
      }
      if (!resolvedProjectId) {
        await syncEventShowTimeProjects(user.organizationId);
        const p2 = await prisma.timeProject.findFirst({
          where: { organizationId: user.organizationId, tourShowId: show.id },
          select: { id: true },
        });
        resolvedProjectId = p2?.id ?? null;
      }
      if (!resolvedProjectId) {
        return c.json(
          { error: { message: "No time project for this tour date. Contact an admin.", code: "BAD_REQUEST" } },
          400
        );
      }

      eventShowJobId = null;
      eventId = null;
      eventShowStaffingId = null;
      internalBookingPersonId = null;
      internalBookingDayKey = null;

      const existingTour = await prisma.timeEntry.findFirst({
        where: { personId: myPersonId, tourShowId },
        include: { tagLinks: { select: { timeTagId: true } } },
      });

      if (existingTour) {
        const spans = await computeNonOverlappingSpans({
          organizationId: user.organizationId,
          personId: myPersonId,
          startsAt,
          endsAt,
          excludeEntryId: existingTour.id,
        });
        if (spans.length === 0) {
          return c.json(
            { error: { message: "Time range fully overlaps existing entries", code: "OVERLAP_CONFLICT" } },
            409
          );
        }
        const primary = spans[0];
        if (!primary) {
          return c.json(
            { error: { message: "Time range fully overlaps existing entries", code: "OVERLAP_CONFLICT" } },
            409
          );
        }
        const updated = await prisma.timeEntry.update({
          where: { id: existingTour.id },
          data: {
            startsAt: primary.startsAt,
            endsAt: primary.endsAt,
            category: body.category ?? "work",
            timeProjectId: resolvedProjectId,
            note: body.note ?? null,
            isLocked: body.isLocked ?? false,
            eventShowStaffingId: null,
            internalBookingPersonId: null,
            internalBookingDayKey: null,
            tagLinks: {
              deleteMany: {},
              createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) },
            },
          },
          include: { tagLinks: { select: { timeTagId: true } } },
        });
        if (spans.length > 1) {
          for (const s of spans.slice(1)) {
            await prisma.timeEntry.create({
              data: {
                organizationId: user.organizationId,
                userId: user.id,
                personId: myPersonId,
                startsAt: s.startsAt,
                endsAt: s.endsAt,
                kind: "custom",
                category: body.category ?? "work",
                eventShowJobId: null,
                eventId: null,
                tourShowId: null,
                eventShowStaffingId: null,
                internalBookingPersonId: null,
                internalBookingDayKey: null,
                timeProjectId: resolvedProjectId,
                note: body.note ?? null,
                isLocked: body.isLocked ?? false,
                tagLinks: { createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) } },
              },
            });
          }
        }
        return c.json({ data: serializeEntry(updated) });
      }

      const spans = await computeNonOverlappingSpans({
        organizationId: user.organizationId,
        personId: myPersonId,
        startsAt,
        endsAt,
      });
      if (spans.length === 0) {
        return c.json(
          { error: { message: "Time range fully overlaps existing entries", code: "OVERLAP_CONFLICT" } },
          409
        );
      }
      const primary = spans[0];
      if (!primary) {
        return c.json(
          { error: { message: "Time range fully overlaps existing entries", code: "OVERLAP_CONFLICT" } },
          409
        );
      }
      const created = await prisma.timeEntry.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          personId: myPersonId,
          startsAt: primary.startsAt,
          endsAt: primary.endsAt,
          kind: "job",
          category: body.category ?? "work",
          eventShowJobId: null,
          eventId: null,
          tourShowId,
          eventShowStaffingId: null,
          internalBookingPersonId: null,
          internalBookingDayKey: null,
          timeProjectId: resolvedProjectId,
          note: body.note ?? null,
          isLocked: body.isLocked ?? false,
          tagLinks: { createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) } },
        },
        include: { tagLinks: { select: { timeTagId: true } } },
      });
      if (spans.length > 1) {
        for (const s of spans.slice(1)) {
          await prisma.timeEntry.create({
            data: {
              organizationId: user.organizationId,
              userId: user.id,
              personId: myPersonId,
              startsAt: s.startsAt,
              endsAt: s.endsAt,
              kind: "custom",
              category: body.category ?? "work",
              eventShowJobId: null,
              eventId: null,
              tourShowId: null,
              eventShowStaffingId: null,
              internalBookingPersonId: null,
              internalBookingDayKey: null,
              timeProjectId: resolvedProjectId,
              note: body.note ?? null,
              isLocked: body.isLocked ?? false,
              tagLinks: { createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) } },
            },
          });
        }
      }
      return c.json({ data: serializeEntry(created) });
    }

    if (eventShowStaffingId) {
      await syncEventShowTimeProjects(user.organizationId);
      const staffing = await prisma.eventShowStaffing.findFirst({
        where: {
          id: eventShowStaffingId,
          personId: myPersonId,
          show: {
            event: { organizationId: user.organizationId },
            status: { not: "cancelled" },
          },
        },
        include: { show: { select: { id: true, eventId: true } } },
      });
      if (!staffing) {
        return c.json(
          { error: { message: "Staffing assignment not found or not yours.", code: "NOT_FOUND" } },
          404
        );
      }

      let resolvedProjectId: string | null = body.timeProjectId ?? null;
      if (resolvedProjectId) {
        const p = await prisma.timeProject.findFirst({
          where: { id: resolvedProjectId, organizationId: user.organizationId },
        });
        if (!p) return c.json({ error: { message: "Project not found", code: "NOT_FOUND" } }, 404);
      } else {
        const p = await prisma.timeProject.findFirst({
          where: { organizationId: user.organizationId, eventShowId: staffing.show.id },
          select: { id: true },
        });
        resolvedProjectId = p?.id ?? null;
      }
      if (!resolvedProjectId) {
        await syncEventShowTimeProjects(user.organizationId);
        const p2 = await prisma.timeProject.findFirst({
          where: { organizationId: user.organizationId, eventShowId: staffing.show.id },
          select: { id: true },
        });
        resolvedProjectId = p2?.id ?? null;
      }
      if (!resolvedProjectId) {
        return c.json(
          { error: { message: "No time project for this show. Contact an admin.", code: "BAD_REQUEST" } },
          400
        );
      }

      eventShowJobId = null;
      tourShowId = null;
      eventId = staffing.show.eventId;
      internalBookingPersonId = null;
      internalBookingDayKey = null;

      const existingStaff = await prisma.timeEntry.findFirst({
        where: { personId: myPersonId, eventShowStaffingId },
        include: { tagLinks: { select: { timeTagId: true } } },
      });

      const spillData = {
        organizationId: user.organizationId,
        userId: user.id,
        personId: myPersonId,
        kind: "custom" as const,
        category: body.category ?? "work",
        eventShowJobId: null as string | null,
        eventId: staffing.show.eventId,
        tourShowId: null as string | null,
        eventShowStaffingId: null as string | null,
        internalBookingPersonId: null as string | null,
        internalBookingDayKey: null as string | null,
        timeProjectId: resolvedProjectId,
        note: body.note ?? null,
        isLocked: body.isLocked ?? false,
      };

      if (existingStaff) {
        const spans = await computeNonOverlappingSpans({
          organizationId: user.organizationId,
          personId: myPersonId,
          startsAt,
          endsAt,
          excludeEntryId: existingStaff.id,
        });
        if (spans.length === 0) {
          return c.json(
            { error: { message: "Time range fully overlaps existing entries", code: "OVERLAP_CONFLICT" } },
            409
          );
        }
        const primary = spans[0];
        if (!primary) {
          return c.json(
            { error: { message: "Time range fully overlaps existing entries", code: "OVERLAP_CONFLICT" } },
            409
          );
        }
        const updated = await prisma.timeEntry.update({
          where: { id: existingStaff.id },
          data: {
            startsAt: primary.startsAt,
            endsAt: primary.endsAt,
            category: body.category ?? "work",
            timeProjectId: resolvedProjectId,
            note: body.note ?? null,
            isLocked: body.isLocked ?? false,
            tagLinks: {
              deleteMany: {},
              createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) },
            },
          },
          include: { tagLinks: { select: { timeTagId: true } } },
        });
        if (spans.length > 1) {
          for (const s of spans.slice(1)) {
            await prisma.timeEntry.create({
              data: {
                ...spillData,
                startsAt: s.startsAt,
                endsAt: s.endsAt,
                tagLinks: { createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) } },
              },
            });
          }
        }
        return c.json({ data: serializeEntry(updated) });
      }

      const spans = await computeNonOverlappingSpans({
        organizationId: user.organizationId,
        personId: myPersonId,
        startsAt,
        endsAt,
      });
      if (spans.length === 0) {
        return c.json(
          { error: { message: "Time range fully overlaps existing entries", code: "OVERLAP_CONFLICT" } },
          409
        );
      }
      const primary = spans[0];
      if (!primary) {
        return c.json(
          { error: { message: "Time range fully overlaps existing entries", code: "OVERLAP_CONFLICT" } },
          409
        );
      }
      const created = await prisma.timeEntry.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          personId: myPersonId,
          startsAt: primary.startsAt,
          endsAt: primary.endsAt,
          kind: "job",
          category: body.category ?? "work",
          eventShowJobId: null,
          eventId: staffing.show.eventId,
          tourShowId: null,
          eventShowStaffingId,
          internalBookingPersonId: null,
          internalBookingDayKey: null,
          timeProjectId: resolvedProjectId,
          note: body.note ?? null,
          isLocked: body.isLocked ?? false,
          tagLinks: { createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) } },
        },
        include: { tagLinks: { select: { timeTagId: true } } },
      });
      if (spans.length > 1) {
        for (const s of spans.slice(1)) {
          await prisma.timeEntry.create({
            data: {
              ...spillData,
              startsAt: s.startsAt,
              endsAt: s.endsAt,
              tagLinks: { createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) } },
            },
          });
        }
      }
      return c.json({ data: serializeEntry(created) });
    }

    if (internalBookingPersonId && internalBookingDayKey) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(internalBookingDayKey)) {
        return c.json({ error: { message: "Invalid internalBookingDayKey.", code: "BAD_REQUEST" } }, 400);
      }
      const link = await prisma.internalBookingPerson.findFirst({
        where: {
          id: internalBookingPersonId,
          personId: myPersonId,
          booking: { organizationId: user.organizationId },
        },
        include: {
          booking: { select: { id: true, startDate: true, endDate: true } },
        },
      });
      if (!link) {
        return c.json(
          { error: { message: "Internal booking assignment not found or not yours.", code: "NOT_FOUND" } },
          404
        );
      }
      const b = link.booking;
      const dayProbe = new Date(`${internalBookingDayKey}T12:00:00.000Z`);
      if (Number.isNaN(dayProbe.getTime())) {
        return c.json({ error: { message: "Invalid internalBookingDayKey.", code: "BAD_REQUEST" } }, 400);
      }
      const first = utcDayStart(b.startDate);
      const last = b.endDate ? utcDayStart(b.endDate) : first;
      const d = utcDayStart(dayProbe);
      if (d.getTime() < first.getTime() || d.getTime() > last.getTime()) {
        return c.json(
          { error: { message: "Day is outside this booking's dates.", code: "BAD_REQUEST" } },
          400
        );
      }

      let resolvedProjectId: string | null = body.timeProjectId ?? null;
      if (resolvedProjectId) {
        const p = await prisma.timeProject.findFirst({
          where: { id: resolvedProjectId, organizationId: user.organizationId },
        });
        if (!p) return c.json({ error: { message: "Project not found", code: "NOT_FOUND" } }, 404);
      }

      eventShowJobId = null;
      tourShowId = null;
      eventShowStaffingId = null;
      eventId = null;

      const existingIb = await prisma.timeEntry.findFirst({
        where: { personId: myPersonId, internalBookingPersonId, internalBookingDayKey },
        include: { tagLinks: { select: { timeTagId: true } } },
      });

      const spillIb = {
        organizationId: user.organizationId,
        userId: user.id,
        personId: myPersonId,
        kind: "custom" as const,
        category: body.category ?? "work",
        eventShowJobId: null as string | null,
        eventId: null as string | null,
        tourShowId: null as string | null,
        eventShowStaffingId: null as string | null,
        internalBookingPersonId: null as string | null,
        internalBookingDayKey: null as string | null,
        timeProjectId: resolvedProjectId,
        note: body.note ?? null,
        isLocked: body.isLocked ?? false,
      };

      if (existingIb) {
        const spans = await computeNonOverlappingSpans({
          organizationId: user.organizationId,
          personId: myPersonId,
          startsAt,
          endsAt,
          excludeEntryId: existingIb.id,
        });
        if (spans.length === 0) {
          return c.json(
            { error: { message: "Time range fully overlaps existing entries", code: "OVERLAP_CONFLICT" } },
            409
          );
        }
        const primary = spans[0];
        if (!primary) {
          return c.json(
            { error: { message: "Time range fully overlaps existing entries", code: "OVERLAP_CONFLICT" } },
            409
          );
        }
        const updated = await prisma.timeEntry.update({
          where: { id: existingIb.id },
          data: {
            startsAt: primary.startsAt,
            endsAt: primary.endsAt,
            category: body.category ?? "work",
            timeProjectId: resolvedProjectId,
            note: body.note ?? null,
            isLocked: body.isLocked ?? false,
            tagLinks: {
              deleteMany: {},
              createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) },
            },
          },
          include: { tagLinks: { select: { timeTagId: true } } },
        });
        if (spans.length > 1) {
          for (const s of spans.slice(1)) {
            await prisma.timeEntry.create({
              data: {
                ...spillIb,
                startsAt: s.startsAt,
                endsAt: s.endsAt,
                tagLinks: { createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) } },
              },
            });
          }
        }
        return c.json({ data: serializeEntry(updated) });
      }

      const spans = await computeNonOverlappingSpans({
        organizationId: user.organizationId,
        personId: myPersonId,
        startsAt,
        endsAt,
      });
      if (spans.length === 0) {
        return c.json(
          { error: { message: "Time range fully overlaps existing entries", code: "OVERLAP_CONFLICT" } },
          409
        );
      }
      const primary = spans[0];
      if (!primary) {
        return c.json(
          { error: { message: "Time range fully overlaps existing entries", code: "OVERLAP_CONFLICT" } },
          409
        );
      }
      const created = await prisma.timeEntry.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          personId: myPersonId,
          startsAt: primary.startsAt,
          endsAt: primary.endsAt,
          kind: "job",
          category: body.category ?? "work",
          eventShowJobId: null,
          eventId: null,
          tourShowId: null,
          eventShowStaffingId: null,
          internalBookingPersonId,
          internalBookingDayKey,
          timeProjectId: resolvedProjectId,
          note: body.note ?? null,
          isLocked: body.isLocked ?? false,
          tagLinks: { createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) } },
        },
        include: { tagLinks: { select: { timeTagId: true } } },
      });
      if (spans.length > 1) {
        for (const s of spans.slice(1)) {
          await prisma.timeEntry.create({
            data: {
              ...spillIb,
              startsAt: s.startsAt,
              endsAt: s.endsAt,
              tagLinks: { createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) } },
            },
          });
        }
      }
      return c.json({ data: serializeEntry(created) });
    }

    if (!eventShowJobId) {
      return c.json({ error: { message: "Invalid job assignment.", code: "BAD_REQUEST" } }, 400);
    }

    const job = await prisma.eventShowJob.findFirst({
      where: {
        id: eventShowJobId!,
        personId: myPersonId,
        show: { event: { organizationId: user.organizationId } },
      },
      include: { show: { select: { eventId: true } } },
    });
    if (!job) {
      return c.json({ error: { message: "Job not found or not assigned to you", code: "NOT_FOUND" } }, 404);
    }
    eventId = job.show.eventId;
    tourShowId = null;
    const existing = await prisma.timeEntry.findFirst({
      where: { personId: myPersonId, eventShowJobId },
      include: { tagLinks: { select: { timeTagId: true } } },
    });
    if (body.timeProjectId) {
      const p = await prisma.timeProject.findFirst({
        where: { id: body.timeProjectId, organizationId: user.organizationId },
      });
      if (!p) return c.json({ error: { message: "Project not found", code: "NOT_FOUND" } }, 404);
    }

    if (existing) {
      const spans = await computeNonOverlappingSpans({
        organizationId: user.organizationId,
        personId: myPersonId,
        startsAt,
        endsAt,
        excludeEntryId: existing.id,
      });
      if (spans.length === 0) {
        return c.json(
          { error: { message: "Time range fully overlaps existing entries", code: "OVERLAP_CONFLICT" } },
          409
        );
      }
      const primary = spans[0];
      if (!primary) {
        return c.json(
          { error: { message: "Time range fully overlaps existing entries", code: "OVERLAP_CONFLICT" } },
          409
        );
      }
      const updated = await prisma.timeEntry.update({
        where: { id: existing.id },
        data: {
          startsAt: primary.startsAt,
          endsAt: primary.endsAt,
          category: body.category ?? "work",
          timeProjectId: body.timeProjectId ?? null,
          note: body.note ?? null,
          isLocked: body.isLocked ?? false,
          eventShowStaffingId: null,
          internalBookingPersonId: null,
          internalBookingDayKey: null,
          tagLinks: {
            deleteMany: {},
            createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) },
          },
        },
        include: { tagLinks: { select: { timeTagId: true } } },
      });
      if (spans.length > 1) {
        for (const s of spans.slice(1)) {
          await prisma.timeEntry.create({
            data: {
              organizationId: user.organizationId,
              userId: user.id,
              personId: myPersonId,
              startsAt: s.startsAt,
              endsAt: s.endsAt,
              kind: "custom",
              category: body.category ?? "work",
              eventShowJobId: null,
              eventId,
              tourShowId: null,
              eventShowStaffingId: null,
              internalBookingPersonId: null,
              internalBookingDayKey: null,
              timeProjectId: body.timeProjectId ?? null,
              note: body.note ?? null,
              isLocked: body.isLocked ?? false,
              tagLinks: { createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) } },
            },
          });
        }
      }
      return c.json({ data: serializeEntry(updated) });
    }

    const spans = await computeNonOverlappingSpans({
      organizationId: user.organizationId,
      personId: myPersonId,
      startsAt,
      endsAt,
    });
    if (spans.length === 0) {
      return c.json(
        { error: { message: "Time range fully overlaps existing entries", code: "OVERLAP_CONFLICT" } },
        409
      );
    }
    const primary = spans[0];
    if (!primary) {
      return c.json(
        { error: { message: "Time range fully overlaps existing entries", code: "OVERLAP_CONFLICT" } },
        409
      );
    }
    const created = await prisma.timeEntry.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        personId: myPersonId,
        startsAt: primary.startsAt,
        endsAt: primary.endsAt,
        kind: "job",
        category: body.category ?? "work",
        eventShowJobId,
        eventId,
        tourShowId: null,
        eventShowStaffingId: null,
        internalBookingPersonId: null,
        internalBookingDayKey: null,
        timeProjectId: body.timeProjectId ?? null,
        note: body.note ?? null,
        isLocked: body.isLocked ?? false,
        tagLinks: { createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) } },
      },
      include: { tagLinks: { select: { timeTagId: true } } },
    });
    if (spans.length > 1) {
      for (const s of spans.slice(1)) {
        await prisma.timeEntry.create({
          data: {
            organizationId: user.organizationId,
            userId: user.id,
            personId: myPersonId,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            kind: "custom",
            category: body.category ?? "work",
            eventShowJobId: null,
            eventId,
            tourShowId: null,
            eventShowStaffingId: null,
            internalBookingPersonId: null,
            internalBookingDayKey: null,
            timeProjectId: body.timeProjectId ?? null,
            note: body.note ?? null,
            isLocked: body.isLocked ?? false,
            tagLinks: { createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) } },
          },
        });
      }
    }
    return c.json({ data: serializeEntry(created) });
  }

  // custom
  if (
    eventShowJobId ||
    tourShowId ||
    eventShowStaffingId ||
    internalBookingPersonId ||
    internalBookingDayKey
  ) {
    return c.json(
      {
        error: {
          message:
            "Custom entries cannot reference a job, tour show, staffing assignment, or internal booking.",
          code: "BAD_REQUEST",
        },
      },
      400
    );
  }
  if (eventId) {
    const ev = await prisma.event.findFirst({
      where: { id: eventId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!ev) return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  }
  if (body.timeProjectId) {
    const p = await prisma.timeProject.findFirst({
      where: { id: body.timeProjectId, organizationId: user.organizationId },
    });
    if (!p) return c.json({ error: { message: "Project not found", code: "NOT_FOUND" } }, 404);
  }
  const tagIds = body.tagIds ?? [];
  if (tagIds.length) {
    const count = await prisma.timeTag.count({
      where: { organizationId: user.organizationId, id: { in: tagIds } },
    });
    if (count !== tagIds.length) {
      return c.json({ error: { message: "Invalid tag id", code: "BAD_REQUEST" } }, 400);
    }
  }

  const spans = await computeNonOverlappingSpans({
    organizationId: user.organizationId,
    personId: myPersonId,
    startsAt,
    endsAt,
  });
  if (spans.length === 0) {
    return c.json(
      { error: { message: "Time range fully overlaps existing entries", code: "OVERLAP_CONFLICT" } },
      409
    );
  }
  const primary = spans[0];
  if (!primary) {
    return c.json(
      { error: { message: "Time range fully overlaps existing entries", code: "OVERLAP_CONFLICT" } },
      409
    );
  }
  const created = await prisma.timeEntry.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      personId: myPersonId,
      startsAt: primary.startsAt,
      endsAt: primary.endsAt,
      kind: "custom",
      category: body.category ?? "work",
      eventShowJobId: null,
      eventId,
      tourShowId: null,
      eventShowStaffingId: null,
      internalBookingPersonId: null,
      internalBookingDayKey: null,
      timeProjectId: body.timeProjectId ?? null,
      note: body.note ?? null,
      isLocked: body.isLocked ?? false,
      tagLinks: { createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) } },
    },
    include: { tagLinks: { select: { timeTagId: true } } },
  });
  if (spans.length > 1) {
    for (const s of spans.slice(1)) {
      await prisma.timeEntry.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          personId: myPersonId,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          kind: "custom",
          category: body.category ?? "work",
          eventShowJobId: null,
          eventId,
          tourShowId: null,
          eventShowStaffingId: null,
          internalBookingPersonId: null,
          internalBookingDayKey: null,
          timeProjectId: body.timeProjectId ?? null,
          note: body.note ?? null,
          isLocked: body.isLocked ?? false,
          tagLinks: { createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) } },
        },
      });
    }
  }
  return c.json({ data: serializeEntry(created) });
});

timeRouter.patch("/time/entries/:id", zValidator("json", PatchTimeEntrySchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId || !user.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const existing = await prisma.timeEntry.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { tagLinks: { select: { timeTagId: true } } },
  });
  if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  const myPersonId = await resolvePersonIdForUser(user.organizationId, user.email);
  const canEditOwn = Boolean(myPersonId && existing.personId === myPersonId && canAction(c, "time.write"));
  const canEditAny = canAction(c, "time.read_all");
  if (!canEditOwn && !canEditAny) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  if (existing.isLocked) {
    const wantsUnlock = body.isLocked === false;
    const hasOtherChanges = Object.keys(body).some((k) => k !== "isLocked");
    if (!wantsUnlock || hasOtherChanges) {
      return c.json(
        {
          error: {
            message: "Entry is locked. Unlock it before editing.",
            code: "ENTRY_LOCKED",
          },
        },
        423
      );
    }
  }

  const startsAt = body.startsAt !== undefined ? new Date(body.startsAt) : existing.startsAt;
  const endsAt = body.endsAt !== undefined ? new Date(body.endsAt) : existing.endsAt;
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    return c.json({ error: { message: "Invalid time range", code: "BAD_REQUEST" } }, 400);
  }
  if (await findApprovedTimesheet({
    organizationId: user.organizationId,
    personId: existing.personId,
    startsAt: existing.startsAt < startsAt ? existing.startsAt : startsAt,
    endsAt: existing.endsAt > endsAt ? existing.endsAt : endsAt,
  })) {
    return c.json(
      { error: { message: "Timesheet is approved. Ask an admin to reopen it before editing.", code: "TIMESHEET_APPROVED" } },
      423
    );
  }

  if (body.timeProjectId !== undefined && body.timeProjectId !== null) {
    const p = await prisma.timeProject.findFirst({
      where: { id: body.timeProjectId, organizationId: user.organizationId },
    });
    if (!p) return c.json({ error: { message: "Project not found", code: "NOT_FOUND" } }, 404);
  }
  if (body.eventId !== undefined && body.eventId !== null) {
    const ev = await prisma.event.findFirst({
      where: { id: body.eventId, organizationId: user.organizationId },
    });
    if (!ev) return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  }
  if (body.tagIds !== undefined) {
    const tagIds = body.tagIds;
    if (tagIds.length) {
      const count = await prisma.timeTag.count({
        where: { organizationId: user.organizationId, id: { in: tagIds } },
      });
      if (count !== tagIds.length) {
        return c.json({ error: { message: "Invalid tag id", code: "BAD_REQUEST" } }, 400);
      }
    }
  }

  const finalKind = body.kind ?? existing.kind;
  let finalEventShowJobId =
    body.eventShowJobId !== undefined ? body.eventShowJobId : existing.eventShowJobId;
  let finalTourShowId = body.tourShowId !== undefined ? body.tourShowId : existing.tourShowId;
  let finalEventShowStaffingId =
    body.eventShowStaffingId !== undefined ? body.eventShowStaffingId : existing.eventShowStaffingId;
  let finalInternalBookingPersonId =
    body.internalBookingPersonId !== undefined
      ? body.internalBookingPersonId
      : existing.internalBookingPersonId;
  let finalInternalBookingDayKey =
    body.internalBookingDayKey !== undefined
      ? body.internalBookingDayKey
      : existing.internalBookingDayKey;

  if (finalKind === "custom") {
    finalEventShowJobId = null;
    finalTourShowId = null;
    finalEventShowStaffingId = null;
    finalInternalBookingPersonId = null;
    finalInternalBookingDayKey = null;
  }

  if (finalInternalBookingPersonId && !finalInternalBookingDayKey) {
    return c.json(
      {
        error: {
          message: "internalBookingDayKey (YYYY-MM-DD) is required with internalBookingPersonId.",
          code: "BAD_REQUEST",
        },
      },
      400
    );
  }
  if (!finalInternalBookingPersonId && finalInternalBookingDayKey) {
    return c.json(
      {
        error: {
          message: "internalBookingPersonId is required with internalBookingDayKey.",
          code: "BAD_REQUEST",
        },
      },
      400
    );
  }

  const nAssign =
    Number(Boolean(finalEventShowJobId)) +
    Number(Boolean(finalTourShowId)) +
    Number(Boolean(finalEventShowStaffingId)) +
    Number(Boolean(finalInternalBookingPersonId));
  if (nAssign > 1) {
    return c.json(
      {
        error: {
          message:
            "Only one of eventShowJobId, tourShowId, eventShowStaffingId, or internal booking (person + day) may be set.",
          code: "BAD_REQUEST",
        },
      },
      400
    );
  }
  if (finalKind === "job" && nAssign !== 1) {
    return c.json(
      {
        error: {
          message:
            "Job entries require exactly one assignment: eventShowJobId, tourShowId, eventShowStaffingId, or internal booking (person + day).",
          code: "BAD_REQUEST",
        },
      },
      400
    );
  }

  if (finalKind === "job") {
    if (finalTourShowId) {
      const ts = await prisma.tourShow.findFirst({
        where: {
          id: finalTourShowId,
          tour: { organizationId: user.organizationId },
          OR: [
            { showPeople: { some: { personId: existing.personId } } },
            {
              AND: [
                { showPeople: { none: {} } },
                { tour: { people: { some: { personId: existing.personId } } } },
              ],
            },
          ],
        },
        select: { id: true },
      });
      if (!ts) {
        return c.json(
          { error: { message: "Tour show not found or person is not on roster.", code: "NOT_FOUND" } },
          404
        );
      }
    } else if (finalEventShowJobId) {
      const jobRow = await prisma.eventShowJob.findFirst({
        where: {
          id: finalEventShowJobId,
          personId: existing.personId,
          show: { event: { organizationId: user.organizationId } },
        },
        select: { id: true },
      });
      if (!jobRow) {
        return c.json(
          { error: { message: "Event show job not found or not assigned.", code: "NOT_FOUND" } },
          404
        );
      }
    } else if (finalEventShowStaffingId) {
      const st = await prisma.eventShowStaffing.findFirst({
        where: {
          id: finalEventShowStaffingId,
          personId: existing.personId,
          show: {
            event: { organizationId: user.organizationId },
            status: { not: "cancelled" },
          },
        },
        select: { id: true },
      });
      if (!st) {
        return c.json(
          { error: { message: "Staffing assignment not found or not assigned.", code: "NOT_FOUND" } },
          404
        );
      }
    } else if (finalInternalBookingPersonId) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(finalInternalBookingDayKey!)) {
        return c.json({ error: { message: "Invalid internalBookingDayKey.", code: "BAD_REQUEST" } }, 400);
      }
      const link = await prisma.internalBookingPerson.findFirst({
        where: {
          id: finalInternalBookingPersonId,
          personId: existing.personId,
          booking: { organizationId: user.organizationId },
        },
        include: { booking: { select: { startDate: true, endDate: true } } },
      });
      if (!link) {
        return c.json(
          { error: { message: "Internal booking assignment not found or not assigned.", code: "NOT_FOUND" } },
          404
        );
      }
      const dayProbe = new Date(`${finalInternalBookingDayKey}T12:00:00.000Z`);
      if (Number.isNaN(dayProbe.getTime())) {
        return c.json({ error: { message: "Invalid internalBookingDayKey.", code: "BAD_REQUEST" } }, 400);
      }
      const b = link.booking;
      const first = utcDayStart(b.startDate);
      const last = b.endDate ? utcDayStart(b.endDate) : first;
      const d = utcDayStart(dayProbe);
      if (d.getTime() < first.getTime() || d.getTime() > last.getTime()) {
        return c.json(
          { error: { message: "Day is outside this booking's dates.", code: "BAD_REQUEST" } },
          400
        );
      }
    }
  }

  const finalCategory = body.category ?? existing.category;
  const finalEventId = body.eventId !== undefined ? body.eventId : existing.eventId;
  const finalProjectId = body.timeProjectId !== undefined ? body.timeProjectId : existing.timeProjectId;
  const finalNote = body.note !== undefined ? body.note : existing.note;
  const finalIsLocked = body.isLocked !== undefined ? body.isLocked : existing.isLocked;
  const finalTagIds = body.tagIds !== undefined ? body.tagIds : existing.tagLinks.map((t) => t.timeTagId);

  const spans = await computeNonOverlappingSpans({
    organizationId: user.organizationId,
    personId: existing.personId,
    startsAt,
    endsAt,
    excludeEntryId: existing.id,
  });
  if (spans.length === 0) {
    return c.json(
      { error: { message: "Time range fully overlaps existing entries", code: "OVERLAP_CONFLICT" } },
      409
    );
  }
  const primary = spans[0];
  if (!primary) {
    return c.json(
      { error: { message: "Time range fully overlaps existing entries", code: "OVERLAP_CONFLICT" } },
      409
    );
  }

  const updated = await prisma.timeEntry.update({
    where: { id },
    data: {
      startsAt: primary.startsAt,
      endsAt: primary.endsAt,
      kind: finalKind,
      category: finalCategory,
      eventShowJobId: finalEventShowJobId,
      eventId: finalEventId,
      tourShowId: finalTourShowId,
      eventShowStaffingId: finalEventShowStaffingId,
      internalBookingPersonId: finalInternalBookingPersonId,
      internalBookingDayKey: finalInternalBookingDayKey,
      timeProjectId: finalProjectId,
      note: finalNote,
      isLocked: finalIsLocked,
      tagLinks: {
        deleteMany: {},
        createMany: { data: finalTagIds.map((timeTagId) => ({ timeTagId })) },
      },
    },
    include: { tagLinks: { select: { timeTagId: true } } },
  });
  if (spans.length > 1) {
    for (const s of spans.slice(1)) {
      await prisma.timeEntry.create({
        data: {
          organizationId: user.organizationId,
          userId: existing.userId,
          personId: existing.personId,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          kind: "custom",
          category: finalCategory,
          eventShowJobId: null,
          eventId: finalEventId,
          tourShowId: null,
          eventShowStaffingId: null,
          internalBookingPersonId: null,
          internalBookingDayKey: null,
          timeProjectId: finalProjectId,
          note: finalNote,
          isLocked: finalIsLocked,
          tagLinks: { createMany: { data: finalTagIds.map((timeTagId) => ({ timeTagId })) } },
        },
      });
    }
  }
  return c.json({ data: serializeEntry(updated) });
});

timeRouter.delete("/time/entries/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const existing = await prisma.timeEntry.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  const myPersonId = await resolvePersonIdForUser(user.organizationId, user.email);
  const canDelOwn = Boolean(myPersonId && existing.personId === myPersonId && canAction(c, "time.write"));
  const canDelAny = canAction(c, "time.read_all");
  if (!canDelOwn && !canDelAny) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  if (await findApprovedTimesheet({
    organizationId: user.organizationId,
    personId: existing.personId,
    startsAt: existing.startsAt,
    endsAt: existing.endsAt,
  })) {
    return c.json(
      { error: { message: "Timesheet is approved. Ask an admin to reopen it before deleting.", code: "TIMESHEET_APPROVED" } },
      423
    );
  }
  if (existing.isLocked) {
    return c.json(
      {
        error: {
          message: "Entry is locked. Unlock it before deleting.",
          code: "ENTRY_LOCKED",
        },
      },
      423
    );
  }
  await prisma.timeEntry.delete({ where: { id } });
  return c.json({ ok: true });
});

timeRouter.get("/time/travel-claims", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const r = parseRange(c);
  if ("error" in r) return c.json({ error: { message: r.error, code: "BAD_REQUEST" } }, 400);
  const qPerson = c.req.query("personId");
  const target = await resolveTargetPersonId(c, user.organizationId, qPerson);
  if ("error" in target) {
    return c.json({ error: { message: target.error, code: "BAD_REQUEST" } }, target.status);
  }
  const rows = await prisma.timeTravelClaim.findMany({
    where: {
      organizationId: user.organizationId,
      personId: target.personId,
      startsAt: { lt: r.rangeEndExclusive },
      endsAt: { gt: r.rangeStart },
    },
    orderBy: { startsAt: "asc" },
  });
  return c.json({ data: rows.map(serializeTravelClaim) });
});

timeRouter.post("/time/travel-claims", zValidator("json", CreateTimeTravelClaimSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId || !user.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time") || !canAction(c, "time.write")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const personId = await resolvePersonIdForUser(user.organizationId, user.email);
  if (!personId) {
    return c.json({ error: { message: "No linked person profile.", code: "BAD_REQUEST" } }, 400);
  }
  const body = c.req.valid("json");
  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(body.endsAt);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    return c.json({ error: { message: "Invalid travel range", code: "BAD_REQUEST" } }, 400);
  }
  if (await findApprovedTimesheet({ organizationId: user.organizationId, personId, startsAt, endsAt })) {
    return c.json(
      { error: { message: "Timesheet is approved. Ask an admin to reopen it before editing travel.", code: "TIMESHEET_APPROVED" } },
      423
    );
  }
  const country = body.country.trim().toUpperCase();
  const ruleSet = getCountryRuleSet(country);
  if (!ruleSet) {
    return c.json({ error: { message: "Country rule set is not supported yet.", code: "UNSUPPORTED_RULE_SET" } }, 400);
  }
  const calc = ruleSet.travel.calculateAllowance({
    startsAt,
    endsAt,
    allowanceType: body.allowanceType,
    rateYear: body.rateYear,
    breakfastProvided: body.breakfastProvided,
    lunchProvided: body.lunchProvided,
    dinnerProvided: body.dinnerProvided,
    lodgingAllowance: body.lodgingAllowance,
    lodgingCovered: body.lodgingCovered,
    foodCoveredByReceipts: body.foodCoveredByReceipts,
    isTemporaryWorkplace: body.isTemporaryWorkplace,
    hasUsualResidence: body.hasUsualResidence,
    overnightAwayFromHome: body.overnightAwayFromHome,
    cannotReturnHome: body.cannotReturnHome,
    twelveMonthRuleOk: body.twelveMonthRuleOk,
    salaryReductionAgreement: body.salaryReductionAgreement,
    receivesBIncome: body.receivesBIncome,
    excludedWorkerType: body.excludedWorkerType,
    transportsPeopleOrGoods: body.transportsPeopleOrGoods,
    lodgingByReceipt: body.lodgingByReceipt,
    dayLines: body.dayLines,
  });
  const row = await prisma.timeTravelClaim.create({
    data: {
      organizationId: user.organizationId,
      personId,
      createdByUserId: user.id,
      startsAt,
      endsAt,
      destination: body.destination.trim(),
      purpose: body.purpose.trim(),
      country,
      allowanceType: body.allowanceType,
      ...calc,
      breakfastProvided: body.breakfastProvided ?? false,
      lunchProvided: body.lunchProvided ?? false,
      dinnerProvided: body.dinnerProvided ?? false,
      lodgingAllowance: body.lodgingAllowance ?? false,
      lodgingCovered: body.lodgingCovered ?? false,
      foodCoveredByReceipts: body.foodCoveredByReceipts ?? false,
      isTemporaryWorkplace: body.isTemporaryWorkplace ?? false,
      hasUsualResidence: body.hasUsualResidence ?? false,
      overnightAwayFromHome: body.overnightAwayFromHome ?? false,
      cannotReturnHome: body.cannotReturnHome ?? false,
      twelveMonthRuleOk: body.twelveMonthRuleOk ?? true,
      salaryReductionAgreement: body.salaryReductionAgreement ?? false,
      receivesBIncome: body.receivesBIncome ?? false,
      excludedWorkerType: body.excludedWorkerType ?? false,
      transportsPeopleOrGoods: body.transportsPeopleOrGoods ?? false,
      lodgingByReceipt: body.lodgingByReceipt ?? false,
      dayLines: body.dayLines ?? [],
      eventId: body.eventId ?? null,
      eventShowJobId: body.eventShowJobId ?? null,
      timeProjectId: body.timeProjectId ?? null,
      notes: body.notes ?? null,
    },
  });
  return c.json({ data: serializeTravelClaim(row) }, 201);
});

timeRouter.patch("/time/travel-claims/:id", zValidator("json", PatchTimeTravelClaimSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId || !user.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const existing = await prisma.timeTravelClaim.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  const myPersonId = await resolvePersonIdForUser(user.organizationId, user.email);
  const canEditOwn = Boolean(myPersonId && existing.personId === myPersonId && canAction(c, "time.write"));
  const canEditAny = canAction(c, "time.read_all");
  if (!canEditOwn && !canEditAny) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const body = c.req.valid("json");
  const startsAt = body.startsAt !== undefined ? new Date(body.startsAt) : existing.startsAt;
  const endsAt = body.endsAt !== undefined ? new Date(body.endsAt) : existing.endsAt;
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    return c.json({ error: { message: "Invalid travel range", code: "BAD_REQUEST" } }, 400);
  }
  if (await findApprovedTimesheet({
    organizationId: user.organizationId,
    personId: existing.personId,
    startsAt: existing.startsAt < startsAt ? existing.startsAt : startsAt,
    endsAt: existing.endsAt > endsAt ? existing.endsAt : endsAt,
  })) {
    return c.json(
      { error: { message: "Timesheet is approved. Ask an admin to reopen it before editing travel.", code: "TIMESHEET_APPROVED" } },
      423
    );
  }
  const allowanceType = body.allowanceType ?? (existing.allowanceType as TravelAllowanceType);
  const country = body.country !== undefined ? body.country.trim().toUpperCase() : existing.country;
  const ruleSet = getCountryRuleSet(country);
  if (!ruleSet) {
    return c.json({ error: { message: "Country rule set is not supported yet.", code: "UNSUPPORTED_RULE_SET" } }, 400);
  }
  const calc = ruleSet.travel.calculateAllowance({
    startsAt,
    endsAt,
    allowanceType,
    rateYear: body.rateYear ?? existing.rateYear,
    breakfastProvided: body.breakfastProvided ?? existing.breakfastProvided,
    lunchProvided: body.lunchProvided ?? existing.lunchProvided,
    dinnerProvided: body.dinnerProvided ?? existing.dinnerProvided,
    lodgingAllowance: body.lodgingAllowance ?? existing.lodgingAllowance,
    lodgingCovered: body.lodgingCovered ?? existing.lodgingCovered,
    foodCoveredByReceipts: body.foodCoveredByReceipts ?? existing.foodCoveredByReceipts,
    isTemporaryWorkplace: body.isTemporaryWorkplace ?? existing.isTemporaryWorkplace,
    hasUsualResidence: body.hasUsualResidence ?? existing.hasUsualResidence,
    overnightAwayFromHome: body.overnightAwayFromHome ?? existing.overnightAwayFromHome,
    cannotReturnHome: body.cannotReturnHome ?? existing.cannotReturnHome,
    twelveMonthRuleOk: body.twelveMonthRuleOk ?? existing.twelveMonthRuleOk,
    salaryReductionAgreement: body.salaryReductionAgreement ?? existing.salaryReductionAgreement,
    receivesBIncome: body.receivesBIncome ?? existing.receivesBIncome,
    excludedWorkerType: body.excludedWorkerType ?? existing.excludedWorkerType,
    transportsPeopleOrGoods: body.transportsPeopleOrGoods ?? existing.transportsPeopleOrGoods,
    lodgingByReceipt: body.lodgingByReceipt ?? existing.lodgingByReceipt,
    dayLines: body.dayLines ?? normalizeTravelDayLines(existing.dayLines),
  });
  const updated = await prisma.timeTravelClaim.update({
    where: { id },
    data: {
      startsAt,
      endsAt,
      ...(body.destination !== undefined ? { destination: body.destination.trim() } : {}),
      ...(body.purpose !== undefined ? { purpose: body.purpose.trim() } : {}),
      country,
      allowanceType,
      ...calc,
      ...(body.breakfastProvided !== undefined ? { breakfastProvided: body.breakfastProvided } : {}),
      ...(body.lunchProvided !== undefined ? { lunchProvided: body.lunchProvided } : {}),
      ...(body.dinnerProvided !== undefined ? { dinnerProvided: body.dinnerProvided } : {}),
      ...(body.lodgingAllowance !== undefined ? { lodgingAllowance: body.lodgingAllowance } : {}),
      ...(body.lodgingCovered !== undefined ? { lodgingCovered: body.lodgingCovered } : {}),
      ...(body.foodCoveredByReceipts !== undefined ? { foodCoveredByReceipts: body.foodCoveredByReceipts } : {}),
      ...(body.isTemporaryWorkplace !== undefined ? { isTemporaryWorkplace: body.isTemporaryWorkplace } : {}),
      ...(body.hasUsualResidence !== undefined ? { hasUsualResidence: body.hasUsualResidence } : {}),
      ...(body.overnightAwayFromHome !== undefined ? { overnightAwayFromHome: body.overnightAwayFromHome } : {}),
      ...(body.cannotReturnHome !== undefined ? { cannotReturnHome: body.cannotReturnHome } : {}),
      ...(body.twelveMonthRuleOk !== undefined ? { twelveMonthRuleOk: body.twelveMonthRuleOk } : {}),
      ...(body.salaryReductionAgreement !== undefined ? { salaryReductionAgreement: body.salaryReductionAgreement } : {}),
      ...(body.receivesBIncome !== undefined ? { receivesBIncome: body.receivesBIncome } : {}),
      ...(body.excludedWorkerType !== undefined ? { excludedWorkerType: body.excludedWorkerType } : {}),
      ...(body.transportsPeopleOrGoods !== undefined ? { transportsPeopleOrGoods: body.transportsPeopleOrGoods } : {}),
      ...(body.lodgingByReceipt !== undefined ? { lodgingByReceipt: body.lodgingByReceipt } : {}),
      ...(body.dayLines !== undefined ? { dayLines: body.dayLines } : {}),
      ...(body.eventId !== undefined ? { eventId: body.eventId } : {}),
      ...(body.eventShowJobId !== undefined ? { eventShowJobId: body.eventShowJobId } : {}),
      ...(body.timeProjectId !== undefined ? { timeProjectId: body.timeProjectId } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    },
  });
  return c.json({ data: serializeTravelClaim(updated) });
});

timeRouter.delete("/time/travel-claims/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const existing = await prisma.timeTravelClaim.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  const myPersonId = await resolvePersonIdForUser(user.organizationId, user.email);
  const canDelOwn = Boolean(myPersonId && existing.personId === myPersonId && canAction(c, "time.write"));
  const canDelAny = canAction(c, "time.read_all");
  if (!canDelOwn && !canDelAny) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  if (await findApprovedTimesheet({
    organizationId: user.organizationId,
    personId: existing.personId,
    startsAt: existing.startsAt,
    endsAt: existing.endsAt,
  })) {
    return c.json(
      { error: { message: "Timesheet is approved. Ask an admin to reopen it before deleting travel.", code: "TIMESHEET_APPROVED" } },
      423
    );
  }
  await prisma.timeTravelClaim.delete({ where: { id } });
  return c.json({ ok: true });
});

timeRouter.get("/time/approvals", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const r = parseRange(c);
  if ("error" in r) return c.json({ error: { message: r.error, code: "BAD_REQUEST" } }, 400);
  const target = await resolveTargetPersonId(c, user.organizationId, c.req.query("personId"));
  if ("error" in target) {
    return c.json({ error: { message: target.error, code: "BAD_REQUEST" } }, target.status);
  }
  const rows = await prisma.timesheetApproval.findMany({
    where: {
      organizationId: user.organizationId,
      personId: target.personId,
      periodStart: { lt: r.rangeEndExclusive },
      periodEnd: { gt: r.rangeStart },
    },
    orderBy: { periodStart: "asc" },
  });
  return c.json({ data: rows.map(serializeTimesheetApproval) });
});

timeRouter.post("/time/approvals", zValidator("json", ApproveTimesheetSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId || !user.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time") || !canAction(c, "time.write")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const body = c.req.valid("json");
  const target = await resolveTargetPersonId(c, user.organizationId, body.personId);
  if ("error" in target) {
    return c.json({ error: { message: target.error, code: "BAD_REQUEST" } }, target.status);
  }
  const periodStart = new Date(body.periodStart);
  const periodEnd = new Date(body.periodEnd);
  if (!Number.isFinite(periodStart.getTime()) || !Number.isFinite(periodEnd.getTime()) || periodEnd <= periodStart) {
    return c.json({ error: { message: "Invalid approval period", code: "BAD_REQUEST" } }, 400);
  }
  const row = await prisma.timesheetApproval.upsert({
    where: {
      organizationId_personId_periodStart_periodEnd: {
        organizationId: user.organizationId,
        personId: target.personId,
        periodStart,
        periodEnd,
      },
    },
    create: {
      organizationId: user.organizationId,
      personId: target.personId,
      periodStart,
      periodEnd,
      status: "approved",
      approvedAt: new Date(),
      approvedByUserId: user.id,
      note: body.note ?? null,
    },
    update: {
      status: "approved",
      approvedAt: new Date(),
      approvedByUserId: user.id,
      reopenedAt: null,
      reopenedByUserId: null,
      note: body.note ?? null,
    },
  });
  return c.json({ data: serializeTimesheetApproval(row) });
});

timeRouter.post("/time/approvals/:id/reopen", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId || !user.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time") || !canAction(c, "time.read_all")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const existing = await prisma.timesheetApproval.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  const row = await prisma.timesheetApproval.update({
    where: { id },
    data: {
      status: "reopened",
      reopenedAt: new Date(),
      reopenedByUserId: user.id,
    },
  });
  return c.json({ data: serializeTimesheetApproval(row) });
});

export default timeRouter;
