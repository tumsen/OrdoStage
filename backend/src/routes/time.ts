import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { excludeMirroredEventInternalBookings } from "../internalBookingMirrorFilter";
import { auth } from "../auth";
import { canAction, canView } from "../requestRole";
import type { EffectiveRole } from "../effectiveRole";
import { isPostgresDatabaseUrl } from "../databaseUrl";
import { getCountryRuleSet, type TravelAllowanceType, type TravelClaimDayLine, type MileageVehicleType } from "../rules/countryRuleSets";
import { isCountryFeatureEnabled } from "../countryFeatures";
import {
  contractMinutesForWeekdayPeriod,
  employmentAwareWeekdayCount,
  employmentStartYmd,
  hoursPerWorkDayFromWeekly,
  minutesToVacationDays,
  overtimeAgainstContract,
  parseEmploymentStartDate,
} from "../rules/leave/danishLeave";
import {
  applyTimeEntryToLeaveLedger,
  getLeaveBalanceSummary,
  removeTimeEntryFromLeaveLedger,
  sumCompTimeEarnedMinutesInRange,
  sumCompTimeUsedMinutesInRange,
} from "../services/leaveLedger";
import {
  reverseCompTimeForTimesheetReopen,
  settleCompTimeForTimesheetApproval,
} from "../services/timesheetCompSettlement";
import {
  backfillLeaveEntryCategories,
  backfillLeaveEntryProjects,
  ensureAllLeaveTimeProjects,
  isLeaveParentCategoryId,
  isLeaveParentCategoryKey,
  isLeaveSystemProjectKey,
  isVacationNoteOnlyCategory,
  leaveCategoryForProjectId,
  normalizeEntryProjectAndTags,
  resolveCanonicalLeaveProject,
  resolveEntryTimeProjectId,
  resolveLeaveTimeProjectId,
} from "../services/leaveTimeProjects";
import {
  backfillMissingTimeProjects,
  categoryRequiresTimeProject,
  countProjectUsages,
  ensureUnassignedHoursProject,
  reassignProjectReferences,
} from "../services/timeProjectAssignment";
import { ensureFullDayTimeSpansBackfilled } from "../services/backfillFullDayTimeSpans";
import {
  ensureDefaultParentCategories,
  isProtectedParentCategoryKey,
  resolveOrgParentCategoryId,
} from "../services/parentCategoryPresets";
import {
  GoogleMapsNotConfiguredError,
  GoogleMapsRouteNotFoundError,
  googleRouteDistanceKm,
} from "../lib/googleMapsDistance";
import {
  CreateTimeTagSchema,
  PatchTimeTagSchema,
  CreateTimeProjectSchema,
  PatchTimeProjectSchema,
  DeleteTimeProjectSchema,
  ReassignTimeProjectEntriesSchema,
  CreateTimeParentCategorySchema,
  PatchTimeParentCategorySchema,
  LinkTimeParentCategoryItemSchema,
  CreateTimeEntrySchema,
  PatchTimeEntrySchema,
  CreateTimeTravelClaimSchema,
  PatchTimeTravelClaimSchema,
  CreateTimeMileageClaimSchema,
  PatchTimeMileageClaimSchema,
  ApproveTimesheetSchema,
  SetPersonContractSchema,
  TIME_CATEGORIES,
  type TimeCategory,
  BulkTimeEntryUpdateSchema,
  BulkMergeTagsSchema,
} from "../types";
import {
  getClientWallClockZone,
  startOfLocalCalendarDayInZone,
  wallClockInstantFromDateIsoAndHHMM,
} from "../clientWallClock";
import { DateTime } from "luxon";
import {
  archiveLegacyEventShowProjects,
  archiveLegacyTourShowProjects,
  ensureEventTimeProject,
  ensureTourTimeProject,
  loadEventProjectIdByEventId,
  loadTourProjectIdByTourId,
  resolveEventTimeProjectId,
  resolveTourTimeProjectId,
} from "../timeProjectSync";

const timeRouter = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    effectiveRole?: EffectiveRole;
  };
}>();

function iso(d: Date) {
  return d.toISOString();
}

/**
 * Ensure every org event and tour has a matching TimeProject row so they appear in
 * pickers without manual link steps. One project per event/tour — not per show/day.
 */
async function syncEventShowTimeProjects(organizationId: string) {
  const events = await prisma.event.findMany({
    where: { organizationId },
    select: { id: true, title: true, timeParentCategoryId: true },
    orderBy: { title: "asc" },
  });

  for (const ev of events) {
    const eventProjectId = await ensureEventTimeProject(organizationId, {
      id: ev.id,
      title: ev.title,
      timeParentCategoryId: ev.timeParentCategoryId,
    });
    await archiveLegacyEventShowProjects(organizationId, ev.id, eventProjectId);
  }

  const tours = await prisma.tour.findMany({
    where: { organizationId },
    select: { id: true, name: true, timeParentCategoryId: true },
    orderBy: { name: "asc" },
  });

  for (const tour of tours) {
    const tourProjectId = await ensureTourTimeProject(organizationId, {
      id: tour.id,
      name: tour.name,
      timeParentCategoryId: tour.timeParentCategoryId,
    });
    await archiveLegacyTourShowProjects(organizationId, tour.id, tourProjectId);
  }
}

async function maybeSyncLeaveLedger(
  organizationId: string,
  entry: {
    id: string;
    organizationId: string;
    personId: string;
    startsAt: Date;
    endsAt: Date;
    category: string;
  },
  userId?: string | null
) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { countryFeatures: true },
  });
  if (!isCountryFeatureEnabled(org?.countryFeatures, "DK", "leaveManagement")) return;
  await applyTimeEntryToLeaveLedger(entry, { createdByUserId: userId });
}

async function maybeRemoveLeaveLedger(timeEntryId: string, organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { countryFeatures: true },
  });
  if (!isCountryFeatureEnabled(org?.countryFeatures, "DK", "leaveManagement")) return;
  await removeTimeEntryFromLeaveLedger(timeEntryId);
}

const toDateTimeFromDateAndTime = wallClockInstantFromDateIsoAndHHMM;

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
  projectIdByTour: Map<string, string>
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
    timeProjectId: projectIdByTour.get(show.tour.id) ?? null,
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
  projectIdByTour: Map<string, string>
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
    timeProjectId: projectIdByTour.get(show.tour.id) ?? null,
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
  projectIdByTour: Map<string, string>
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
        rows.push(buildTourScheduleEventPlanRow(show, ev, projectIdByTour));
      }
    } else {
      rows.push(buildTourPlanJobRow(show, projectIdByTour));
    }
  }
  return rows;
}

async function tourProjectIdMapForShows(
  organizationId: string,
  shows: { tour: { id: string } }[]
): Promise<Map<string, string>> {
  const tourIds = shows.map((s) => s.tour.id);
  let map = await loadTourProjectIdByTourId(organizationId, tourIds);
  const missingTourIds = [...new Set(tourIds)].filter((id) => !map.has(id));
  if (missingTourIds.length > 0) {
    await syncEventShowTimeProjects(organizationId);
    const again = await loadTourProjectIdByTourId(organizationId, missingTourIds);
    for (const [tourId, projectId] of again) map.set(tourId, projectId);
  }
  return map;
}

async function eventProjectIdMapForEvents(
  organizationId: string,
  eventIds: string[]
): Promise<Map<string, string>> {
  let map = await loadEventProjectIdByEventId(organizationId, eventIds);
  const missing = [...new Set(eventIds)].filter((id) => !map.has(id));
  if (missing.length > 0) {
    await syncEventShowTimeProjects(organizationId);
    const again = await loadEventProjectIdByEventId(organizationId, missing);
    for (const [eventId, projectId] of again) map.set(eventId, projectId);
  }
  return map;
}

async function resolveEventTimeProjectForShow(
  organizationId: string,
  eventId: string,
  eventShowId: string
): Promise<string | null> {
  let resolved = await resolveEventTimeProjectId(organizationId, eventId);
  if (!resolved) {
    await syncEventShowTimeProjects(organizationId);
    resolved = await resolveEventTimeProjectId(organizationId, eventId);
  }
  if (!resolved) {
    const legacy = await prisma.timeProject.findFirst({
      where: { organizationId, eventShowId, isArchived: false },
      select: { id: true },
    });
    resolved = legacy?.id ?? null;
  }
  return resolved;
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
  const projectByEventId = await eventProjectIdMapForEvents(
    args.organizationId,
    staff.map((s) => s.show.event.id)
  );
  for (const s of staff) {
    const dayKey = utcDayKeyFromDate(s.show.showDate);
    if (jobDayByShow.has(`${s.show.id}:${dayKey}`)) continue;

    const projId = projectByEventId.get(s.show.event.id) ?? null;

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
      timeProjectId: projId,
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
      booking: {
        organizationId: args.organizationId,
        ...excludeMirroredEventInternalBookings,
      },
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

  const projectIdByTour = await tourProjectIdMapForShows(args.organizationId, shows);
  return expandTourShowsToPlanJobRows(shows, projectIdByTour);
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

  const projectIdByTour = await tourProjectIdMapForShows(args.organizationId, shows);
  return expandTourShowsToPlanJobRows(shows, projectIdByTour);
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
  if (c.req.query("all") === "1") {
    return {
      rangeStart: new Date(0),
      rangeEndExclusive: new Date("2100-01-01T00:00:00.000Z"),
      allTime: true as const,
    };
  }
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (!from || !to) return { error: "from and to (YYYY-MM-DD) are required" as const };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { error: "invalid date" as const };
  }
  /** Bound calendar days in the browser’s wall-clock zone (imported / logged times use the same zone). */
  const zone = getClientWallClockZone();
  const startDt = DateTime.fromISO(`${from}T00:00:00`, { zone });
  const endDay = DateTime.fromISO(`${to}T00:00:00`, { zone });
  if (!startDt.isValid || !endDay.isValid) {
    return { error: "invalid date" as const };
  }
  const rangeStart = startDt.toJSDate();
  const rangeEndExclusive = endDay.plus({ days: 1 }).toJSDate();
  return { rangeStart, rangeEndExclusive, allTime: false as const };
}

type TimeSpan = { startsAt: Date; endsAt: Date };

async function computeNonOverlappingSpans(args: {
  organizationId: string;
  personId: string;
  startsAt: Date;
  endsAt: Date;
  excludeEntryId?: string;
  /** Treat other rows in this group as non-blocking (disjoint segments of one logical entry). */
  excludeSegmentGroupId?: string | null;
}): Promise<TimeSpan[]> {
  const notOr: Array<{ id: string } | { segmentGroupId: string }> = [];
  if (args.excludeEntryId) notOr.push({ id: args.excludeEntryId });
  if (args.excludeSegmentGroupId) notOr.push({ segmentGroupId: args.excludeSegmentGroupId });

  const overlaps = await prisma.timeEntry.findMany({
    where: {
      organizationId: args.organizationId,
      personId: args.personId,
      startsAt: { lt: args.endsAt },
      endsAt: { gt: args.startsAt },
      ...(notOr.length ? { NOT: { OR: notOr } } : {}),
    },
    select: { startsAt: true, endsAt: true },
    orderBy: { startsAt: "asc" },
  });
  // Hard rule: no overlapping registrations per person (touching endpoints OK).
  // Previously we carved free gaps / split entries — that is no longer allowed.
  if (overlaps.length > 0) {
    return [];
  }
  return [{ startsAt: args.startsAt, endsAt: args.endsAt }];
}

function segmentGroupIdAfterSplit(
  spansLength: number,
  existingSegmentGroupId: string | null | undefined
): string | null {
  if (spansLength <= 1) return existingSegmentGroupId ?? null;
  return existingSegmentGroupId ?? randomUUID();
}

