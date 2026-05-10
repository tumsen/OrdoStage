import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { canAction, canView } from "../requestRole";
import type { EffectiveRole } from "../effectiveRole";

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

function toDateTimeFromDateAndTime(dateIso: string, hhmm: string): Date | null {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return null;
  const [hhRaw, mmRaw] = hhmm.split(":");
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh, mm, 0, 0));
}

async function syncJobToSchedule(jobId: string): Promise<void> {
  const job = await prisma.eventShowJob.findUnique({
    where: { id: jobId },
    include: {
      person: { select: { id: true, organizationId: true, name: true } },
      show: { include: { event: true } },
    },
  });
  if (!job) return;
  const marker = `[event-show-job:${job.id}]`;
  const existing = await prisma.internalBooking.findFirst({
    where: {
      organizationId: job.show.event.organizationId,
      title: { startsWith: marker },
    },
    select: { id: true },
  });

  if (!job.personId || !job.person) {
    if (existing?.id) await prisma.internalBooking.delete({ where: { id: existing.id } });
    return;
  }

  const startDate = toDateTimeFromDateAndTime(job.jobDate.toISOString(), job.startTime);
  if (!startDate) return;
  const endDate = new Date(startDate.getTime() + job.durationMinutes * 60_000);
  const title = `${marker} ${job.show.event.title} - ${job.title} - ${job.person.name}`;
  const bookingId =
    existing?.id ??
    (
      await prisma.internalBooking.create({
        data: {
          organizationId: job.person.organizationId,
          title,
          description: null,
          startDate,
          endDate,
          type: "other",
          venueId: job.venueId || null,
        },
        select: { id: true },
      })
    ).id;

  await prisma.internalBooking.update({
    where: { id: bookingId },
    data: { title, description: null, startDate, endDate, venueId: job.venueId || null },
  });
  await prisma.internalBookingPerson.deleteMany({ where: { bookingId } });
  await prisma.internalBookingPerson.create({ data: { bookingId, personId: job.personId, role: null } });
}

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
  const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
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

  const conflictIds = new Set<string>();
  for (let i = 0; i < intervals.length; i++) {
    const a = intervals[i]!;
    if (!a.job.personId) continue;
    for (let j = i + 1; j < intervals.length; j++) {
      const b = intervals[j]!;
      if (a.job.personId !== b.job.personId) continue;
      if (a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime()) {
        conflictIds.add(a.job.id);
        conflictIds.add(b.job.id);
      }
    }
  }

  const requirements = intervals.map(({ job, start, end }) => ({
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
    personId: job.personId,
    personName: job.person?.name ?? null,
    actualMinutes: actualMinutesByJob.get(job.id) ?? 0,
    hasConflict: conflictIds.has(job.id),
  }));

  const workloadByPerson = new Map<string, { planned: number; actual: number; conflicts: number; jobs: number }>();
  for (const person of people) workloadByPerson.set(person.id, { planned: 0, actual: 0, conflicts: 0, jobs: 0 });
  for (const req of requirements) {
    if (!req.personId) continue;
    const row = workloadByPerson.get(req.personId) ?? { planned: 0, actual: 0, conflicts: 0, jobs: 0 };
    row.planned += req.durationMinutes;
    row.actual += req.actualMinutes;
    row.jobs += 1;
    if (req.hasConflict) row.conflicts += 1;
    workloadByPerson.set(req.personId, row);
  }

  return c.json({
    data: {
      people: people.map((p) => ({ ...p, ...(workloadByPerson.get(p.id) ?? { planned: 0, actual: 0, conflicts: 0, jobs: 0 }) })),
      requirements,
      summary: {
        total: requirements.length,
        unassigned: requirements.filter((r) => !r.personId).length,
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
  await prisma.eventShowJob.update({
    where: { id: jobId },
    data: { personId: body.personId },
  });
  await syncJobToSchedule(jobId);
  return c.json({ data: { ok: true } });
});

export default staffingRouter;
