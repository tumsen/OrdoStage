import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { canAction, canView } from "../requestRole";
import type { EffectiveRole } from "../effectiveRole";
import {
  getClientWallClockZone,
  startOfLocalCalendarDayInZone,
  wallClockInstantFromDateIsoAndHHMM,
} from "../clientWallClock";
import { setJobAssignees, syncJobToSchedule } from "../lib/eventShowJobAssignees";

const staffingRouter = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    effectiveRole?: EffectiveRole;
  };
}>();

function iso(d: Date) {
  return d.toISOString();
}

function parseYmd(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d : fallback;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

const toDateTimeFromDateAndTime = wallClockInstantFromDateIsoAndHHMM;

const AssignStaffingJobSchema = z.object({
  personId: z.string().nullable(),
});

staffingRouter.get("/staffing", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "staffing") && !canView(c, "schedule") && !canView(c, "events")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const today = new Date();
  const todayStart = startOfLocalCalendarDayInZone(today, getClientWallClockZone());
  const mode = c.req.query("mode") === "upcoming" ? "upcoming" : "range";
  const limitRaw = Number.parseInt(c.req.query("limit") ?? "200", 10);
  const limit = Math.max(25, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 200));
  const fromDate = parseYmd(c.req.query("from"), todayStart);
  const toDateExclusive =
    mode === "upcoming" ? null : addDays(parseYmd(c.req.query("to"), addDays(todayStart, 13)), 1);

  const [jobs, people] = await Promise.all([
    prisma.eventShowJob.findMany({
      where: {
        jobDate: {
          gte: fromDate,
          ...(toDateExclusive ? { lt: toDateExclusive } : {}),
        },
        show: { event: { organizationId: user.organizationId } },
      },
      include: {
        person: { select: { id: true, name: true, email: true } },
        assignments: {
          orderBy: { slotIndex: "asc" },
          include: { person: { select: { id: true, name: true, email: true } } },
        },
        department: { select: { id: true, name: true, color: true } },
        venue: { select: { id: true, name: true } },
        show: {
          select: {
            id: true,
            showDate: true,
            showTime: true,
            status: true,
            event: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: [{ jobDate: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }],
      ...(mode === "upcoming" ? { take: limit } : {}),
    }),
    prisma.person.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const entries = await prisma.timeEntry.findMany({
    where: {
      organizationId: user.organizationId,
      eventShowJobId: { in: jobs.map((j) => j.id) },
      ...(toDateExclusive
        ? {
            startsAt: { lt: toDateExclusive },
            endsAt: { gt: fromDate },
          }
        : {}),
    },
    select: { eventShowJobId: true, startsAt: true, endsAt: true },
  });
  const actualMinutesByJob = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.eventShowJobId) continue;
    const minutes = Math.max(0, Math.round((entry.endsAt.getTime() - entry.startsAt.getTime()) / 60_000));
    actualMinutesByJob.set(entry.eventShowJobId, (actualMinutesByJob.get(entry.eventShowJobId) ?? 0) + minutes);
  }
  const intervals = jobs
    .map((job) => {
      const start = toDateTimeFromDateAndTime(job.jobDate.toISOString(), job.startTime);
      if (!start) return null;
      return {
        job,
        start,
        end: new Date(start.getTime() + job.durationMinutes * 60_000),
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const jobPersonIds = (job: (typeof jobs)[0]) =>
    job.assignments.length > 0
      ? job.assignments.map((a) => a.personId)
      : job.personId
        ? [job.personId]
        : [];

  const conflictIds = new Set<string>();
  for (let i = 0; i < intervals.length; i++) {
    const a = intervals[i]!;
    const aPeople = jobPersonIds(a.job);
    if (aPeople.length === 0) continue;
    for (let j = i + 1; j < intervals.length; j++) {
      const b = intervals[j]!;
      const bPeople = jobPersonIds(b.job);
      const shared = aPeople.some((pid) => bPeople.includes(pid));
      if (!shared) continue;
      if (a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime()) {
        conflictIds.add(a.job.id);
        conflictIds.add(b.job.id);
      }
    }
  }

  const requirements = intervals.map(({ job, start, end }) => {
    const assignees = job.assignments.map((a) => a.person);
    const primary = assignees[0] ?? job.person;
    return {
      id: job.id,
      title: job.title,
      eventId: job.show.event.id,
      eventTitle: job.show.event.title,
      showId: job.show.id,
      showDate: iso(job.show.showDate),
      showTime: job.show.showTime,
      showStatus: job.show.status,
      startsAt: iso(start),
      endsAt: iso(end),
      durationMinutes: job.durationMinutes,
      venueId: job.venueId,
      venueName: job.venue.name,
      departmentId: job.departmentId,
      departmentName: job.department?.name ?? null,
      departmentColor: job.department?.color ?? null,
      personId: primary?.id ?? null,
      personName: primary?.name ?? null,
      personNames: assignees.map((p) => p.name),
      personIds: assignees.map((p) => p.id),
      peopleNeeded: job.peopleNeeded ?? 1,
      actualMinutes: actualMinutesByJob.get(job.id) ?? 0,
      hasConflict: conflictIds.has(job.id),
    };
  });

  const workloadByPerson = new Map<string, { planned: number; actual: number; conflicts: number; jobs: number }>();
  for (const person of people) workloadByPerson.set(person.id, { planned: 0, actual: 0, conflicts: 0, jobs: 0 });
  for (const req of requirements) {
    const ids = req.personIds.length > 0 ? req.personIds : req.personId ? [req.personId] : [];
    for (const pid of ids) {
      const row = workloadByPerson.get(pid) ?? { planned: 0, actual: 0, conflicts: 0, jobs: 0 };
      row.planned += req.durationMinutes;
      row.actual += req.actualMinutes;
      row.jobs += 1;
      if (req.hasConflict) row.conflicts += 1;
      workloadByPerson.set(pid, row);
    }
  }

  return c.json({
    data: {
      people: people.map((p) => ({ ...p, ...(workloadByPerson.get(p.id) ?? { planned: 0, actual: 0, conflicts: 0, jobs: 0 }) })),
      requirements,
      summary: {
        total: requirements.length,
        unassigned: requirements.filter((r) => r.personIds.length < (r.peopleNeeded ?? 1)).length,
        conflicts: requirements.filter((r) => r.hasConflict).length,
        plannedMinutes: requirements.reduce((sum, r) => sum + r.durationMinutes, 0),
        actualMinutes: requirements.reduce((sum, r) => sum + r.actualMinutes, 0),
      },
    },
  });
});

staffingRouter.patch("/staffing/jobs/:jobId", zValidator("json", AssignStaffingJobSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "write.events") && !canAction(c, "time.read_all")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const jobId = c.req.param("jobId");
  const body = c.req.valid("json");
  const job = await prisma.eventShowJob.findFirst({
    where: { id: jobId, show: { event: { organizationId: user.organizationId } } },
    select: { id: true },
  });
  if (!job) return c.json({ error: { message: "Job not found", code: "NOT_FOUND" } }, 404);
  if (body.personId) {
    const person = await prisma.person.findFirst({
      where: { id: body.personId, organizationId: user.organizationId, isActive: true },
      select: { id: true },
    });
    if (!person) return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }
  const personIds = body.personId ? [body.personId] : [];
  await setJobAssignees(jobId, personIds, user.organizationId);
  await syncJobToSchedule(jobId);
  return c.json({ data: { ok: true } });
});

export default staffingRouter;