async function propagateTimeEntrySegmentMetadata(args: {
  organizationId: string;
  personId: string;
  segmentGroupId: string;
  excludeEntryId: string;
  category: string;
  timeProjectId: string | null;
  note: string | null;
  isLocked: boolean;
  eventId: string | null;
  tagIds: string[];
}) {
  const siblings = await prisma.timeEntry.findMany({
    where: {
      organizationId: args.organizationId,
      personId: args.personId,
      segmentGroupId: args.segmentGroupId,
      id: { not: args.excludeEntryId },
    },
    select: { id: true, isLocked: true },
  });
  const tagCreates = args.tagIds.map((timeTagId) => ({ timeTagId }));
  const updates = siblings
    .filter((s) => !s.isLocked)
    .map((s) =>
      prisma.timeEntry.update({
        where: { id: s.id },
        data: {
          category: args.category,
          timeProjectId: args.timeProjectId,
          note: args.note,
          isLocked: args.isLocked,
          eventId: args.eventId,
          tagLinks:
            tagCreates.length > 0
              ? { deleteMany: {}, createMany: { data: tagCreates } }
              : { deleteMany: {} },
        },
      })
    );
  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
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

function serializeParentCategory(row: {
  id: string;
  organizationId: string;
  name: string;
  color: string | null;
  systemKey?: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...row,
    systemKey: row.systemKey ?? null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function serializeProject(row: {
  id: string;
  organizationId: string;
  name: string;
  color: string | null;
  fillPattern: string | null;
  eventId: string | null;
  eventShowId: string | null;
  tourId: string | null;
  tourShowId: string | null;
  timeParentCategoryId: string | null;
  systemKey: string | null;
  isArchived: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...row,
    fillPattern: row.fillPattern ?? null,
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
  tourScheduleEventId: string | null;
  eventShowStaffingId: string | null;
  internalBookingPersonId: string | null;
  internalBookingDayKey: string | null;
  timeProjectId: string | null;
  note: string | null;
  isLocked: boolean;
  segmentGroupId: string | null;
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
    tourScheduleEventId: row.tourScheduleEventId,
    eventShowStaffingId: row.eventShowStaffingId,
    internalBookingPersonId: row.internalBookingPersonId,
    internalBookingDayKey: row.internalBookingDayKey,
    timeProjectId: row.timeProjectId,
    note: row.note,
    isLocked: row.isLocked,
    segmentGroupId: row.segmentGroupId,
    tagIds: row.tagLinks.map((t) => t.timeTagId),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function travelClaimDestinationFromDayLines(dayLines: TravelClaimDayLine[] | undefined): string {
  if (!dayLines?.length) return "Travel";
  const cities = [
    ...new Set(
      dayLines
        .map((line) => line.city?.trim() || "")
        .filter(Boolean)
    ),
  ];
  if (cities.length === 1) return cities[0]!;
  if (cities.length > 1) return cities.join(" · ");
  const labels = [
    ...new Set(
      dayLines
        .map((line) => line.lodgingLabel?.trim() || line.hotel?.trim() || "")
        .filter(Boolean)
    ),
  ];
  if (labels.length === 1) return labels[0]!;
  if (labels.length > 1) return labels.join(" · ");
  return "Travel";
}

function normalizeTravelDayLines(value: unknown): TravelClaimDayLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((line): line is Record<string, unknown> => Boolean(line) && typeof line === "object")
    .map((line) => ({
      date: typeof line.date === "string" ? line.date : "",
      city: typeof line.city === "string" ? line.city : "",
      hotel: typeof line.hotel === "string" ? line.hotel : "",
      lodgingPlaceId: typeof line.lodgingPlaceId === "string" ? line.lodgingPlaceId : "",
      lodgingLabel: typeof line.lodgingLabel === "string" ? line.lodgingLabel : "",
      breakfastProvided: line.breakfastProvided === true,
      lunchProvided: line.lunchProvided === true,
      dinnerProvided: line.dinnerProvided === true,
      lodgingCovered: line.lodgingCovered === true,
      lodgingByReceipt: line.lodgingByReceipt === true,
      timeProjectId:
        typeof line.timeProjectId === "string" && line.timeProjectId.length > 0 ? line.timeProjectId : null,
    }))
    .filter((line) => line.date.length > 0);
}

async function travelAllowanceFeatureEnabled(organizationId: string, country: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { countryFeatures: true },
  });
  return isCountryFeatureEnabled(org?.countryFeatures, country, "travelAllowance");
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

async function mileageAllowanceFeatureEnabled(organizationId: string, country: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { countryFeatures: true },
  });
  return isCountryFeatureEnabled(org?.countryFeatures, country, "mileageAllowance");
}

async function carKmYtdForPerson(params: {
  organizationId: string;
  personId: string;
  rateYear: number;
  excludeClaimId?: string;
}): Promise<number> {
  const yearStart = new Date(params.rateYear, 0, 1);
  const yearEnd = new Date(params.rateYear + 1, 0, 1);
  const rows = await prisma.timeMileageClaim.findMany({
    where: {
      organizationId: params.organizationId,
      personId: params.personId,
      vehicleType: "car",
      tripDate: { gte: yearStart, lt: yearEnd },
      ...(params.excludeClaimId ? { id: { not: params.excludeClaimId } } : {}),
    },
    select: { distanceKm: true },
  });
  return rows.reduce((sum, row) => sum + row.distanceKm, 0);
}

async function calculateMileageClaimAmounts(params: {
  organizationId: string;
  personId: string;
  excludeClaimId?: string;
  vehicleType: MileageVehicleType;
  distanceKm: number;
  tripDate: Date;
  rateYear?: number;
  salaryReductionAgreement?: boolean;
  receivesBIncome?: boolean;
  country?: string;
}) {
  const country = (params.country ?? "DK").trim().toUpperCase();
  const ruleSet = getCountryRuleSet(country);
  if (!ruleSet) {
    throw new Error("UNSUPPORTED_RULE_SET");
  }
  const rateYear = params.rateYear ?? params.tripDate.getFullYear();
  const carKmYtdBeforeTrip =
    params.vehicleType === "car"
      ? await carKmYtdForPerson({
          organizationId: params.organizationId,
          personId: params.personId,
          rateYear,
          excludeClaimId: params.excludeClaimId,
        })
      : 0;
  return ruleSet.mileage.calculateAllowance({
    vehicleType: params.vehicleType,
    distanceKm: params.distanceKm,
    rateYear,
    carKmYtdBeforeTrip,
    salaryReductionAgreement: params.salaryReductionAgreement,
    receivesBIncome: params.receivesBIncome,
  });
}

function serializeMileageClaim(row: {
  id: string;
  organizationId: string;
  personId: string;
  createdByUserId: string | null;
  tripDate: Date;
  fromPlace: string;
  toPlace: string;
  purpose: string;
  country: string;
  vehicleType: string;
  distanceKm: number;
  rateYear: number;
  rateCentsPerKmHigh: number;
  rateCentsPerKmLow: number;
  bicycleRateCentsPerKm: number;
  highRateKm: number;
  lowRateKm: number;
  salaryReductionAgreement: boolean;
  receivesBIncome: boolean;
  timeProjectId: string | null;
  eventId: string | null;
  notes: string | null;
  totalAmountCents: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    personId: row.personId,
    createdByUserId: row.createdByUserId,
    tripDate: iso(row.tripDate),
    fromPlace: row.fromPlace,
    toPlace: row.toPlace,
    purpose: row.purpose,
    country: row.country,
    vehicleType: row.vehicleType as MileageVehicleType,
    distanceKm: row.distanceKm,
    rateYear: row.rateYear,
    rateCentsPerKmHigh: row.rateCentsPerKmHigh,
    rateCentsPerKmLow: row.rateCentsPerKmLow,
    bicycleRateCentsPerKm: row.bicycleRateCentsPerKm,
    highRateKm: row.highRateKm,
    lowRateKm: row.lowRateKm,
    salaryReductionAgreement: row.salaryReductionAgreement,
    receivesBIncome: row.receivesBIncome,
    timeProjectId: row.timeProjectId,
    eventId: row.eventId,
    notes: row.notes,
    totalAmountCents: row.totalAmountCents,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function serializeTimesheetApproval(
  row: {
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
  },
  compSettlement?: {
    applied: boolean;
    dailyNormMinutes: number;
    totalDeltaMinutes: number;
    days: Array<{
      date: string;
      fulfillingMinutes: number;
      dailyNormMinutes: number;
      deltaMinutes: number;
    }>;
  }
) {
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
    ...(compSettlement ? { compSettlement } : {}),
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
    select: {
      id: true,
      name: true,
      email: true,
      weeklyContractHours: true,
      vacationDaysPerYear: true,
      employmentStartDate: true,
    },
    orderBy: { name: "asc" },
  });
  return c.json({
    data: people.map((p) => ({
      ...p,
      employmentStartDate: employmentStartYmd(p.employmentStartDate),
    })),
  });
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
        ...(body.employmentStartDate !== undefined
          ? { employmentStartDate: parseEmploymentStartDate(body.employmentStartDate) }
          : {}),
      },
    });
    return c.json({ data: { ok: true } });
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
  const { rangeStart, rangeEndExclusive, allTime } = r;

  const qPersonIds = c.req.query("personIds");
  const qProjectIds = c.req.query("projectIds");
  const qParentCategoryIds = c.req.query("parentCategoryIds");
  const qTagIds = c.req.query("tagIds");
  const qCategories = c.req.query("categories");

  const personIdFilter = qPersonIds ? qPersonIds.split(",").filter(Boolean) : [];
  const projectIdFilter = qProjectIds ? qProjectIds.split(",").filter(Boolean) : [];
  const parentCategoryIdFilter = qParentCategoryIds
    ? qParentCategoryIds.split(",").filter(Boolean)
    : [];
  const tagIdFilter = qTagIds ? qTagIds.split(",").filter(Boolean) : [];
  const categoryFilter = qCategories
    ? qCategories.split(",").filter((x) => TIME_CATEGORIES.includes(x as never))
    : [];

  /** Every filter is an AND clause so a single filter alone still returns matching rows. */
  const andClauses: Record<string, unknown>[] = [{ organizationId: user.organizationId }];
  if (!allTime) {
    andClauses.push({ startsAt: { lt: rangeEndExclusive } });
    andClauses.push({ endsAt: { gt: rangeStart } });
  }
  if (personIdFilter.length) andClauses.push({ personId: { in: personIdFilter } });
  if (categoryFilter.length) andClauses.push({ category: { in: categoryFilter } });
  if (projectIdFilter.length) {
    const pf: Record<string, unknown>[] = projectIdFilter
      .filter((id) => id !== "__none__")
      .map((id) => ({ timeProjectId: id }));
    if (projectIdFilter.includes("__none__")) pf.push({ timeProjectId: null });
    if (pf.length) andClauses.push({ OR: pf });
  }
  if (parentCategoryIdFilter.length) {
    const pcFilter: Record<string, unknown>[] = parentCategoryIdFilter
      .filter((id) => id !== "__none__")
      .map((id) => ({
        timeProject: { timeParentCategoryId: id },
      }));
    if (parentCategoryIdFilter.includes("__none__")) {
      pcFilter.push({
        OR: [{ timeProjectId: null }, { timeProject: { timeParentCategoryId: null } }],
      });
    }
    if (pcFilter.length) andClauses.push({ OR: pcFilter });
  }
  if (tagIdFilter.length) {
    andClauses.push({ tagLinks: { some: { timeTagId: { in: tagIdFilter } } } });
  }

  const rows = await prisma.timeEntry.findMany({
    where: { AND: andClauses },
    include: {
      person: {
        select: {
          id: true,
          name: true,
          weeklyContractHours: true,
          vacationDaysPerYear: true,
          employmentStartDate: true,
        },
      },
      timeProject: {
        select: { id: true, name: true, timeParentCategoryId: true },
      },
      tagLinks: { include: { timeTag: { select: { id: true, name: true } } } },
    },
    orderBy: { startsAt: "asc" },
  });

  let rangeDays = Math.max(
    1,
    Math.round((rangeEndExclusive.getTime() - rangeStart.getTime()) / 86_400_000)
  );
  if (allTime && rows.length > 0) {
    const minStart = Math.min(...rows.map((row) => row.startsAt.getTime()));
    const maxEnd = Math.max(...rows.map((row) => row.endsAt.getTime()));
    rangeDays = Math.max(1, Math.round((maxEnd - minStart) / 86_400_000) + 1);
  } else if (allTime) {
    rangeDays = 0;
  }

  const parentCategoryNameById = new Map(
    (
      await prisma.timeParentCategory.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true, name: true },
      })
    ).map((cat) => [cat.id, cat.name] as const)
  );

  type PersonAgg = {
    personName: string;
    workMinutes: number;
    vacationMinutes: number;
    extraVacationMinutes: number;
    compTimeMinutes: number;
    sickMinutes: number;
    holidayMinutes: number;
    travelAllowanceMinutes: number;
    weeklyContractHours: number | null;
    vacationDaysPerYear: number | null;
    employmentStartYmd: string | null;
  };
  type ProjectAgg = { projectName: string; workMinutes: number; totalMinutes: number };
  type ParentCategoryAgg = {
    parentCategoryName: string;
    workMinutes: number;
    totalMinutes: number;
  };
  type DayAgg = {
    workMinutes: number;
    vacationMinutes: number;
    extraVacationMinutes: number;
    compTimeMinutes: number;
    sickMinutes: number;
    holidayMinutes: number;
    travelAllowanceMinutes: number;
  };

  const byPerson = new Map<string, PersonAgg>();
  const byProject = new Map<string | null, ProjectAgg>();
  const byParentCategory = new Map<string | null, ParentCategoryAgg>();
  const byDay = new Map<string, DayAgg>();
  const clientZone = getClientWallClockZone();
  const rangeStartMs = allTime ? Number.NEGATIVE_INFINITY : rangeStart.getTime();
  const rangeEndMs = allTime ? Number.POSITIVE_INFINITY : rangeEndExclusive.getTime();

  for (const row of rows) {
    const hireYmd = employmentStartYmd(row.person.employmentStartDate);
    const hireStartMs = hireYmd
      ? DateTime.fromFormat(hireYmd, "yyyy-MM-dd", { zone: clientZone }).startOf("day").toMillis()
      : Number.NEGATIVE_INFINITY;
    const clippedStart = Math.max(row.startsAt.getTime(), rangeStartMs, hireStartMs);
    const clippedEnd = Math.min(row.endsAt.getTime(), rangeEndMs);
    const durMin = Math.max(0, (clippedEnd - clippedStart) / 60_000);
    if (durMin <= 0) continue;
    const cat = (row.category || "work") as string;
    const dateKey = DateTime.fromMillis(clippedStart, { zone: clientZone }).toFormat("yyyy-MM-dd");

    // byPerson
    if (!byPerson.has(row.personId)) {
      byPerson.set(row.personId, {
        personName: row.person.name,
        workMinutes: 0,
        vacationMinutes: 0,
        extraVacationMinutes: 0,
        compTimeMinutes: 0,
        sickMinutes: 0,
        holidayMinutes: 0,
        travelAllowanceMinutes: 0,
        weeklyContractHours: row.person.weeklyContractHours ?? null,
        vacationDaysPerYear: row.person.vacationDaysPerYear ?? null,
        employmentStartYmd: hireYmd,
      });
    }
    const pa = byPerson.get(row.personId)!;
    if (cat === "work") pa.workMinutes += durMin;
    else if (cat === "vacation") pa.vacationMinutes += durMin;
    else if (cat === "extra_vacation") pa.extraVacationMinutes += durMin;
    else if (cat === "comp_time") pa.compTimeMinutes += durMin;
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
    if (cat !== "comp_time") {
      pp.totalMinutes += durMin;
      if (cat === "work") pp.workMinutes += durMin;
    }

    // byParentCategory
    const parentCatKey = row.timeProject?.timeParentCategoryId ?? null;
    if (!byParentCategory.has(parentCatKey)) {
      byParentCategory.set(parentCatKey, {
        parentCategoryName: parentCatKey
          ? (parentCategoryNameById.get(parentCatKey) ?? "Ukendt")
          : "Ingen overkategori",
        workMinutes: 0,
        totalMinutes: 0,
      });
    }
    const pca = byParentCategory.get(parentCatKey)!;
    if (cat !== "comp_time") {
      pca.totalMinutes += durMin;
      if (cat === "work") pca.workMinutes += durMin;
    }

    // byDay
    if (!byDay.has(dateKey)) {
      byDay.set(dateKey, {
        workMinutes: 0,
        vacationMinutes: 0,
        extraVacationMinutes: 0,
        compTimeMinutes: 0,
        sickMinutes: 0,
        holidayMinutes: 0,
        travelAllowanceMinutes: 0,
      });
    }
    const dp = byDay.get(dateKey)!;
    if (cat === "work") dp.workMinutes += durMin;
    else if (cat === "vacation") dp.vacationMinutes += durMin;
    else if (cat === "extra_vacation") dp.extraVacationMinutes += durMin;
    else if (cat === "comp_time") dp.compTimeMinutes += durMin;
    else if (cat === "sick") dp.sickMinutes += durMin;
    else if (cat === "holiday") dp.holidayMinutes += durMin;
    else if (cat === "travel_allowance") dp.travelAllowanceMinutes += durMin;
  }

  const leaveManagementEnabled = await isCountryFeatureEnabled(
    (
      await prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: { countryFeatures: true },
      })
    )?.countryFeatures,
    "DK",
    "leaveManagement"
  );
  const leaveEnabled = !allTime && leaveManagementEnabled;

  const personIdsForLeave = [...byPerson.keys()];
  const compEarnedByPerson = leaveEnabled
    ? await sumCompTimeEarnedMinutesInRange(
        user.organizationId!,
        personIdsForLeave,
        rangeStart,
        rangeEndExclusive
      )
    : new Map<string, number>();
  const compUsedByPerson = leaveEnabled
    ? await sumCompTimeUsedMinutesInRange(
        user.organizationId!,
        personIdsForLeave,
        rangeStart,
        rangeEndExclusive
      )
    : new Map<string, number>();

  const reportPeriodFromYmd = allTime
    ? DateTime.fromMillis(
        rows.length
          ? Math.min(...rows.map((row) => row.startsAt.getTime()))
          : Date.now(),
        { zone: clientZone }
      ).toFormat("yyyy-MM-dd")
    : DateTime.fromJSDate(rangeStart, { zone: clientZone }).toFormat("yyyy-MM-dd");
  const reportPeriodToYmd = allTime
    ? DateTime.fromMillis(
        rows.length
          ? Math.max(...rows.map((row) => row.endsAt.getTime()))
          : Date.now(),
        { zone: clientZone }
      ).toFormat("yyyy-MM-dd")
    : DateTime.fromMillis(rangeEndExclusive.getTime() - 1, { zone: clientZone }).toFormat(
        "yyyy-MM-dd"
      );

  const byPersonArr = await Promise.all(
    [...byPerson.entries()].map(async ([personId, pa]) => {
    // Visual N/A (`comp_time`) blocks are excluded from hour totals / OT base.
    const total =
      pa.workMinutes +
      pa.vacationMinutes +
      pa.extraVacationMinutes +
      pa.sickMinutes +
      pa.holidayMinutes +
      pa.travelAllowanceMinutes;
    const personWeekdays = employmentAwareWeekdayCount(
      reportPeriodFromYmd,
      reportPeriodToYmd,
      pa.employmentStartYmd,
      clientZone
    );
    const contractMinutes = contractMinutesForWeekdayPeriod(
      pa.weeklyContractHours,
      reportPeriodFromYmd,
      reportPeriodToYmd,
      pa.employmentStartYmd,
      clientZone
    );
    // Leave days: integer work-day minutes (37h → 444 min = 7:24), not float hours÷7.4
    const hoursPerDay = hoursPerWorkDayFromWeekly(pa.weeklyContractHours);
    const vacationDaysUsed = minutesToVacationDays(pa.vacationMinutes, hoursPerDay);
    const vacationDaysRemaining =
      pa.vacationDaysPerYear != null
        ? Math.round((pa.vacationDaysPerYear - vacationDaysUsed) * 10) / 10
        : null;
    const extraVacationDaysUsed = minutesToVacationDays(pa.extraVacationMinutes, hoursPerDay);
    const leave = leaveEnabled
      ? await getLeaveBalanceSummary(
          user.organizationId!,
          personId,
          new Date(rangeEndExclusive.getTime() - 1)
        )
      : undefined;
    const extraVacationDaysRemaining = leave
      ? Math.round(leave.extraVacationRemainingDays * 10) / 10
      : null;
    const earnedInPeriod = leaveEnabled ? Math.round(compEarnedByPerson.get(personId) ?? 0) : null;
    const usedInPeriod = leaveEnabled
      ? Math.round(compUsedByPerson.get(personId) ?? 0)
      : null;
    const periodDelta =
      earnedInPeriod != null && usedInPeriod != null ? earnedInPeriod - usedInPeriod : null;
    return {
      personId,
      personName: pa.personName,
      totalMinutes: total,
      workMinutes: pa.workMinutes,
      vacationMinutes: pa.vacationMinutes,
      extraVacationMinutes: pa.extraVacationMinutes,
      compTimeMinutes: pa.compTimeMinutes,
      sickMinutes: pa.sickMinutes,
      holidayMinutes: pa.holidayMinutes,
      travelAllowanceMinutes: pa.travelAllowanceMinutes,
      weeklyContractHours: pa.weeklyContractHours,
      contractWeekdays: pa.weeklyContractHours != null ? personWeekdays : null,
      /** @deprecated use contractWeekdays — kept for older clients */
      contractRangeDays: pa.weeklyContractHours != null ? personWeekdays : null,
      employmentStartDate: pa.employmentStartYmd,
      contractMinutes,
      overtimeMinutes: overtimeAgainstContract(
        {
          workMinutes: pa.workMinutes,
          vacationMinutes: pa.vacationMinutes,
          extraVacationMinutes: pa.extraVacationMinutes,
          holidayMinutes: pa.holidayMinutes,
        },
        contractMinutes,
        { includeLeaveInNorm: leaveManagementEnabled }
      ),
      vacationDaysPerYear: pa.vacationDaysPerYear,
      vacationDaysUsed: pa.vacationDaysPerYear != null || pa.vacationMinutes > 0 ? vacationDaysUsed : null,
      vacationDaysRemaining,
      extraVacationDaysUsed:
        pa.extraVacationMinutes > 0 || leave ? extraVacationDaysUsed : null,
      extraVacationDaysRemaining,
      compTimeBalanceMinutes: leave ? Math.round(leave.compTimeRemainingMinutes) : null,
      compTimePeriodDeltaMinutes: periodDelta,
      compTimeEarnedMinutes: earnedInPeriod,
      leave,
    };
  })
  );

  const byProjectArr = [...byProject.entries()].map(([projectId, pp]) => ({
    projectId,
    projectName: pp.projectName,
    totalMinutes: pp.totalMinutes,
    workMinutes: pp.workMinutes,
  })).sort((a, b) => b.totalMinutes - a.totalMinutes);

  const byParentCategoryArr = [...byParentCategory.entries()]
    .map(([parentCategoryId, pc]) => ({
      parentCategoryId,
      parentCategoryName: pc.parentCategoryName,
      totalMinutes: pc.totalMinutes,
      workMinutes: pc.workMinutes,
    }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes);

  const byDayArr = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dp]) => ({
      date,
      totalMinutes:
        dp.workMinutes +
        dp.vacationMinutes +
        dp.extraVacationMinutes +
        dp.sickMinutes +
        dp.holidayMinutes +
        dp.travelAllowanceMinutes,
      workMinutes: dp.workMinutes,
      vacationMinutes: dp.vacationMinutes,
      extraVacationMinutes: dp.extraVacationMinutes,
      compTimeMinutes: dp.compTimeMinutes,
      sickMinutes: dp.sickMinutes,
      holidayMinutes: dp.holidayMinutes,
      travelAllowanceMinutes: dp.travelAllowanceMinutes,
    }));

  const summaryWork = byPersonArr.reduce((s, p) => s + p.workMinutes, 0);
  const summaryVac = byPersonArr.reduce((s, p) => s + p.vacationMinutes, 0);
  const summaryExtraVac = byPersonArr.reduce((s, p) => s + p.extraVacationMinutes, 0);
  const summaryComp = byPersonArr.reduce((s, p) => s + p.compTimeMinutes, 0);
  const summarySick = byPersonArr.reduce((s, p) => s + p.sickMinutes, 0);
  const summaryHoliday = byPersonArr.reduce((s, p) => s + p.holidayMinutes, 0);
  const summaryTravelAllowance = byPersonArr.reduce((s, p) => s + p.travelAllowanceMinutes, 0);

  const entries = rows.map((row) => {
    const clippedStart = Math.max(row.startsAt.getTime(), rangeStartMs);
    const clippedEnd = Math.min(row.endsAt.getTime(), rangeEndMs);
    const durationMinutes = Math.max(0, Math.round((clippedEnd - clippedStart) / 60_000));
    return {
      id: row.id,
      personId: row.personId,
      personName: row.person.name,
      startsAt: iso(row.startsAt),
      endsAt: iso(row.endsAt),
      durationMinutes,
      kind: row.kind,
      category: (row.category || "work") as TimeCategory,
      note: row.note,
      projectId: row.timeProjectId,
      projectName: row.timeProject?.name ?? null,
      tagIds: row.tagLinks.map((t) => t.timeTagId),
      tagNames: row.tagLinks.map((t) => t.timeTag.name),
    };
  }).filter((e) => e.durationMinutes > 0);

  return c.json({
    data: {
      summary: {
        totalMinutes:
          summaryWork +
          summaryVac +
          summaryExtraVac +
          summarySick +
          summaryHoliday +
          summaryTravelAllowance,
        workMinutes: summaryWork,
        vacationMinutes: summaryVac,
        extraVacationMinutes: summaryExtraVac,
        compTimeMinutes: summaryComp,
        sickMinutes: summarySick,
        holidayMinutes: summaryHoliday,
        travelAllowanceMinutes: summaryTravelAllowance,
        entryCount: entries.length,
        rangeDays,
      },
      byPerson: byPersonArr,
      byProject: byProjectArr,
      byParentCategory: byParentCategoryArr,
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

timeRouter.post("/time/bulk-update", zValidator("json", BulkTimeEntryUpdateSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId || !user.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "time.manage_catalog")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const body = c.req.valid("json");

  const where: any = { organizationId: user.organizationId, isLocked: false };
  if (body.filter.personId) where.personId = body.filter.personId;
  if (body.filter.projectId !== undefined) where.timeProjectId = body.filter.projectId;
  if (body.filter.from || body.filter.to) {
    where.startsAt = {
      ...(body.filter.from ? { gte: new Date(`${body.filter.from}T00:00:00.000Z`) } : {}),
      ...(body.filter.to ? { lte: new Date(`${body.filter.to}T23:59:59.999Z`) } : {}),
    };
  }
  if (body.filter.tagId) {
    where.tagLinks = { some: { timeTagId: body.filter.tagId } };
  }

  const data: any = {};
  if (body.action.setProjectId !== undefined) {
    data.timeProjectId = body.action.setProjectId;
    if (!body.action.setCategory && body.action.setProjectId) {
      const leaveCat = await leaveCategoryForProjectId(
        user.organizationId,
        body.action.setProjectId
      );
      if (leaveCat) data.category = leaveCat;
    }
  }
  if (body.action.setCategory) {
    data.category = body.action.setCategory;
    if (isVacationNoteOnlyCategory(body.action.setCategory)) {
      data.timeProjectId = null;
    } else if (
      body.action.setCategory !== "work" &&
      body.action.setCategory !== "travel_allowance"
    ) {
      const leaveProjectId = await resolveLeaveTimeProjectId(
        user.organizationId,
        body.action.setCategory
      );
      if (leaveProjectId) data.timeProjectId = leaveProjectId;
    }
  }

  // Update the entries themselves
  const updated = Object.keys(data).length ? await prisma.timeEntry.updateMany({ where, data }) : { count: 0 };

  if (data.category === "vacation" || body.action.setCategory === "vacation") {
    const vacationIds = await prisma.timeEntry.findMany({
      where,
      select: { id: true },
      take: 5000,
    });
    if (vacationIds.length > 0) {
      await prisma.timeEntryTag.deleteMany({
        where: { timeEntryId: { in: vacationIds.map((r) => r.id) } },
      });
    }
  }

  if (data.category) {
    const toSync = await prisma.timeEntry.findMany({
      where,
      select: {
        id: true,
        organizationId: true,
        personId: true,
        startsAt: true,
        endsAt: true,
        category: true,
      },
      take: 5000,
    });
    for (const entry of toSync) {
      await maybeSyncLeaveLedger(user.organizationId, entry, user.id);
    }
  }

  // Tag operations across matches
  if (body.action.addTagId || body.action.removeTagId) {
    const ids = await prisma.timeEntry.findMany({
      where,
      select: { id: true },
      take: 5000,
    });
    const entryIds = ids.map((r) => r.id);
    if (entryIds.length === 0) return c.json({ data: { updatedCount: updated.count } });

    if (body.action.removeTagId) {
      await prisma.timeEntryTag.deleteMany({
        where: { timeEntryId: { in: entryIds }, timeTagId: body.action.removeTagId },
      });
    }
    if (body.action.addTagId) {
      // createMany with skipDuplicates avoids unique constraint errors
      await prisma.timeEntryTag.createMany({
        data: entryIds.map((timeEntryId) => ({ timeEntryId, timeTagId: body.action.addTagId! })),
        skipDuplicates: true,
      });
    }
  }

  return c.json({ data: { updatedCount: updated.count } });
});

timeRouter.post("/time/tags/merge", zValidator("json", BulkMergeTagsSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId || !user.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "time.manage_catalog")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const body = c.req.valid("json");
  if (body.fromTagId === body.toTagId) {
    return c.json({ error: { message: "fromTagId and toTagId must differ", code: "BAD_REQUEST" } }, 400);
  }

  const [fromTag, toTag] = await Promise.all([
    prisma.timeTag.findFirst({ where: { id: body.fromTagId, organizationId: user.organizationId }, select: { id: true } }),
    prisma.timeTag.findFirst({ where: { id: body.toTagId, organizationId: user.organizationId }, select: { id: true } }),
  ]);
  if (!fromTag || !toTag) {
    return c.json({ error: { message: "Tag not found", code: "NOT_FOUND" } }, 404);
  }

  const affected = await prisma.timeEntryTag.findMany({
    where: { timeTagId: body.fromTagId, timeEntry: { organizationId: user.organizationId } },
    select: { timeEntryId: true },
  });
  const entryIds = [...new Set(affected.map((a) => a.timeEntryId))];

  if (entryIds.length) {
    await prisma.timeEntryTag.createMany({
      data: entryIds.map((timeEntryId) => ({ timeEntryId, timeTagId: body.toTagId })),
      skipDuplicates: true,
    });
  }
  const removed = await prisma.timeEntryTag.deleteMany({
    where: { timeTagId: body.fromTagId, timeEntryId: { in: entryIds } },
  });

  if (body.deleteFromTag) {
    await prisma.timeTag.delete({ where: { id: body.fromTagId } });
  }

  return c.json({ data: { mergedEntryCount: entryIds.length, removedLinks: removed.count } });
});

timeRouter.get("/time/parent-category-catalog", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "time.manage_catalog")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  await ensureDefaultParentCategories(user.organizationId);
  await ensureAllLeaveTimeProjects(user.organizationId);
  await syncEventShowTimeProjects(user.organizationId);
  await backfillLeaveEntryProjects(user.organizationId);
  const leaveCategoryFixed = await backfillLeaveEntryCategories(user.organizationId);
  await backfillMissingTimeProjects(user.organizationId);
  await ensureFullDayTimeSpansBackfilled(user.organizationId);
  if (leaveCategoryFixed.length > 0) {
    const toSync = await prisma.timeEntry.findMany({
      where: { id: { in: leaveCategoryFixed } },
      select: {
        id: true,
        organizationId: true,
        personId: true,
        startsAt: true,
        endsAt: true,
        category: true,
      },
    });
    for (const entry of toSync) {
      await maybeSyncLeaveLedger(user.organizationId, entry, user.id ?? null);
    }
  }
  const [categories, events, tours, standaloneProjects, allProjects] = await Promise.all([
    prisma.timeParentCategory.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.event.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, title: true, timeParentCategoryId: true },
      orderBy: { title: "asc" },
    }),
    prisma.tour.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true, timeParentCategoryId: true },
      orderBy: { name: "asc" },
    }),
    prisma.timeProject.findMany({
      where: {
        organizationId: user.organizationId,
        isArchived: false,
        eventId: null,
        tourId: null,
        OR: [{ systemKey: null }, { systemKey: { not: { startsWith: "leave_" } } }],
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.timeProject.findMany({
      where: {
        organizationId: user.organizationId,
        isArchived: false,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const projectIds = allProjects.map((p) => p.id);
  const entryRows =
    projectIds.length === 0
      ? []
      : await prisma.timeEntry.findMany({
          where: {
            organizationId: user.organizationId,
            timeProjectId: { in: projectIds },
            category: { notIn: ["comp_settlement_earned", "comp_settlement_used"] },
          },
          select: { timeProjectId: true, startsAt: true, endsAt: true },
        });
  const stats = new Map<string, { entryCount: number; totalMinutes: number }>();
  for (const row of entryRows) {
    if (!row.timeProjectId) continue;
    const mins = Math.max(0, (row.endsAt.getTime() - row.startsAt.getTime()) / 60_000);
    const cur = stats.get(row.timeProjectId) ?? { entryCount: 0, totalMinutes: 0 };
    cur.entryCount += 1;
    cur.totalMinutes += mins;
    stats.set(row.timeProjectId, cur);
  }

  return c.json({
    data: {
      categories: categories.map(serializeParentCategory),
      events,
      tours,
      standaloneProjects: standaloneProjects.map(serializeProject),
      projects: allProjects.map((p) => {
        const s = stats.get(p.id) ?? { entryCount: 0, totalMinutes: 0 };
        return {
          ...serializeProject(p),
          entryCount: s.entryCount,
          totalMinutes: Math.round(s.totalMinutes),
        };
      }),
    },
  });
});

timeRouter.get("/time/parent-categories", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  await ensureDefaultParentCategories(user.organizationId);
  const rows = await prisma.timeParentCategory.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return c.json({ data: rows.map(serializeParentCategory) });
});

timeRouter.post("/time/parent-categories", zValidator("json", CreateTimeParentCategorySchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "time.manage_catalog")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const body = c.req.valid("json");
  const row = await prisma.timeParentCategory.create({
    data: {
      organizationId: user.organizationId,
      name: body.name.trim(),
      sortOrder: body.sortOrder ?? 0,
      color: body.color ?? null,
    },
  });
  return c.json({ data: serializeParentCategory(row) });
});

timeRouter.patch("/time/parent-categories/:id", zValidator("json", PatchTimeParentCategorySchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "time.manage_catalog")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const existing = await prisma.timeParentCategory.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  if (isLeaveParentCategoryKey(existing.systemKey)) {
    return c.json(
      { error: { message: "Fravær-overkategorien kan ikke omdøbes.", code: "FORBIDDEN" } },
      403
    );
  }
  const row = await prisma.timeParentCategory.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
    },
  });
  return c.json({ data: serializeParentCategory(row) });
});

