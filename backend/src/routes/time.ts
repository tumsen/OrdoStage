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
    eventShowJobId: row.eventShowJobId,
    eventId: row.eventId,
    timeProjectId: row.timeProjectId,
    note: row.note,
    tagIds: row.tagLinks.map((t) => t.timeTagId),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

// GET /api/time/people — directory for admin filter
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
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  return c.json({ data: people });
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
  if (body.eventId) {
    const ev = await prisma.event.findFirst({
      where: { id: body.eventId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!ev) return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  }
  const row = await prisma.timeProject.create({
    data: {
      organizationId: user.organizationId,
      name: body.name.trim(),
      eventId: body.eventId ?? null,
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
  if (body.eventId) {
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
