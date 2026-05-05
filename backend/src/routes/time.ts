import { Hono } from "hono";
import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { canAction, canView } from "../requestRole";
import type { EffectiveRole } from "../effectiveRole";
import { isPostgresDatabaseUrl } from "../databaseUrl";
import {
  CreateTimeTagSchema,
  PatchTimeTagSchema,
  CreateTimeProjectSchema,
  PatchTimeProjectSchema,
  CreateTimeEntrySchema,
  PatchTimeEntrySchema,
  SetPersonContractSchema,
  TIME_CATEGORIES,
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
 * Ensure every org event and performance has a matching TimeProject row so they appear
 * in pickers without manual "link" steps. Names: event title for whole event;
 * "{title} · {date}" for each show.
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
  eventId: string | null;
  eventShowId: string | null;
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
  timeProjectId: string | null;
  note: string | null;
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
    category: (row.category || "work") as "work" | "vacation" | "sick" | "holiday",
    eventShowJobId: row.eventShowJobId,
    eventId: row.eventId,
    timeProjectId: row.timeProjectId,
    note: row.note,
    tagIds: row.tagLinks.map((t) => t.timeTagId),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
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
    weeklyContractHours: number | null;
    vacationDaysPerYear: number | null;
  };
  type ProjectAgg = { projectName: string; workMinutes: number; totalMinutes: number };
  type DayAgg = {
    workMinutes: number;
    vacationMinutes: number;
    sickMinutes: number;
    holidayMinutes: number;
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
        weeklyContractHours: row.person.weeklyContractHours ?? null,
        vacationDaysPerYear: row.person.vacationDaysPerYear ?? null,
      });
    }
    const pa = byPerson.get(row.personId)!;
    if (cat === "work") pa.workMinutes += durMin;
    else if (cat === "vacation") pa.vacationMinutes += durMin;
    else if (cat === "sick") pa.sickMinutes += durMin;
    else if (cat === "holiday") pa.holidayMinutes += durMin;

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
      byDay.set(dateKey, { workMinutes: 0, vacationMinutes: 0, sickMinutes: 0, holidayMinutes: 0 });
    }
    const dp = byDay.get(dateKey)!;
    if (cat === "work") dp.workMinutes += durMin;
    else if (cat === "vacation") dp.vacationMinutes += durMin;
    else if (cat === "sick") dp.sickMinutes += durMin;
    else if (cat === "holiday") dp.holidayMinutes += durMin;
  }

  const byPersonArr = [...byPerson.entries()].map(([personId, pa]) => {
    const total = pa.workMinutes + pa.vacationMinutes + pa.sickMinutes + pa.holidayMinutes;
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
      totalMinutes: dp.workMinutes + dp.vacationMinutes + dp.sickMinutes + dp.holidayMinutes,
      workMinutes: dp.workMinutes,
      vacationMinutes: dp.vacationMinutes,
      sickMinutes: dp.sickMinutes,
      holidayMinutes: dp.holidayMinutes,
    }));

  const summaryWork = byPersonArr.reduce((s, p) => s + p.workMinutes, 0);
  const summaryVac = byPersonArr.reduce((s, p) => s + p.vacationMinutes, 0);
  const summarySick = byPersonArr.reduce((s, p) => s + p.sickMinutes, 0);
  const summaryHoliday = byPersonArr.reduce((s, p) => s + p.holidayMinutes, 0);

  const entries = rows.map((row) => ({
    id: row.id,
    personId: row.personId,
    personName: row.person.name,
    startsAt: iso(row.startsAt),
    endsAt: iso(row.endsAt),
    durationMinutes: Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60_000),
    kind: row.kind,
    category: (row.category || "work") as "work" | "vacation" | "sick" | "holiday",
    note: row.note,
    projectId: row.timeProjectId,
    projectName: row.timeProject?.name ?? null,
    tagIds: row.tagLinks.map((t) => t.timeTagId),
    tagNames: row.tagLinks.map((t) => t.timeTag.name),
  }));

  return c.json({
    data: {
      summary: {
        totalMinutes: summaryWork + summaryVac + summarySick + summaryHoliday,
        workMinutes: summaryWork,
        vacationMinutes: summaryVac,
        sickMinutes: summarySick,
        holidayMinutes: summaryHoliday,
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

  const row = await prisma.timeProject.create({
    data: {
      organizationId: user.organizationId,
      name: body.name.trim(),
      eventId,
      eventShowId,
      sortOrder: body.sortOrder ?? 0,
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
  const row = await prisma.timeProject.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.eventId !== undefined ? { eventId: body.eventId } : {}),
      ...(body.eventShowId !== undefined ? { eventShowId: body.eventShowId } : {}),
      ...(body.isArchived !== undefined ? { isArchived: body.isArchived } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
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

  const data = jobs.map((j) => {
    const plannedStart = toDateTimeFromDateAndTime(j.jobDate.toISOString(), j.startTime);
    const plannedEnd =
      plannedStart != null
        ? new Date(plannedStart.getTime() + j.durationMinutes * 60_000)
        : null;
    return {
      id: j.id,
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
    };
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
    take: limit,
  });

  const data = jobs.map((j) => {
    const plannedStart = toDateTimeFromDateAndTime(j.jobDate.toISOString(), j.startTime);
    const plannedEnd =
      plannedStart != null
        ? new Date(plannedStart.getTime() + j.durationMinutes * 60_000)
        : null;
    return {
      id: j.id,
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
    };
  });
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

  let eventShowJobId: string | null = body.eventShowJobId ?? null;
  let eventId: string | null = body.eventId ?? null;

  if (body.kind === "job") {
    if (!eventShowJobId) {
      return c.json({ error: { message: "Job entries require eventShowJobId", code: "BAD_REQUEST" } }, 400);
    }
    const job = await prisma.eventShowJob.findFirst({
      where: {
        id: eventShowJobId,
        personId: myPersonId,
        show: { event: { organizationId: user.organizationId } },
      },
      include: { show: { select: { eventId: true } } },
    });
    if (!job) {
      return c.json({ error: { message: "Job not found or not assigned to you", code: "NOT_FOUND" } }, 404);
    }
    eventId = job.show.eventId;
    const existing = await prisma.timeEntry.findFirst({
      where: { personId: myPersonId, eventShowJobId },
      include: { tagLinks: { select: { timeTagId: true } } },
    });
    const tagIds = body.tagIds ?? [];
    if (tagIds.length) {
      const count = await prisma.timeTag.count({
        where: { organizationId: user.organizationId, id: { in: tagIds } },
      });
      if (count !== tagIds.length) {
        return c.json({ error: { message: "Invalid tag id", code: "BAD_REQUEST" } }, 400);
      }
    }
    if (body.timeProjectId) {
      const p = await prisma.timeProject.findFirst({
        where: { id: body.timeProjectId, organizationId: user.organizationId },
      });
      if (!p) return c.json({ error: { message: "Project not found", code: "NOT_FOUND" } }, 404);
    }

    if (existing) {
      const updated = await prisma.timeEntry.update({
        where: { id: existing.id },
        data: {
          startsAt,
          endsAt,
          category: body.category ?? "work",
          timeProjectId: body.timeProjectId ?? null,
          note: body.note ?? null,
          tagLinks: {
            deleteMany: {},
            createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) },
          },
        },
        include: { tagLinks: { select: { timeTagId: true } } },
      });
      return c.json({ data: serializeEntry(updated) });
    }

    const created = await prisma.timeEntry.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        personId: myPersonId,
        startsAt,
        endsAt,
        kind: "job",
        category: body.category ?? "work",
        eventShowJobId,
        eventId,
        timeProjectId: body.timeProjectId ?? null,
        note: body.note ?? null,
        tagLinks: { createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) } },
      },
      include: { tagLinks: { select: { timeTagId: true } } },
    });
    return c.json({ data: serializeEntry(created) });
  }

  // custom
  if (eventShowJobId) {
    return c.json({ error: { message: "Custom entries cannot reference a job", code: "BAD_REQUEST" } }, 400);
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

  const created = await prisma.timeEntry.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      personId: myPersonId,
      startsAt,
      endsAt,
      kind: "custom",
      category: body.category ?? "work",
      eventShowJobId: null,
      eventId,
      timeProjectId: body.timeProjectId ?? null,
      note: body.note ?? null,
      tagLinks: { createMany: { data: tagIds.map((timeTagId) => ({ timeTagId })) } },
    },
    include: { tagLinks: { select: { timeTagId: true } } },
  });
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

  const startsAt = body.startsAt !== undefined ? new Date(body.startsAt) : existing.startsAt;
  const endsAt = body.endsAt !== undefined ? new Date(body.endsAt) : existing.endsAt;
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    return c.json({ error: { message: "Invalid time range", code: "BAD_REQUEST" } }, 400);
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

  const updated = await prisma.timeEntry.update({
    where: { id },
    data: {
      ...(body.startsAt !== undefined ? { startsAt } : {}),
      ...(body.endsAt !== undefined ? { endsAt } : {}),
      ...(body.kind !== undefined ? { kind: body.kind } : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
      ...(body.eventShowJobId !== undefined ? { eventShowJobId: body.eventShowJobId } : {}),
      ...(body.eventId !== undefined ? { eventId: body.eventId } : {}),
      ...(body.timeProjectId !== undefined ? { timeProjectId: body.timeProjectId } : {}),
      ...(body.note !== undefined ? { note: body.note } : {}),
      ...(body.tagIds !== undefined
        ? {
            tagLinks: {
              deleteMany: {},
              createMany: { data: body.tagIds.map((timeTagId) => ({ timeTagId })) },
            },
          }
        : {}),
    },
    include: { tagLinks: { select: { timeTagId: true } } },
  });
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
  await prisma.timeEntry.delete({ where: { id } });
  return c.json({ ok: true });
});

export default timeRouter;