timeRouter.delete("/time/parent-categories/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "time.manage_catalog")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const existing = await prisma.timeParentCategory.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  if (isProtectedParentCategoryKey(existing.systemKey)) {
    return c.json(
      { error: { message: "Systemkategorier kan ikke slettes", code: "FORBIDDEN" } },
      403
    );
  }
  await prisma.$transaction([
    prisma.event.updateMany({
      where: { organizationId: user.organizationId, timeParentCategoryId: id },
      data: { timeParentCategoryId: null },
    }),
    prisma.tour.updateMany({
      where: { organizationId: user.organizationId, timeParentCategoryId: id },
      data: { timeParentCategoryId: null },
    }),
    prisma.timeProject.updateMany({
      where: { organizationId: user.organizationId, timeParentCategoryId: id },
      data: { timeParentCategoryId: null },
    }),
    prisma.timeParentCategory.delete({ where: { id } }),
  ]);
  return c.json({ ok: true });
});

timeRouter.patch("/time/parent-category-link", zValidator("json", LinkTimeParentCategoryItemSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "time.manage_catalog")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const body = c.req.valid("json");
  const parentResolved = await resolveOrgParentCategoryId(
    user.organizationId,
    body.timeParentCategoryId
  );
  if (!parentResolved.ok) {
    return c.json({ error: { message: "Parent category not found", code: "NOT_FOUND" } }, 404);
  }
  const parentId = parentResolved.value ?? null;

  if (parentId && (await isLeaveParentCategoryId(user.organizationId, parentId))) {
    return c.json(
      {
        error: {
          message:
            "Fravær indeholder kun systemprojekter. Flyt ikke almindelige projekter, events eller ture hertil.",
          code: "FORBIDDEN",
        },
      },
      403
    );
  }

  if (body.type === "event") {
    const ev = await prisma.event.findFirst({
      where: { id: body.id, organizationId: user.organizationId },
      select: { id: true, title: true, timeParentCategoryId: true },
    });
    if (!ev) return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
    await prisma.event.update({
      where: { id: ev.id },
      data: { timeParentCategoryId: parentId },
    });
    await ensureEventTimeProject(user.organizationId, {
      id: ev.id,
      title: ev.title,
      timeParentCategoryId: parentId,
    });
    return c.json({ ok: true });
  }

  if (body.type === "tour") {
    const tour = await prisma.tour.findFirst({
      where: { id: body.id, organizationId: user.organizationId },
      select: { id: true, name: true },
    });
    if (!tour) return c.json({ error: { message: "Tour not found", code: "NOT_FOUND" } }, 404);
    await prisma.tour.update({
      where: { id: tour.id },
      data: { timeParentCategoryId: parentId },
    });
    await ensureTourTimeProject(user.organizationId, {
      id: tour.id,
      name: tour.name,
      timeParentCategoryId: parentId,
    });
    return c.json({ ok: true });
  }

  const project = await prisma.timeProject.findFirst({
    where: {
      id: body.id,
      organizationId: user.organizationId,
      eventId: null,
      tourId: null,
      isArchived: false,
    },
  });
  if (!project) {
    return c.json({ error: { message: "Standalone project not found", code: "NOT_FOUND" } }, 404);
  }
  if (isLeaveSystemProjectKey(project.systemKey)) {
    return c.json(
      {
        error: {
          message: "Fraværsprojekter kan ikke flyttes til en anden overkategori.",
          code: "FORBIDDEN",
        },
      },
      403
    );
  }
  await prisma.timeProject.update({
    where: { id: project.id },
    data: { timeParentCategoryId: parentId },
  });
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
  await ensureAllLeaveTimeProjects(user.organizationId);
  await backfillLeaveEntryProjects(user.organizationId);
  const leaveCategoryFixed = await backfillLeaveEntryCategories(user.organizationId);
  await backfillMissingTimeProjects(user.organizationId);
  await ensureFullDayTimeSpansBackfilled(user.organizationId);
  if (leaveCategoryFixed.length > 0) {
    const toSync = await prisma.timeEntry.findMany({
      where: { id: { in: leaveCategoryFixed } },
      select: {
        id: true,
        organizationId: true,
        personId: true,
        startsAt: true,
        endsAt: true,
        category: true,
      },
    });
    for (const entry of toSync) {
      await maybeSyncLeaveLedger(user.organizationId, entry, user.id ?? null);
    }
  }
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
    const show = await prisma.eventShow.findFirst({
      where: {
        id: eventShowId,
        event: { organizationId: user.organizationId },
      },
      select: { id: true, eventId: true, event: { select: { title: true } } },
    });
    if (!show) {
      return c.json({ error: { message: "Show not found", code: "NOT_FOUND" } }, 404);
    }
    eventId = show.eventId;
    eventShowId = null;
    if (body.eventId != null && body.eventId !== show.eventId) {
      return c.json({ error: { message: "Show does not belong to that event", code: "BAD_REQUEST" } }, 400);
    }
    const eventProjectId = await ensureEventTimeProject(user.organizationId, {
      id: show.eventId,
      title: show.event.title,
    });
    const existingEvProj = await prisma.timeProject.findFirst({
      where: { id: eventProjectId, organizationId: user.organizationId },
    });
    if (existingEvProj) {
      return c.json({ data: serializeProject(existingEvProj) });
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

  const parentResolved = await resolveOrgParentCategoryId(
    user.organizationId,
    body.timeParentCategoryId
  );
  if (!parentResolved.ok) {
    return c.json({ error: { message: "Parent category not found", code: "NOT_FOUND" } }, 404);
  }
  if (await isLeaveParentCategoryId(user.organizationId, parentResolved.value)) {
    return c.json(
      {
        error: {
          message:
            "Fravær indeholder kun systemprojekter (Ferie, Sygdom, Feriefridag, …). Opret ikke egne projekter der.",
          code: "FORBIDDEN",
        },
      },
      403
    );
  }
  const isStandalone = !eventId && !eventShowId && !body.tourId && !body.tourShowId;

  const row = await prisma.timeProject.create({
    data: {
      organizationId: user.organizationId,
      name: body.name.trim(),
      eventId,
      eventShowId,
      tourId: body.tourId ?? null,
      tourShowId: body.tourShowId ?? null,
      timeParentCategoryId: isStandalone ? (parentResolved.value ?? null) : null,
      sortOrder: body.sortOrder ?? 0,
      color: body.color ?? null,
      fillPattern: body.fillPattern ?? null,
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
  if (isLeaveSystemProjectKey(existing.systemKey)) {
    const onlyVisual =
      body.name === undefined &&
      body.eventId === undefined &&
      body.eventShowId === undefined &&
      body.tourId === undefined &&
      body.tourShowId === undefined &&
      body.timeParentCategoryId === undefined &&
      body.isArchived === undefined &&
      body.sortOrder === undefined &&
      (body.color !== undefined || body.fillPattern !== undefined);
    if (!onlyVisual) {
      return c.json(
        {
          error: {
            message: "System leave projects can only change colour and fill pattern.",
            code: "FORBIDDEN",
          },
        },
        403
      );
    }
    const row = await prisma.timeProject.update({
      where: { id },
      data: {
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.fillPattern !== undefined ? { fillPattern: body.fillPattern } : {}),
      },
    });
    return c.json({ data: serializeProject(row) });
  }
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
  let parentCategoryPatch: string | null | undefined;
  if (body.timeParentCategoryId !== undefined) {
    if (existing.eventId || existing.tourId) {
      return c.json(
        {
          error: {
            message: "Link events and tours to a parent category from the catalog page",
            code: "BAD_REQUEST",
          },
        },
        400
      );
    }
    const parentResolved = await resolveOrgParentCategoryId(
      user.organizationId,
      body.timeParentCategoryId
    );
    if (!parentResolved.ok) {
      return c.json({ error: { message: "Parent category not found", code: "NOT_FOUND" } }, 404);
    }
    if (await isLeaveParentCategoryId(user.organizationId, parentResolved.value)) {
      return c.json(
        {
          error: {
            message:
              "Fravær indeholder kun systemprojekter. Flyt ikke almindelige projekter hertil.",
            code: "FORBIDDEN",
          },
        },
        403
      );
    }
    parentCategoryPatch = parentResolved.value ?? null;
  }
  const row = await prisma.timeProject.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.eventId !== undefined ? { eventId: body.eventId } : {}),
      ...(body.eventShowId !== undefined ? { eventShowId: body.eventShowId } : {}),
      ...(body.tourId !== undefined ? { tourId: body.tourId } : {}),
      ...(body.tourShowId !== undefined ? { tourShowId: body.tourShowId } : {}),
      ...(parentCategoryPatch !== undefined ? { timeParentCategoryId: parentCategoryPatch } : {}),
      ...(body.isArchived !== undefined ? { isArchived: body.isArchived } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
      ...(body.fillPattern !== undefined ? { fillPattern: body.fillPattern } : {}),
    },
  });
  // Keep linked event/tour title in sync so auto-project sync does not overwrite the rename.
  if (body.name !== undefined) {
    const trimmed = body.name.trim();
    if (existing.eventId) {
      await prisma.event.update({
        where: { id: existing.eventId },
        data: { title: trimmed },
      });
    }
    if (existing.tourId) {
      await prisma.tour.update({
        where: { id: existing.tourId },
        data: { name: trimmed },
      });
    }
  }
  return c.json({ data: serializeProject(row) });
});

timeRouter.delete("/time/projects/:id", zValidator("json", DeleteTimeProjectSchema), async (c) => {
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
  if (isLeaveSystemProjectKey(existing.systemKey)) {
    return c.json(
      {
        error: {
          message: "System leave projects cannot be deleted.",
          code: "FORBIDDEN",
        },
      },
      403
    );
  }
  if (body.reassignToProjectId === id) {
    return c.json(
      { error: { message: "Choose a different project for the existing registrations.", code: "BAD_REQUEST" } },
      400
    );
  }

  const usageCount = await countProjectUsages(user.organizationId, id);

  if (!body.reassignToProjectId) {
    if (usageCount > 0) {
      return c.json(
        {
          error: {
            message: "Project still has registrations. Choose a project to move them to.",
            code: "BAD_REQUEST",
          },
        },
        400
      );
    }
    await prisma.timeProject.delete({ where: { id } });
    return c.json({
      data: {
        ok: true,
        reassignedEntries: 0,
        reassignedTravelClaims: 0,
        reassignedMileageClaims: 0,
      },
    });
  }

  try {
    const organizationId = user.organizationId;
    const moved = await reassignProjectReferences({
      organizationId,
      fromProjectId: id,
      toProjectId: body.reassignToProjectId,
      onEntryMoved: async (entry) => {
        await maybeSyncLeaveLedger(organizationId, entry, user.id ?? null);
      },
    });
    await prisma.timeProject.delete({ where: { id } });
    return c.json({
      data: {
        ok: true,
        reassignedEntries: moved.entries,
        reassignedTravelClaims: moved.travelClaims,
        reassignedMileageClaims: moved.mileageClaims,
      },
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "TARGET_NOT_FOUND") {
      return c.json({ error: { message: "Target project not found", code: "NOT_FOUND" } }, 404);
    }
    if (code === "SOURCE_NOT_FOUND") {
      return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    }
    throw err;
  }
});

/** Optional: usage count before delete UI. */
timeRouter.get("/time/projects/:id/usage", async (c) => {
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
    select: { id: true },
  });
  if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  const count = await countProjectUsages(user.organizationId, id);
  return c.json({ data: { count } });
});

timeRouter.get("/time/projects/:id/entries", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "time.manage_catalog")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const project = await prisma.timeProject.findFirst({
    where: { id, organizationId: user.organizationId },
    select: { id: true, name: true },
  });
  if (!project) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  const limitRaw = Number.parseInt(c.req.query("limit") ?? "300", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 300;

  const totalCount = await prisma.timeEntry.count({
    where: {
      organizationId: user.organizationId,
      timeProjectId: id,
      category: { notIn: ["comp_settlement_earned", "comp_settlement_used"] },
    },
  });

  const rows = await prisma.timeEntry.findMany({
    where: {
      organizationId: user.organizationId,
      timeProjectId: id,
      category: { notIn: ["comp_settlement_earned", "comp_settlement_used"] },
    },
    select: {
      id: true,
      personId: true,
      startsAt: true,
      endsAt: true,
      category: true,
      note: true,
      isLocked: true,
      person: { select: { name: true } },
    },
    orderBy: { startsAt: "desc" },
    take: limit,
  });

  let totalMinutes = 0;
  const entries = rows.map((row) => {
    const durationMinutes = Math.max(
      0,
      Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60_000)
    );
    totalMinutes += durationMinutes;
    return {
      id: row.id,
      personId: row.personId,
      personName: row.person.name,
      startsAt: iso(row.startsAt),
      endsAt: iso(row.endsAt),
      category: row.category as TimeCategory,
      note: row.note,
      isLocked: row.isLocked,
      durationMinutes,
    };
  });

  // If truncated, still report full total minutes via aggregate query
  if (totalCount > rows.length) {
    const allForSum = await prisma.timeEntry.findMany({
      where: {
        organizationId: user.organizationId,
        timeProjectId: id,
        category: { notIn: ["comp_settlement_earned", "comp_settlement_used"] },
      },
      select: { startsAt: true, endsAt: true },
    });
    totalMinutes = allForSum.reduce(
      (s, r) => s + Math.max(0, (r.endsAt.getTime() - r.startsAt.getTime()) / 60_000),
      0
    );
  }

  return c.json({
    data: {
      projectId: project.id,
      projectName: project.name,
      totalCount,
      totalMinutes: Math.round(totalMinutes),
      entries,
    },
  });
});

timeRouter.post(
  "/time/projects/:id/reassign-entries",
  zValidator("json", ReassignTimeProjectEntriesSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId) {
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    }
    if (!canAction(c, "time.manage_catalog")) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }
    const id = c.req.param("id");
    const body = c.req.valid("json");
    if (body.toProjectId === id) {
      return c.json(
        { error: { message: "Choose a different target project.", code: "BAD_REQUEST" } },
        400
      );
    }
    try {
      const organizationId = user.organizationId;
      const moved = await reassignProjectReferences({
        organizationId,
        fromProjectId: id,
        toProjectId: body.toProjectId,
        onEntryMoved: async (entry) => {
          await maybeSyncLeaveLedger(organizationId, entry, user.id ?? null);
        },
      });
      return c.json({
        data: {
          ok: true,
          reassignedEntries: moved.entries,
          reassignedTravelClaims: moved.travelClaims,
          reassignedMileageClaims: moved.mileageClaims,
          categoryUpdates: moved.categoryUpdates,
        },
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "TARGET_NOT_FOUND" || code === "SOURCE_NOT_FOUND") {
        return c.json({ error: { message: "Project not found", code: "NOT_FOUND" } }, 404);
      }
      throw err;
    }
  }
);

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

  const projectByEventId = await eventProjectIdMapForEvents(
    user.organizationId,
    jobs.map((j) => j.show.event.id)
  );

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
      timeProjectId: projectByEventId.get(j.show.event.id) ?? null,
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
  const todayStart = startOfLocalCalendarDayInZone(now, getClientWallClockZone());

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

  const projectByEventId = await eventProjectIdMapForEvents(
    user.organizationId,
    jobs.map((j) => j.show.event.id)
  );

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
      timeProjectId: projectByEventId.get(j.show.event.id) ?? null,
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

  await ensureFullDayTimeSpansBackfilled(user.organizationId);

  const rows = await prisma.timeEntry.findMany({
    where: {
      organizationId: user.organizationId,
      personId: target.personId,
      startsAt: { lt: rangeEndExclusive },
      endsAt: { gt: rangeStart },
      category: { notIn: ["comp_settlement_earned", "comp_settlement_used"] },
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
  let tourScheduleEventId: string | null = body.tourScheduleEventId ?? null;
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
    if (tourScheduleEventId && !tourShowId) {
      return c.json(
        {
          error: { message: "tourScheduleEventId requires tourShowId.", code: "BAD_REQUEST" },
        },
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
        select: { id: true, tourId: true },
      });
      if (!show) {
        return c.json(
          { error: { message: "Tour show not found or you are not on the roster.", code: "NOT_FOUND" } }, 404
        );
      }

      if (tourScheduleEventId) {
        const schedEv = await prisma.tourScheduleEvent.findFirst({
          where: { id: tourScheduleEventId, tourShowId: show.id },
          select: { id: true },
        });
        if (!schedEv) {
          return c.json(
            {
              error: { message: "Tour schedule event not found for this tour day.", code: "NOT_FOUND" } },
            404
          );
        }
      }

      let resolvedProjectId: string | null = body.timeProjectId ?? null;
      if (resolvedProjectId) {
        const p = await prisma.timeProject.findFirst({
          where: { id: resolvedProjectId, organizationId: user.organizationId },
        });
        if (!p) return c.json({ error: { message: "Project not found", code: "NOT_FOUND" } }, 404);
      } else {
        resolvedProjectId = await resolveTourTimeProjectId(user.organizationId, show.tourId);
      }
      if (!resolvedProjectId) {
        await syncEventShowTimeProjects(user.organizationId);
        resolvedProjectId = await resolveTourTimeProjectId(user.organizationId, show.tourId);
      }
      if (!resolvedProjectId) {
        const legacy = await prisma.timeProject.findFirst({
          where: { organizationId: user.organizationId, tourShowId: show.id, isArchived: false },
          select: { id: true },
        });
        resolvedProjectId = legacy?.id ?? null;
      }
      if (!resolvedProjectId) {
        return c.json(
          { error: { message: "No time project for this tour. Contact an admin.", code: "BAD_REQUEST" } },
          400
        );
      }

      eventShowJobId = null;
      eventId = null;
      eventShowStaffingId = null;
      internalBookingPersonId = null;
      internalBookingDayKey = null;

      const existingTour = await prisma.timeEntry.findFirst({
        where: {
          personId: myPersonId,
          tourShowId,
          tourScheduleEventId: tourScheduleEventId ?? null,
        },
        include: { tagLinks: { select: { timeTagId: true } } },
      });

      if (existingTour) {
        const spans = await computeNonOverlappingSpans({
          organizationId: user.organizationId,
          personId: myPersonId,
          startsAt,
          endsAt,
          excludeEntryId: existingTour.id,
          excludeSegmentGroupId: existingTour.segmentGroupId,
        });
        if (spans.length === 0) {
          return c.json(
            { error: { message: "Time range overlaps existing entries", code: "OVERLAP_CONFLICT" } },
            409
          );
        }
        const primary = spans[0];
        if (!primary) {
          return c.json(
            { error: { message: "Time range overlaps existing entries", code: "OVERLAP_CONFLICT" } },
            409
          );
        }
        const nextGroupId = segmentGroupIdAfterSplit(spans.length, existingTour.segmentGroupId);
        const segmentGroupPatch = nextGroupId != null ? { segmentGroupId: nextGroupId } : {};
        const updated = await prisma.timeEntry.update({
          where: { id: existingTour.id },
          data: {
            startsAt: primary.startsAt,
            endsAt: primary.endsAt,
            kind: "job",
            category: body.category ?? "work",
            eventShowJobId: null,
            eventId: null,
            tourShowId,
            tourScheduleEventId: tourScheduleEventId ?? null,
            timeProjectId: resolvedProjectId,
            note: body.note ?? null,
            isLocked: body.isLocked ?? false,
            eventShowStaffingId: null,
            internalBookingPersonId: null,
            internalBookingDayKey: null,
            ...segmentGroupPatch,
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
                tourScheduleEventId: null,
                eventShowStaffingId: null,
                internalBookingPersonId: null,
                internalBookingDayKey: null,
                timeProjectId: resolvedProjectId,
                note: body.note ?? null,
                isLocked: body.isLocked ?? false,
                ...segmentGroupPatch,
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
          { error: { message: "Time range overlaps existing entries", code: "OVERLAP_CONFLICT" } },
          409
        );
      }
      const primary = spans[0];
      if (!primary) {
        return c.json(
          { error: { message: "Time range overlaps existing entries", code: "OVERLAP_CONFLICT" } },
          409
        );
      }
      const nextGroupIdNewTour = segmentGroupIdAfterSplit(spans.length, undefined);
      const segmentGroupPatchNewTour = nextGroupIdNewTour != null ? { segmentGroupId: nextGroupIdNewTour } : {};
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
          tourScheduleEventId: tourScheduleEventId ?? null,
          eventShowStaffingId: null,
          internalBookingPersonId: null,
          internalBookingDayKey: null,
          timeProjectId: resolvedProjectId,
          note: body.note ?? null,
          isLocked: body.isLocked ?? false,
          ...segmentGroupPatchNewTour,
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
              tourScheduleEventId: null,
              eventShowStaffingId: null,
              internalBookingPersonId: null,
              internalBookingDayKey: null,
              timeProjectId: resolvedProjectId,
              note: body.note ?? null,
              isLocked: body.isLocked ?? false,
              ...segmentGroupPatchNewTour,
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
        resolvedProjectId = await resolveEventTimeProjectForShow(
          user.organizationId,
          staffing.show.eventId,
          staffing.show.id
        );
      }
      if (!resolvedProjectId) {
        return c.json(
          { error: { message: "No time project for this event. Contact an admin.", code: "BAD_REQUEST" } },
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
        tourScheduleEventId: null as string | null,
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
          excludeSegmentGroupId: existingStaff.segmentGroupId,
        });
        if (spans.length === 0) {
          return c.json(
            { error: { message: "Time range overlaps existing entries", code: "OVERLAP_CONFLICT" } },
            409
          );
        }
        const primary = spans[0];
        if (!primary) {
          return c.json(
            { error: { message: "Time range overlaps existing entries", code: "OVERLAP_CONFLICT" } },
            409
          );
        }
        const nextGroupIdStaff = segmentGroupIdAfterSplit(spans.length, existingStaff.segmentGroupId);
        const segmentGroupPatchStaff = nextGroupIdStaff != null ? { segmentGroupId: nextGroupIdStaff } : {};
        const updated = await prisma.timeEntry.update({
          where: { id: existingStaff.id },
          data: {
            startsAt: primary.startsAt,
            endsAt: primary.endsAt,
            category: body.category ?? "work",
            timeProjectId: resolvedProjectId,
            note: body.note ?? null,
            isLocked: body.isLocked ?? false,
            tourScheduleEventId: null,
            ...segmentGroupPatchStaff,
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
                ...segmentGroupPatchStaff,
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
          { error: { message: "Time range overlaps existing entries", code: "OVERLAP_CONFLICT" } },
          409
        );
      }
      const primary = spans[0];
      if (!primary) {
        return c.json(
          { error: { message: "Time range overlaps existing entries", code: "OVERLAP_CONFLICT" } },
          409
        );
      }
      const nextGroupIdNewStaff = segmentGroupIdAfterSplit(spans.length, undefined);
      const segmentGroupPatchNewStaff = nextGroupIdNewStaff != null ? { segmentGroupId: nextGroupIdNewStaff } : {};
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
          tourScheduleEventId: null,
          eventShowStaffingId,
          internalBookingPersonId: null,
          internalBookingDayKey: null,
          timeProjectId: resolvedProjectId,
          note: body.note ?? null,
          isLocked: body.isLocked ?? false,
          ...segmentGroupPatchNewStaff,
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
              ...segmentGroupPatchNewStaff,
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
        tourScheduleEventId: null as string | null,
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
          excludeSegmentGroupId: existingIb.segmentGroupId,
        });
        if (spans.length === 0) {
          return c.json(
            { error: { message: "Time range overlaps existing entries", code: "OVERLAP_CONFLICT" } },
            409
          );
        }
        const primary = spans[0];
        if (!primary) {
          return c.json(
            { error: { message: "Time range overlaps existing entries", code: "OVERLAP_CONFLICT" } },
            409
          );
        }
        const nextGroupIdIb = segmentGroupIdAfterSplit(spans.length, existingIb.segmentGroupId);
        const segmentGroupPatchIb = nextGroupIdIb != null ? { segmentGroupId: nextGroupIdIb } : {};
        const updated = await prisma.timeEntry.update({
          where: { id: existingIb.id },
          data: {
            startsAt: primary.startsAt,
            endsAt: primary.endsAt,
            category: body.category ?? "work",
            timeProjectId: resolvedProjectId,
            note: body.note ?? null,
            isLocked: body.isLocked ?? false,
            tourScheduleEventId: null,
            ...segmentGroupPatchIb,
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
                ...segmentGroupPatchIb,
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
          { error: { message: "Time range overlaps existing entries", code: "OVERLAP_CONFLICT" } },
          409
        );
      }
      const primary = spans[0];
      if (!primary) {
        return c.json(
          { error: { message: "Time range overlaps existing entries", code: "OVERLAP_CONFLICT" } },
          409
        );
      }
      const nextGroupIdNewIb = segmentGroupIdAfterSplit(spans.length, undefined);
      const segmentGroupPatchNewIb = nextGroupIdNewIb != null ? { segmentGroupId: nextGroupIdNewIb } : {};
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
          tourScheduleEventId: null,
          eventShowStaffingId: null,
          internalBookingPersonId,
          internalBookingDayKey,
          timeProjectId: resolvedProjectId,
          note: body.note ?? null,
          isLocked: body.isLocked ?? false,
          ...segmentGroupPatchNewIb,
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
              ...segmentGroupPatchNewIb,
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
      include: { show: { select: { id: true, eventId: true } } },
    });
    if (!job) {
      return c.json({ error: { message: "Job not found or not assigned to you", code: "NOT_FOUND" } }, 404);
    }
    eventId = job.show.eventId;
    tourShowId = null;
    let resolvedEventProjectId: string | null = body.timeProjectId ?? null;
    if (resolvedEventProjectId) {
      const p = await prisma.timeProject.findFirst({
        where: { id: resolvedEventProjectId, organizationId: user.organizationId },
      });
      if (!p) return c.json({ error: { message: "Project not found", code: "NOT_FOUND" } }, 404);
    } else {
      resolvedEventProjectId = await resolveEventTimeProjectForShow(
        user.organizationId,
        job.show.eventId,
        job.show.id
      );
    }
    if (!resolvedEventProjectId) {
      return c.json(
        { error: { message: "No time project for this event. Contact an admin.", code: "BAD_REQUEST" } },
        400
      );
    }
    const existing = await prisma.timeEntry.findFirst({
      where: { personId: myPersonId, eventShowJobId },
      include: { tagLinks: { select: { timeTagId: true } } },
    });
    if (existing) {
      const spans = await computeNonOverlappingSpans({
        organizationId: user.organizationId,
        personId: myPersonId,
        startsAt,
        endsAt,
        excludeEntryId: existing.id,
        excludeSegmentGroupId: existing.segmentGroupId,
      });
      if (spans.length === 0) {
        return c.json(
          { error: { message: "Time range overlaps existing entries", code: "OVERLAP_CONFLICT" } },
          409
        );
      }
      const primary = spans[0];
      if (!primary) {
        return c.json(
          { error: { message: "Time range overlaps existing entries", code: "OVERLAP_CONFLICT" } },
          409
        );
      }
      const nextGroupIdJob = segmentGroupIdAfterSplit(spans.length, existing.segmentGroupId);
      const segmentGroupPatchJob = nextGroupIdJob != null ? { segmentGroupId: nextGroupIdJob } : {};
      const updated = await prisma.timeEntry.update({
        where: { id: existing.id },
        data: {
          startsAt: primary.startsAt,
          endsAt: primary.endsAt,
          category: body.category ?? "work",
          timeProjectId: resolvedEventProjectId,
          note: body.note ?? null,
          isLocked: body.isLocked ?? false,
          eventShowStaffingId: null,
          internalBookingPersonId: null,
          internalBookingDayKey: null,
          tourScheduleEventId: null,
          ...segmentGroupPatchJob,
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
              tourScheduleEventId: null,
              eventShowStaffingId: null,
              internalBookingPersonId: null,
              internalBookingDayKey: null,
              timeProjectId: resolvedEventProjectId,
              note: body.note ?? null,
              isLocked: body.isLocked ?? false,
              ...segmentGroupPatchJob,
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
        { error: { message: "Time range overlaps existing entries", code: "OVERLAP_CONFLICT" } },
        409
      );
    }
    const primary = spans[0];
    if (!primary) {
      return c.json(
        { error: { message: "Time range overlaps existing entries", code: "OVERLAP_CONFLICT" } },
        409
      );
    }
    const nextGroupIdNewJob = segmentGroupIdAfterSplit(spans.length, undefined);
    const segmentGroupPatchNewJob = nextGroupIdNewJob != null ? { segmentGroupId: nextGroupIdNewJob } : {};
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
        tourScheduleEventId: null,
        eventShowStaffingId: null,
        internalBookingPersonId: null,
        internalBookingDayKey: null,
        timeProjectId: resolvedEventProjectId,
        note: body.note ?? null,
        isLocked: body.isLocked ?? false,
        ...segmentGroupPatchNewJob,
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
            tourScheduleEventId: null,
            eventShowStaffingId: null,
            internalBookingPersonId: null,
            internalBookingDayKey: null,
            timeProjectId: resolvedEventProjectId,
            note: body.note ?? null,
            isLocked: body.isLocked ?? false,
            ...segmentGroupPatchNewJob,
            tagLinks: { createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) } },
          },
        });
      }
    }
    return c.json({ data: serializeEntry(created) });
  }

  if (body.tourScheduleEventId) {
    return c.json(
      {
        error: {
          message: "Custom entries cannot reference a tour schedule event.",
          code: "BAD_REQUEST",
        },
      },
      400
    );
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
  let entryCategory = body.category ?? "work";
  let requestedCustomProjectId = body.timeProjectId ?? null;
  if (body.timeProjectId) {
    const project = await prisma.timeProject.findFirst({
      where: { id: body.timeProjectId, organizationId: user.organizationId },
      select: { id: true, systemKey: true, name: true },
    });
    if (project) {
      const canonical = await resolveCanonicalLeaveProject(user.organizationId, project);
      if (canonical) {
        entryCategory = canonical.category;
        requestedCustomProjectId = canonical.projectId;
      }
    }
  }
  const resolvedCustomProjectId = await resolveEntryTimeProjectId(
    user.organizationId,
    entryCategory,
    requestedCustomProjectId
  );
  const normalizedCustom = normalizeEntryProjectAndTags(
    entryCategory,
    resolvedCustomProjectId,
    body.tagIds ?? []
  );
  let customProjectId = normalizedCustom.timeProjectId;
  if (!customProjectId && categoryRequiresTimeProject(entryCategory)) {
    customProjectId = await ensureUnassignedHoursProject(user.organizationId);
  }
  if (customProjectId) {
    const p = await prisma.timeProject.findFirst({
      where: { id: customProjectId, organizationId: user.organizationId },
    });
    if (!p) return c.json({ error: { message: "Project not found", code: "NOT_FOUND" } }, 404);
  } else if (body.timeProjectId && !isVacationNoteOnlyCategory(entryCategory)) {
    const p = await prisma.timeProject.findFirst({
      where: { id: body.timeProjectId, organizationId: user.organizationId },
    });
    if (!p) return c.json({ error: { message: "Project not found", code: "NOT_FOUND" } }, 404);
  }
  const tagIds = normalizedCustom.tagIds;
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
      { error: { message: "Time range overlaps existing entries", code: "OVERLAP_CONFLICT" } },
      409
    );
  }
  const primary = spans[0];
  if (!primary) {
    return c.json(
      { error: { message: "Time range overlaps existing entries", code: "OVERLAP_CONFLICT" } },
      409
    );
  }
  const nextGroupIdCustom = segmentGroupIdAfterSplit(spans.length, undefined);
  const segmentGroupPatchCustom = nextGroupIdCustom != null ? { segmentGroupId: nextGroupIdCustom } : {};
  const created = await prisma.timeEntry.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      personId: myPersonId,
      startsAt: primary.startsAt,
      endsAt: primary.endsAt,
      kind: "custom",
      category: entryCategory,
      eventShowJobId: null,
      eventId,
      tourShowId: null,
      tourScheduleEventId: null,
      eventShowStaffingId: null,
      internalBookingPersonId: null,
      internalBookingDayKey: null,
      timeProjectId: customProjectId,
      note: body.note ?? null,
      isLocked: body.isLocked ?? false,
      ...segmentGroupPatchCustom,
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
          category: entryCategory,
          eventShowJobId: null,
          eventId,
          tourShowId: null,
          tourScheduleEventId: null,
          eventShowStaffingId: null,
          internalBookingPersonId: null,
          internalBookingDayKey: null,
          timeProjectId: customProjectId,
          note: body.note ?? null,
          isLocked: body.isLocked ?? false,
          ...segmentGroupPatchCustom,
          tagLinks: { createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) } },
        },
      });
    }
  }
  await maybeSyncLeaveLedger(user.organizationId, created, user.id);
  if (spans.length > 1) {
    const extra = await prisma.timeEntry.findMany({
      where: {
        organizationId: user.organizationId,
        personId: myPersonId,
        segmentGroupId: nextGroupIdCustom ?? undefined,
        id: { not: created.id },
      },
    });
    for (const e of extra) await maybeSyncLeaveLedger(user.organizationId, e, user.id);
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
  let finalTourScheduleEventId: string | null =
    body.tourScheduleEventId !== undefined ? body.tourScheduleEventId : existing.tourScheduleEventId;
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
    finalTourScheduleEventId = null;
    finalEventShowStaffingId = null;
    finalInternalBookingPersonId = null;
    finalInternalBookingDayKey = null;
  }

  if (!finalTourShowId) {
    finalTourScheduleEventId = null;
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
      if (finalTourScheduleEventId) {
        const schedEv = await prisma.tourScheduleEvent.findFirst({
          where: { id: finalTourScheduleEventId, tourShowId: finalTourShowId },
          select: { id: true },
        });
        if (!schedEv) {
          return c.json(
            {
              error: { message: "Tour schedule event not found for this tour day.", code: "NOT_FOUND" } },
            404
          );
        }
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

  const finalEventId = body.eventId !== undefined ? body.eventId : existing.eventId;
  let requestedProjectId =
    body.timeProjectId !== undefined ? body.timeProjectId : existing.timeProjectId;
  let finalCategory = body.category ?? existing.category;
  // Fravær system projects (Ferie / Sygdom / …) always lock the matching leave category.
  const projectIdForLeaveCheck =
    body.timeProjectId !== undefined ? body.timeProjectId : existing.timeProjectId;
  if (projectIdForLeaveCheck) {
    const project = await prisma.timeProject.findFirst({
      where: { id: projectIdForLeaveCheck, organizationId: user.organizationId },
      select: { id: true, systemKey: true, name: true },
    });
    if (project) {
      const canonical = await resolveCanonicalLeaveProject(user.organizationId, project);
      if (canonical) {
        finalCategory = canonical.category;
        requestedProjectId = canonical.projectId;
      }
    }
  }
  const resolvedProjectId = await resolveEntryTimeProjectId(
    user.organizationId,
    finalCategory,
    requestedProjectId
  );
  const normalizedPatch = normalizeEntryProjectAndTags(
    finalCategory,
    resolvedProjectId,
    body.tagIds !== undefined ? body.tagIds : existing.tagLinks.map((t) => t.timeTagId)
  );
  const finalProjectId =
    normalizedPatch.timeProjectId ??
    (categoryRequiresTimeProject(finalCategory)
      ? await ensureUnassignedHoursProject(user.organizationId)
      : null);
  if (finalProjectId) {
    const p = await prisma.timeProject.findFirst({
      where: { id: finalProjectId, organizationId: user.organizationId },
    });
    if (!p) return c.json({ error: { message: "Project not found", code: "NOT_FOUND" } }, 404);
  }
  const finalNote = body.note !== undefined ? body.note : existing.note;
  const finalIsLocked = body.isLocked !== undefined ? body.isLocked : existing.isLocked;
  const finalTagIds = normalizedPatch.tagIds;

  const spans = await computeNonOverlappingSpans({
    organizationId: user.organizationId,
    personId: existing.personId,
    startsAt,
    endsAt,
    excludeEntryId: existing.id,
    excludeSegmentGroupId: existing.segmentGroupId,
  });
  if (spans.length === 0) {
    return c.json(
      { error: { message: "Time range overlaps existing entries", code: "OVERLAP_CONFLICT" } },
      409
    );
  }
  const primary = spans[0];
  if (!primary) {
    return c.json(
      { error: { message: "Time range overlaps existing entries", code: "OVERLAP_CONFLICT" } },
      409
    );
  }

  const nextGroupIdPatch = segmentGroupIdAfterSplit(spans.length, existing.segmentGroupId);
  const segmentGroupPatchPatch = nextGroupIdPatch != null ? { segmentGroupId: nextGroupIdPatch } : {};

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
      tourScheduleEventId: finalTourScheduleEventId,
      eventShowStaffingId: finalEventShowStaffingId,
      internalBookingPersonId: finalInternalBookingPersonId,
      internalBookingDayKey: finalInternalBookingDayKey,
      timeProjectId: finalProjectId,
      note: finalNote,
      isLocked: finalIsLocked,
      ...segmentGroupPatchPatch,
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
          tourScheduleEventId: null,
          eventShowStaffingId: null,
          internalBookingPersonId: null,
          internalBookingDayKey: null,
          timeProjectId: finalProjectId,
          note: finalNote,
          isLocked: finalIsLocked,
          ...segmentGroupPatchPatch,
          tagLinks: { createMany: { data: finalTagIds.map((timeTagId) => ({ timeTagId })) } },
        },
      });
    }
  }

  const touchesLinkedSegmentMetadata =
    body.category !== undefined ||
    body.timeProjectId !== undefined ||
    body.note !== undefined ||
    body.isLocked !== undefined ||
    body.tagIds !== undefined ||
    body.eventId !== undefined;

  const segmentGroupForPropagate = updated.segmentGroupId ?? existing.segmentGroupId;
  if (segmentGroupForPropagate && touchesLinkedSegmentMetadata) {
    await propagateTimeEntrySegmentMetadata({
      organizationId: user.organizationId,
      personId: existing.personId,
      segmentGroupId: segmentGroupForPropagate,
      excludeEntryId: updated.id,
      category: finalCategory,
      timeProjectId: finalProjectId,
      note: finalNote,
      isLocked: finalIsLocked,
      eventId: finalEventId,
      tagIds: finalTagIds,
    });
  }

  await maybeSyncLeaveLedger(user.organizationId, updated, user.id);

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
  await maybeRemoveLeaveLedger(id, user.organizationId);
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
  if (!(await travelAllowanceFeatureEnabled(user.organizationId, "DK"))) {
    return c.json({ data: [] });
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
  const body = c.req.valid("json");
  const country = body.country.trim().toUpperCase();
  if (!(await travelAllowanceFeatureEnabled(user.organizationId, country))) {
    return c.json(
      {
        error: {
          message: "Travel allowance is not enabled for this organization.",
          code: "FEATURE_DISABLED",
        },
      },
      403
    );
  }
  const personId = await resolvePersonIdForUser(user.organizationId, user.email);
  if (!personId) {
    return c.json({ error: { message: "No linked person profile.", code: "BAD_REQUEST" } }, 400);
  }
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
      destination:
        body.destination?.trim() || travelClaimDestinationFromDayLines(body.dayLines) || "Travel",
      purpose: body.purpose?.trim() ?? "",
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
  if (!(await travelAllowanceFeatureEnabled(user.organizationId, existing.country))) {
    return c.json(
      {
        error: {
          message: "Travel allowance is not enabled for this organization.",
          code: "FEATURE_DISABLED",
        },
      },
      403
    );
  }
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
  if (!(await travelAllowanceFeatureEnabled(user.organizationId, country))) {
    return c.json(
      {
        error: {
          message: "Travel allowance is not enabled for this organization.",
          code: "FEATURE_DISABLED",
        },
      },
      403
    );
  }
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
  if (!(await travelAllowanceFeatureEnabled(user.organizationId, existing.country))) {
    return c.json(
      {
        error: {
          message: "Travel allowance is not enabled for this organization.",
          code: "FEATURE_DISABLED",
        },
      },
      403
    );
  }
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

timeRouter.get("/time/mileage-distance", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  if (!(await mileageAllowanceFeatureEnabled(user.organizationId, "DK"))) {
    return c.json(
      {
        error: {
          message: "Mileage allowance is not enabled for this organization.",
          code: "FEATURE_DISABLED",
        },
      },
      403
    );
  }

  const from = c.req.query("from")?.trim() ?? "";
  const to = c.req.query("to")?.trim() ?? "";
  const vehicleType = c.req.query("vehicleType") === "bicycle" ? "bicycle" : "car";

  if (from.length < 3 || to.length < 3) {
    return c.json(
      { error: { message: "Both from and to addresses are required.", code: "BAD_REQUEST" } },
      400
    );
  }

  try {
    const result = await googleRouteDistanceKm({
      from,
      to,
      mode: vehicleType === "bicycle" ? "bicycling" : "driving",
    });
    return c.json({
      data: {
        distanceKm: result.distanceKm,
        durationMinutes:
          result.durationSeconds != null ? Math.round(result.durationSeconds / 60) : null,
      },
    });
  } catch (error) {
    if (error instanceof GoogleMapsNotConfiguredError) {
      return c.json(
        {
          error: {
            message: "Google Maps route calculation is not configured on the server.",
            code: "GOOGLE_MAPS_NOT_CONFIGURED",
          },
        },
        503
      );
    }
    if (error instanceof GoogleMapsRouteNotFoundError) {
      return c.json(
        { error: { message: "Could not find a route between the addresses.", code: "ROUTE_NOT_FOUND" } },
        404
      );
    }
    return c.json(
      { error: { message: "Could not calculate driving distance.", code: "DISTANCE_LOOKUP_FAILED" } },
      502
    );
  }
});

timeRouter.get("/time/mileage-claims", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  if (!(await mileageAllowanceFeatureEnabled(user.organizationId, "DK"))) {
    return c.json({ data: [] });
  }
  const r = parseRange(c);
  if ("error" in r) return c.json({ error: { message: r.error, code: "BAD_REQUEST" } }, 400);
  const qPerson = c.req.query("personId");
  const target = await resolveTargetPersonId(c, user.organizationId, qPerson);
  if ("error" in target) {
    return c.json({ error: { message: target.error, code: "BAD_REQUEST" } }, target.status);
  }
  const rows = await prisma.timeMileageClaim.findMany({
    where: {
      organizationId: user.organizationId,
      personId: target.personId,
      tripDate: { gte: r.rangeStart, lt: r.rangeEndExclusive },
    },
    orderBy: { tripDate: "asc" },
  });
  return c.json({ data: rows.map(serializeMileageClaim) });
});

timeRouter.post("/time/mileage-claims", zValidator("json", CreateTimeMileageClaimSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId || !user.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time") || !canAction(c, "time.write")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const body = c.req.valid("json");
  const country = body.country.trim().toUpperCase();
  if (!(await mileageAllowanceFeatureEnabled(user.organizationId, country))) {
    return c.json(
      {
        error: {
          message: "Mileage allowance is not enabled for this organization.",
          code: "FEATURE_DISABLED",
        },
      },
      403
    );
  }
  const personId = await resolvePersonIdForUser(user.organizationId, user.email);
  if (!personId) {
    return c.json({ error: { message: "No linked person profile.", code: "BAD_REQUEST" } }, 400);
  }
  const tripDate = new Date(body.tripDate);
  if (!Number.isFinite(tripDate.getTime())) {
    return c.json({ error: { message: "Invalid trip date", code: "BAD_REQUEST" } }, 400);
  }
  if (await findApprovedTimesheet({ organizationId: user.organizationId, personId, startsAt: tripDate, endsAt: tripDate })) {
    return c.json(
      { error: { message: "Timesheet is approved. Ask an admin to reopen it before editing mileage.", code: "TIMESHEET_APPROVED" } },
      423
    );
  }
  const vehicleType = body.vehicleType as MileageVehicleType;
  const distanceKm = body.distanceKm ?? 0;
  let calc;
  try {
    calc = await calculateMileageClaimAmounts({
      organizationId: user.organizationId,
      personId,
      vehicleType,
      distanceKm,
      tripDate,
      rateYear: body.rateYear,
      salaryReductionAgreement: body.salaryReductionAgreement,
      receivesBIncome: body.receivesBIncome,
      country,
    });
  } catch {
    return c.json({ error: { message: "Country rule set is not supported yet.", code: "UNSUPPORTED_RULE_SET" } }, 400);
  }
  const row = await prisma.timeMileageClaim.create({
    data: {
      organizationId: user.organizationId,
      personId,
      createdByUserId: user.id,
      tripDate,
      fromPlace: body.fromPlace?.trim() ?? "",
      toPlace: body.toPlace?.trim() ?? "",
      purpose: body.purpose?.trim() ?? "",
      country,
      vehicleType,
      distanceKm,
      rateYear: calc.rateYear,
      rateCentsPerKmHigh: calc.rateCentsPerKmHigh,
      rateCentsPerKmLow: calc.rateCentsPerKmLow,
      bicycleRateCentsPerKm: calc.bicycleRateCentsPerKm,
      highRateKm: calc.highRateKm,
      lowRateKm: calc.lowRateKm,
      salaryReductionAgreement: body.salaryReductionAgreement ?? false,
      receivesBIncome: body.receivesBIncome ?? false,
      timeProjectId: body.timeProjectId ?? null,
      eventId: body.eventId ?? null,
      notes: body.notes ?? null,
      totalAmountCents: calc.totalAmountCents,
    },
  });
  return c.json({ data: serializeMileageClaim(row) }, 201);
});

timeRouter.patch("/time/mileage-claims/:id", zValidator("json", PatchTimeMileageClaimSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId || !user.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const existing = await prisma.timeMileageClaim.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  if (!(await mileageAllowanceFeatureEnabled(user.organizationId, existing.country))) {
    return c.json(
      {
        error: {
          message: "Mileage allowance is not enabled for this organization.",
          code: "FEATURE_DISABLED",
        },
      },
      403
    );
  }
  const myPersonId = await resolvePersonIdForUser(user.organizationId, user.email);
  const canEditOwn = Boolean(myPersonId && existing.personId === myPersonId && canAction(c, "time.write"));
  const canEditAny = canAction(c, "time.read_all");
  if (!canEditOwn && !canEditAny) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const body = c.req.valid("json");
  const tripDate = body.tripDate !== undefined ? new Date(body.tripDate) : existing.tripDate;
  if (!Number.isFinite(tripDate.getTime())) {
    return c.json({ error: { message: "Invalid trip date", code: "BAD_REQUEST" } }, 400);
  }
  if (await findApprovedTimesheet({
    organizationId: user.organizationId,
    personId: existing.personId,
    startsAt: tripDate < existing.tripDate ? tripDate : existing.tripDate,
    endsAt: tripDate > existing.tripDate ? tripDate : existing.tripDate,
  })) {
    return c.json(
      { error: { message: "Timesheet is approved. Ask an admin to reopen it before editing mileage.", code: "TIMESHEET_APPROVED" } },
      423
    );
  }
  const vehicleType = (body.vehicleType ?? existing.vehicleType) as MileageVehicleType;
  const distanceKm = body.distanceKm ?? existing.distanceKm;
  const country = body.country !== undefined ? body.country.trim().toUpperCase() : existing.country;
  let calc;
  try {
    calc = await calculateMileageClaimAmounts({
      organizationId: user.organizationId,
      personId: existing.personId,
      excludeClaimId: existing.id,
      vehicleType,
      distanceKm,
      tripDate,
      rateYear: body.rateYear ?? existing.rateYear,
      salaryReductionAgreement: body.salaryReductionAgreement ?? existing.salaryReductionAgreement,
      receivesBIncome: body.receivesBIncome ?? existing.receivesBIncome,
      country,
    });
  } catch {
    return c.json({ error: { message: "Country rule set is not supported yet.", code: "UNSUPPORTED_RULE_SET" } }, 400);
  }
  const updated = await prisma.timeMileageClaim.update({
    where: { id },
    data: {
      tripDate,
      ...(body.fromPlace !== undefined ? { fromPlace: body.fromPlace.trim() } : {}),
      ...(body.toPlace !== undefined ? { toPlace: body.toPlace.trim() } : {}),
      ...(body.purpose !== undefined ? { purpose: body.purpose.trim() } : {}),
      country,
      vehicleType,
      distanceKm,
      rateYear: calc.rateYear,
      rateCentsPerKmHigh: calc.rateCentsPerKmHigh,
      rateCentsPerKmLow: calc.rateCentsPerKmLow,
      bicycleRateCentsPerKm: calc.bicycleRateCentsPerKm,
      highRateKm: calc.highRateKm,
      lowRateKm: calc.lowRateKm,
      ...(body.salaryReductionAgreement !== undefined ? { salaryReductionAgreement: body.salaryReductionAgreement } : {}),
      ...(body.receivesBIncome !== undefined ? { receivesBIncome: body.receivesBIncome } : {}),
      ...(body.timeProjectId !== undefined ? { timeProjectId: body.timeProjectId } : {}),
      ...(body.eventId !== undefined ? { eventId: body.eventId } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      totalAmountCents: calc.totalAmountCents,
    },
  });
  return c.json({ data: serializeMileageClaim(updated) });
});

timeRouter.delete("/time/mileage-claims/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const id = c.req.param("id");
  const existing = await prisma.timeMileageClaim.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  if (!(await mileageAllowanceFeatureEnabled(user.organizationId, existing.country))) {
    return c.json(
      {
        error: {
          message: "Mileage allowance is not enabled for this organization.",
          code: "FEATURE_DISABLED",
        },
      },
      403
    );
  }
  const myPersonId = await resolvePersonIdForUser(user.organizationId, user.email);
  const canDelOwn = Boolean(myPersonId && existing.personId === myPersonId && canAction(c, "time.write"));
  const canDelAny = canAction(c, "time.read_all");
  if (!canDelOwn && !canDelAny) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  if (await findApprovedTimesheet({
    organizationId: user.organizationId,
    personId: existing.personId,
    startsAt: existing.tripDate,
    endsAt: existing.tripDate,
  })) {
    return c.json(
      { error: { message: "Timesheet is approved. Ask an admin to reopen it before deleting mileage.", code: "TIMESHEET_APPROVED" } },
      423
    );
  }
  await prisma.timeMileageClaim.delete({ where: { id } });
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
  return c.json({ data: rows.map((row) => serializeTimesheetApproval(row)) });
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

  const compSettlement = await settleCompTimeForTimesheetApproval({
    organizationId: user.organizationId,
    personId: target.personId,
    periodStart,
    periodEnd,
    timesheetApprovalId: row.id,
    createdByUserId: user.id,
  });

  return c.json({
    data: serializeTimesheetApproval(
      row,
      compSettlement.dailyNormMinutes > 0 ? compSettlement : undefined
    ),
  });
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

  if (existing.status === "approved") {
    await reverseCompTimeForTimesheetReopen({
      organizationId: user.organizationId,
      timesheetApprovalId: existing.id,
      createdByUserId: user.id,
    });
  }

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
