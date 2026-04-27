import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import {
  CreateEventSchema,
  CreateEventShowSchema,
  UpdateEventSchema,
  UpdateEventShowSchema,
  AssignPersonSchema,
  UpsertEventShowStaffingSchema,
  AddEventTeamSchema,
  CreateEventTeamNoteSchema,
  UpdateEventTeamNoteSchema,
} from "../types";
import { canAction } from "../requestRole";

const eventsRouter = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();
const prismaAny = prisma as any;

async function userOrgRole(userId: string): Promise<string | null> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: { orgRole: true } });
  return row?.orgRole ?? null;
}

function isOrgOwnerOrAdmin(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

async function actorTeamIds(organizationId: string, email: string | undefined): Promise<string[]> {
  const normalized = (email || "").trim();
  if (!normalized) return [];
  const person = await prisma.person.findFirst({
    where: { organizationId, email: { equals: normalized, mode: "insensitive" } },
    select: { teamMemberships: { select: { departmentId: true } } },
  });
  return person?.teamMemberships.map((m) => m.departmentId) ?? [];
}

async function ensureEventOwnerTeam(eventId: string, organizationId: string): Promise<string | null> {
  const event = await prismaAny.event.findUnique({
    where: { id: eventId, organizationId },
    select: { id: true, ownerTeamId: true },
  });
  if (!event) return null;

  if (event.ownerTeamId) {
    await prismaAny.eventTeam.upsert({
      where: { eventId_teamId: { eventId, teamId: event.ownerTeamId } },
      update: { isOwner: true },
      create: { eventId, teamId: event.ownerTeamId, isOwner: true },
    });
    return event.ownerTeamId;
  }

  const booking = await prisma.department.findFirst({
    where: { organizationId, name: { equals: "booking", mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const fallback =
    booking ??
    (await prisma.department.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }));
  if (!fallback?.id) return null;

  await prismaAny.event.update({
    where: { id: eventId },
    data: { ownerTeamId: fallback.id },
  });
  await prismaAny.eventTeam.upsert({
    where: { eventId_teamId: { eventId, teamId: fallback.id } },
    update: { isOwner: true },
    create: { eventId, teamId: fallback.id, isOwner: true },
  });
  return fallback.id;
}

async function canManageEventAsOwnerTeam(input: {
  organizationId: string;
  userId: string;
  userEmail?: string;
  eventId: string;
}): Promise<boolean> {
  const role = await userOrgRole(input.userId);
  if (isOrgOwnerOrAdmin(role)) return true;
  const ownerTeamId = await ensureEventOwnerTeam(input.eventId, input.organizationId);
  if (!ownerTeamId) return false;
  const teams = await actorTeamIds(input.organizationId, input.userEmail);
  return teams.includes(ownerTeamId);
}

async function canAccessEventTeam(input: {
  organizationId: string;
  eventId: string;
  userId: string;
  userEmail?: string;
  eventTeamId: string;
}): Promise<boolean> {
  const role = await userOrgRole(input.userId);
  if (isOrgOwnerOrAdmin(role)) return true;
  const actorTeams = await actorTeamIds(input.organizationId, input.userEmail);
  const ownerTeamId = await ensureEventOwnerTeam(input.eventId, input.organizationId);
  const target = await prismaAny.eventTeam.findFirst({
    where: { id: input.eventTeamId, eventId: input.eventId },
    select: { teamId: true },
  });
  if (!target) return false;
  if (ownerTeamId && actorTeams.includes(ownerTeamId)) return true;
  return actorTeams.includes(target.teamId);
}

async function canReadEventCollaboration(input: {
  organizationId: string;
  eventId: string;
  userId: string;
  userEmail?: string;
}): Promise<boolean> {
  const role = await userOrgRole(input.userId);
  if (isOrgOwnerOrAdmin(role)) return true;
  const actorTeams = await actorTeamIds(input.organizationId, input.userEmail);
  if (actorTeams.length === 0) return false;
  const eventTeams = await prismaAny.eventTeam.findMany({
    where: { eventId: input.eventId },
    select: { teamId: true },
  });
  if (eventTeams.length === 0) return false;
  const eventTeamIds = new Set(eventTeams.map((t: { teamId: string }) => t.teamId));
  return actorTeams.some((t) => eventTeamIds.has(t));
}

function serializeEvent(event: {
  id: string;
  title: string;
  description: string | null;
  startDate: Date;
  endDate: Date | null;
  status: string;
  venueId: string | null;
  organizationId: string;
  tags: string | null;
  contactPerson: string | null;
  getInTime: string | null;
  setupTime: string | null;
  stageSize: string | null;
  actorCount: number | null;
  allergies: string | null;
  customFields: string | null;
  ownerTeamId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    startDate: event.startDate.toISOString(),
    endDate: event.endDate ? event.endDate.toISOString() : null,
    status: event.status,
    venueId: event.venueId,
    tags: event.tags,
    contactPerson: event.contactPerson,
    getInTime: event.getInTime,
    setupTime: event.setupTime,
    stageSize: event.stageSize,
    actorCount: event.actorCount,
    allergies: event.allergies,
    customFields: event.customFields,
    ownerTeamId: event.ownerTeamId ?? null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

function serializeVenue(venue: {
  id: string;
  name: string;
  addressStreet:  string | null;
  addressNumber:  string | null;
  addressZip:     string | null;
  addressCity:    string | null;
  addressState:   string | null;
  addressCountry: string | null;
  capacity: number | null;
  notes: string | null;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
} | null) {
  if (!venue) return null;
  return {
    ...venue,
    createdAt: venue.createdAt.toISOString(),
    updatedAt: venue.updatedAt.toISOString(),
  };
}

function serializePerson(person: {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  departmentId: string | null;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: person.id,
    name: person.name,
    role: person.role,
    email: person.email,
    phone: person.phone,
    departmentId: person.departmentId,
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
  };
}

function serializeDocument(doc: {
  id: string;
  eventId: string;
  name: string;
  type: string;
  filename: string;
  mimeType: string;
  createdAt: Date;
}) {
  return {
    ...doc,
    createdAt: doc.createdAt.toISOString(),
  };
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

async function syncStaffingToSchedule(staffingId: string): Promise<void> {
  const staffing = await prismaAny.eventShowStaffing.findUnique({
    where: { id: staffingId },
    include: {
      person: { select: { id: true, organizationId: true, name: true } },
      show: { include: { event: true } },
    },
  });
  if (!staffing) return;
  if (!staffing.meetingTime || !staffing.meetingDurationMinutes) return;
  const startDate = toDateTimeFromDateAndTime(staffing.show.showDate.toISOString(), staffing.meetingTime);
  if (!startDate) return;
  const endDate = new Date(startDate.getTime() + staffing.meetingDurationMinutes * 60 * 1000);
  const marker = `[event-show-staffing:${staffing.id}]`;
  const title = `${marker} ${staffing.show.event.title} - ${staffing.person.name}`;

  const existing = await prisma.internalBooking.findFirst({
    where: {
      organizationId: staffing.person.organizationId,
      title: { startsWith: marker },
    },
    select: { id: true },
  });

  if (!existing) {
    const booking = await prisma.internalBooking.create({
      data: {
        organizationId: staffing.person.organizationId,
        title,
        description: staffing.notes || null,
        startDate,
        endDate,
        type: "other",
        venueId: staffing.show.venueId || null,
      },
    });
    await prisma.internalBookingPerson.upsert({
      where: { bookingId_personId: { bookingId: booking.id, personId: staffing.personId } },
      create: { bookingId: booking.id, personId: staffing.personId, role: staffing.role ?? null },
      update: { role: staffing.role ?? null },
    });
    return;
  }

  await prisma.internalBooking.update({
    where: { id: existing.id },
    data: {
      title,
      description: staffing.notes || null,
      startDate,
      endDate,
      venueId: staffing.show.venueId || null,
    },
  });
  await prisma.internalBookingPerson.upsert({
    where: { bookingId_personId: { bookingId: existing.id, personId: staffing.personId } },
    create: { bookingId: existing.id, personId: staffing.personId, role: staffing.role ?? null },
    update: { role: staffing.role ?? null },
  });
}

async function removeStaffingFromSchedule(staffingId: string, organizationId: string): Promise<void> {
  const marker = `[event-show-staffing:${staffingId}]`;
  const booking = await prisma.internalBooking.findFirst({
    where: {
      organizationId,
      title: { startsWith: marker },
    },
    select: { id: true },
  });
  if (!booking) return;
  await prisma.internalBooking.delete({ where: { id: booking.id } });
}

const eventInclude: any = {
  venue: true,
  people: {
    include: { person: true },
  },
  documents: {
    select: {
      id: true,
      eventId: true,
      name: true,
      type: true,
      filename: true,
      mimeType: true,
      createdAt: true,
    },
  },
  shows: {
    include: {
      venue: true,
      teamResponsible: true,
      staffing: {
        include: {
          person: true,
        },
      },
    },
    orderBy: [{ showDate: "asc" }, { showTime: "asc" }],
  },
  teams: {
    include: {
      team: {
        select: { id: true, name: true, color: true },
      },
    },
    orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
  },
  teamNotes: {
    orderBy: { createdAt: "asc" },
  },
};

function serializeFullEvent(event: any) {
  return {
    ...serializeEvent(event),
    venue: serializeVenue(event.venue),
    people: event.people.map((ep: any) => ({
      id: ep.id,
      eventId: ep.eventId,
      personId: ep.personId,
      role: ep.role,
      person: serializePerson(ep.person),
    })),
    documents: event.documents.map(serializeDocument),
    shows: event.shows.map((show: any) => ({
      id: show.id,
      eventId: show.eventId,
      showDate: show.showDate.toISOString(),
      showTime: show.showTime,
      durationMinutes: show.durationMinutes,
      venueId: show.venueId,
      venue: serializeVenue(show.venue)!,
      technicalNotes: show.technicalNotes,
      fohNotes: show.fohNotes,
      ticketNotes: show.ticketNotes,
      hospitalityNotes: show.hospitalityNotes,
      teamResponsibleId: show.teamResponsibleId,
      teamResponsible: show.teamResponsible ? serializePerson(show.teamResponsible) : null,
      getInTime: show.getInTime,
      getInDurationMinutes: show.getInDurationMinutes,
      getOutTime: show.getOutTime,
      getOutDurationMinutes: show.getOutDurationMinutes,
      rehearsalTime: show.rehearsalTime,
      rehearsalDurationMinutes: show.rehearsalDurationMinutes,
      soundcheckTime: show.soundcheckTime,
      soundcheckDurationMinutes: show.soundcheckDurationMinutes,
      breakTime: show.breakTime,
      breakDurationMinutes: show.breakDurationMinutes,
      notes: show.notes,
      staffing: show.staffing.map((s: any) => ({
        id: s.id,
        showId: s.showId,
        personId: s.personId,
        role: s.role,
        meetingTime: s.meetingTime,
        meetingDurationMinutes: s.meetingDurationMinutes,
        notes: s.notes,
        person: serializePerson(s.person),
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      createdAt: show.createdAt.toISOString(),
      updatedAt: show.updatedAt.toISOString(),
    })),
    teams: (event.teams ?? []).map((teamRow: any) => ({
      id: teamRow.id,
      eventId: teamRow.eventId,
      teamId: teamRow.teamId,
      isOwner: Boolean(teamRow.isOwner),
      createdAt: teamRow.createdAt.toISOString(),
      team: {
        id: teamRow.team.id,
        name: teamRow.team.name,
        color: teamRow.team.color,
      },
    })),
    teamNotes: (event.teamNotes ?? []).map((n: any) => ({
      id: n.id,
      eventId: n.eventId,
      fromTeamId: n.fromTeamId,
      toTeamId: n.toTeamId,
      body: n.body,
      createdByUserId: n.createdByUserId ?? null,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
    })),
  };
}

// GET /api/events
eventsRouter.get("/events", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const { status, venueId, from, to } = c.req.query();

  const where: Record<string, unknown> = { organizationId: user.organizationId };
  if (status) where.status = status;
  if (venueId) where.venueId = venueId;
  if (from || to) {
    where.startDate = {};
    if (from) (where.startDate as Record<string, unknown>).gte = new Date(from);
    if (to) (where.startDate as Record<string, unknown>).lte = new Date(to);
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { startDate: "asc" },
    include: eventInclude,
  });

  return c.json({ data: events.map(serializeFullEvent) });
});

// POST /api/events
eventsRouter.post("/events", zValidator("json", CreateEventSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canAction(c, "write.events")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const body = c.req.valid("json");
  const event = await prismaAny.event.create({
    data: {
      title: body.title,
      description: body.description ?? null,
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : null,
      status: body.status ?? "draft",
      venueId: body.venueId ?? null,
      tags: body.tags ?? null,
      contactPerson: body.contactPerson ?? null,
      getInTime: body.getInTime ?? null,
      setupTime: body.setupTime ?? null,
      stageSize: body.stageSize ?? null,
      actorCount: body.actorCount ?? null,
      allergies: body.allergies ?? null,
      customFields: body.customFields ?? null,
      ownerTeamId: null,
      organizationId: user.organizationId,
    },
    include: eventInclude,
  });

  let ownerTeamId = body.ownerTeamId ?? null;
  if (ownerTeamId) {
    const ownerTeam = await prisma.department.findFirst({
      where: { id: ownerTeamId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!ownerTeam) {
      return c.json({ error: { message: "Owner team not found", code: "NOT_FOUND" } }, 404);
    }
  } else {
    ownerTeamId =
      (await prisma.department.findFirst({
        where: { organizationId: user.organizationId, name: { equals: "booking", mode: "insensitive" } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      }))?.id ??
      (await prisma.department.findFirst({
        where: { organizationId: user.organizationId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      }))?.id ??
      null;
  }
  if (ownerTeamId) {
    const teamSet = new Set([ownerTeamId, ...(body.teamIds ?? [])]);
    await prismaAny.event.update({
      where: { id: event.id },
      data: { ownerTeamId },
    });
    await Promise.all(
      Array.from(teamSet).map((teamId) =>
        prismaAny.eventTeam.upsert({
          where: { eventId_teamId: { eventId: event.id, teamId } },
          update: { isOwner: teamId === ownerTeamId },
          create: { eventId: event.id, teamId, isOwner: teamId === ownerTeamId },
        })
      )
    );
  }

  return c.json({ data: serializeFullEvent(event) }, 201);
});

// GET /api/events/:id
eventsRouter.get("/events/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const { id } = c.req.param();
  const event = await prisma.event.findUnique({
    where: { id, organizationId: user.organizationId },
    include: eventInclude,
  });

  if (!event) {
    return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  }

  return c.json({ data: serializeFullEvent(event) });
});

// PUT /api/events/:id
eventsRouter.put("/events/:id", zValidator("json", UpdateEventSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canAction(c, "write.events")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const body = c.req.valid("json");

  const existing = await prisma.event.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) {
    return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  }

  if (body.status === "confirmed") {
    const showCount = await prismaAny.eventShow.count({ where: { eventId: id } });
    if (showCount < 1) {
      return c.json(
        { error: { message: "An event must have at least one show before it can be confirmed", code: "BAD_REQUEST" } },
        400
      );
    }
  }

  const event = await prisma.event.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.startDate !== undefined && { startDate: new Date(body.startDate) }),
      ...(body.endDate !== undefined && { endDate: body.endDate ? new Date(body.endDate) : null }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.venueId !== undefined && { venueId: body.venueId }),
      ...(body.tags !== undefined && { tags: body.tags }),
      ...(body.contactPerson !== undefined && { contactPerson: body.contactPerson }),
      ...(body.getInTime !== undefined && { getInTime: body.getInTime }),
      ...(body.setupTime !== undefined && { setupTime: body.setupTime }),
      ...(body.stageSize !== undefined && { stageSize: body.stageSize }),
      ...(body.actorCount !== undefined && { actorCount: body.actorCount }),
      ...(body.allergies !== undefined && { allergies: body.allergies }),
      ...(body.customFields !== undefined && { customFields: body.customFields }),
    },
    include: eventInclude,
  });

  return c.json({ data: serializeFullEvent(event) });
});

// DELETE /api/events/:id
eventsRouter.delete("/events/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const { id } = c.req.param();
  const existing = await prisma.event.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) {
    return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  }
  const canDelete = await canManageEventAsOwnerTeam({
    organizationId: user.organizationId,
    userId: user.id,
    userEmail: user.email,
    eventId: id,
  });
  if (!canDelete) {
    return c.json(
      { error: { message: "Only the owner team can delete this event", code: "FORBIDDEN" } },
      403
    );
  }
  await prisma.event.delete({ where: { id } });
  return new Response(null, { status: 204 });
});

// GET /api/events/:id/teams
eventsRouter.get("/events/:id/teams", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const eventId = c.req.param("id");
  const event = await prisma.event.findUnique({
    where: { id: eventId, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!event) return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  await ensureEventOwnerTeam(eventId, user.organizationId);
  const rows = await prismaAny.eventTeam.findMany({
    where: { eventId },
    include: { team: { select: { id: true, name: true, color: true } } },
    orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
  });
  return c.json({
    data: rows.map((r: any) => ({
      id: r.id,
      eventId: r.eventId,
      teamId: r.teamId,
      isOwner: r.isOwner,
      createdAt: r.createdAt.toISOString(),
      team: r.team,
    })),
  });
});

// POST /api/events/:id/teams
eventsRouter.post("/events/:id/teams", zValidator("json", AddEventTeamSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const eventId = c.req.param("id");
  const body = c.req.valid("json");
  const event = await prisma.event.findUnique({
    where: { id: eventId, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!event) return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  const canAddTeam = await canManageEventAsOwnerTeam({
    organizationId: user.organizationId,
    userId: user.id,
    userEmail: user.email,
    eventId,
  });
  if (!canAddTeam) {
    return c.json({ error: { message: "Only the owner team can add teams", code: "FORBIDDEN" } }, 403);
  }
  const team = await prisma.department.findUnique({
    where: { id: body.teamId, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!team) return c.json({ error: { message: "Team not found", code: "NOT_FOUND" } }, 404);

  const ownerTeamId = await ensureEventOwnerTeam(eventId, user.organizationId);
  const row = await prismaAny.eventTeam.upsert({
    where: { eventId_teamId: { eventId, teamId: body.teamId } },
    update: {},
    create: { eventId, teamId: body.teamId, isOwner: ownerTeamId === body.teamId },
    include: { team: { select: { id: true, name: true, color: true } } },
  });
  return c.json(
    {
      data: {
        id: row.id,
        eventId: row.eventId,
        teamId: row.teamId,
        isOwner: row.isOwner,
        createdAt: row.createdAt.toISOString(),
        team: row.team,
      },
    },
    201
  );
});

// DELETE /api/events/:id/teams/:teamId
eventsRouter.delete("/events/:id/teams/:teamId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { id: eventId, teamId } = c.req.param();
  const event = await prisma.event.findUnique({
    where: { id: eventId, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!event) return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  const canRemoveTeam = await canManageEventAsOwnerTeam({
    organizationId: user.organizationId,
    userId: user.id,
    userEmail: user.email,
    eventId,
  });
  if (!canRemoveTeam) {
    return c.json({ error: { message: "Only the owner team can remove teams", code: "FORBIDDEN" } }, 403);
  }
  const ownerTeamId = await ensureEventOwnerTeam(eventId, user.organizationId);
  if (ownerTeamId === teamId) {
    return c.json(
      { error: { message: "Owner team cannot be removed from the event", code: "BAD_REQUEST" } },
      400
    );
  }
  const row = await prismaAny.eventTeam.findFirst({
    where: { eventId, teamId },
    select: { id: true },
  });
  if (!row) return c.json({ error: { message: "Team is not assigned to event", code: "NOT_FOUND" } }, 404);
  await prismaAny.eventTeam.delete({ where: { id: row.id } });
  return new Response(null, { status: 204 });
});

// GET /api/events/:id/team-notes
eventsRouter.get("/events/:id/team-notes", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const eventId = c.req.param("id");
  const event = await prisma.event.findUnique({
    where: { id: eventId, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!event) return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  const canRead = await canReadEventCollaboration({
    organizationId: user.organizationId,
    eventId,
    userId: user.id,
    userEmail: user.email,
  });
  if (!canRead) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  const notes = await prismaAny.eventTeamNote.findMany({
    where: { eventId },
    orderBy: { createdAt: "asc" },
  });
  return c.json({
    data: notes.map((n: any) => ({
      id: n.id,
      eventId: n.eventId,
      fromTeamId: n.fromTeamId,
      toTeamId: n.toTeamId,
      body: n.body,
      createdByUserId: n.createdByUserId ?? null,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
    })),
  });
});

// POST /api/events/:id/team-notes
eventsRouter.post("/events/:id/team-notes", zValidator("json", CreateEventTeamNoteSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const eventId = c.req.param("id");
  const body = c.req.valid("json");
  const event = await prisma.event.findUnique({
    where: { id: eventId, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!event) return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  const canFrom = await canAccessEventTeam({
    organizationId: user.organizationId,
    eventId,
    userId: user.id,
    userEmail: user.email,
    eventTeamId: body.fromTeamId,
  });
  if (!canFrom) {
    return c.json({ error: { message: "You can only write notes from your team tab", code: "FORBIDDEN" } }, 403);
  }
  const toRow = await prismaAny.eventTeam.findFirst({
    where: { id: body.toTeamId, eventId },
    select: { id: true },
  });
  if (!toRow) return c.json({ error: { message: "Target team not found on event", code: "NOT_FOUND" } }, 404);
  const note = await prismaAny.eventTeamNote.create({
    data: {
      eventId,
      fromTeamId: body.fromTeamId,
      toTeamId: body.toTeamId,
      body: body.body,
      createdByUserId: user.id,
    },
  });
  return c.json(
    {
      data: {
        id: note.id,
        eventId: note.eventId,
        fromTeamId: note.fromTeamId,
        toTeamId: note.toTeamId,
        body: note.body,
        createdByUserId: note.createdByUserId ?? null,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      },
    },
    201
  );
});

// PATCH /api/events/:id/team-notes/:noteId
eventsRouter.patch(
  "/events/:id/team-notes/:noteId",
  zValidator("json", UpdateEventTeamNoteSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId) {
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    }
    const { id: eventId, noteId } = c.req.param();
    const body = c.req.valid("json");
    const note = await prismaAny.eventTeamNote.findFirst({
      where: { id: noteId, eventId, event: { organizationId: user.organizationId } },
      select: { id: true, fromTeamId: true },
    });
    if (!note) return c.json({ error: { message: "Note not found", code: "NOT_FOUND" } }, 404);
    const canEdit = await canAccessEventTeam({
      organizationId: user.organizationId,
      eventId,
      userId: user.id,
      userEmail: user.email,
      eventTeamId: note.fromTeamId,
    });
    if (!canEdit) {
      return c.json({ error: { message: "Only sender team can edit this note", code: "FORBIDDEN" } }, 403);
    }
    const updated = await prismaAny.eventTeamNote.update({
      where: { id: note.id },
      data: { body: body.body },
    });
    return c.json({
      data: {
        id: updated.id,
        eventId: updated.eventId,
        fromTeamId: updated.fromTeamId,
        toTeamId: updated.toTeamId,
        body: updated.body,
        createdByUserId: updated.createdByUserId ?? null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  }
);

// DELETE /api/events/:id/team-notes/:noteId
eventsRouter.delete("/events/:id/team-notes/:noteId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { id: eventId, noteId } = c.req.param();
  const note = await prismaAny.eventTeamNote.findFirst({
    where: { id: noteId, eventId, event: { organizationId: user.organizationId } },
    select: { id: true, fromTeamId: true },
  });
  if (!note) return c.json({ error: { message: "Note not found", code: "NOT_FOUND" } }, 404);
  const canDelete = await canAccessEventTeam({
    organizationId: user.organizationId,
    eventId,
    userId: user.id,
    userEmail: user.email,
    eventTeamId: note.fromTeamId,
  });
  if (!canDelete) {
    return c.json({ error: { message: "Only sender team can delete this note", code: "FORBIDDEN" } }, 403);
  }
  await prismaAny.eventTeamNote.delete({ where: { id: note.id } });
  return new Response(null, { status: 204 });
});

// GET /api/events/:id/teams/:eventTeamId/documents
eventsRouter.get("/events/:id/teams/:eventTeamId/documents", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { id: eventId, eventTeamId } = c.req.param();
  const canRead = await canAccessEventTeam({
    organizationId: user.organizationId,
    eventId,
    userId: user.id,
    userEmail: user.email,
    eventTeamId,
  });
  if (!canRead) return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  const docs = await prismaAny.eventTeamDocument.findMany({
    where: { eventId, teamId: eventTeamId },
    select: {
      id: true,
      eventId: true,
      teamId: true,
      name: true,
      type: true,
      filename: true,
      mimeType: true,
      createdByUserId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return c.json({
    data: docs.map((d: any) => ({
      ...d,
      createdByUserId: d.createdByUserId ?? null,
      createdAt: d.createdAt.toISOString(),
    })),
  });
});

// POST /api/events/:id/teams/:eventTeamId/documents
eventsRouter.post("/events/:id/teams/:eventTeamId/documents", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { id: eventId, eventTeamId } = c.req.param();
  const canWrite = await canAccessEventTeam({
    organizationId: user.organizationId,
    eventId,
    userId: user.id,
    userEmail: user.email,
    eventTeamId,
  });
  if (!canWrite) return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  const formData = await c.req.parseBody();
  const file = formData["file"];
  const name = typeof formData["name"] === "string" ? formData["name"].trim() : "";
  const type = typeof formData["type"] === "string" ? formData["type"].trim() : "";
  if (!file || typeof file === "string") {
    return c.json({ error: { message: "File is required", code: "BAD_REQUEST" } }, 400);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const doc = await prismaAny.eventTeamDocument.create({
    data: {
      eventId,
      teamId: eventTeamId,
      name: name || file.name,
      type: type || "other",
      filename: file.name,
      data: bytes,
      mimeType: file.type || "application/octet-stream",
      createdByUserId: user.id,
    },
    select: {
      id: true,
      eventId: true,
      teamId: true,
      name: true,
      type: true,
      filename: true,
      mimeType: true,
      createdByUserId: true,
      createdAt: true,
    },
  });
  return c.json(
    {
      data: {
        ...doc,
        createdByUserId: doc.createdByUserId ?? null,
        createdAt: doc.createdAt.toISOString(),
      },
    },
    201
  );
});

// GET /api/events/:id/team-documents/:docId/download
eventsRouter.get("/events/:id/team-documents/:docId/download", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { id: eventId, docId } = c.req.param();
  const doc = await prismaAny.eventTeamDocument.findFirst({
    where: { id: docId, eventId, event: { organizationId: user.organizationId } },
    select: { id: true, teamId: true, data: true, mimeType: true, filename: true },
  });
  if (!doc) return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  const canRead = await canAccessEventTeam({
    organizationId: user.organizationId,
    eventId,
    userId: user.id,
    userEmail: user.email,
    eventTeamId: doc.teamId,
  });
  if (!canRead) return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  return new Response(doc.data, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `attachment; filename="${doc.filename}"`,
      "Content-Length": String(doc.data.length),
    },
  });
});

// DELETE /api/events/:id/team-documents/:docId
eventsRouter.delete("/events/:id/team-documents/:docId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { id: eventId, docId } = c.req.param();
  const doc = await prismaAny.eventTeamDocument.findFirst({
    where: { id: docId, eventId, event: { organizationId: user.organizationId } },
    select: { id: true, teamId: true },
  });
  if (!doc) return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  const canDelete = await canAccessEventTeam({
    organizationId: user.organizationId,
    eventId,
    userId: user.id,
    userEmail: user.email,
    eventTeamId: doc.teamId,
  });
  if (!canDelete) return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  await prismaAny.eventTeamDocument.delete({ where: { id: doc.id } });
  return new Response(null, { status: 204 });
});

// POST /api/events/:id/people — assign person to event
eventsRouter.post("/events/:id/people", zValidator("json", AssignPersonSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canAction(c, "write.events")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const body = c.req.valid("json");

  const event = await prisma.event.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!event) {
    return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  }

  const person = await prisma.person.findUnique({
    where: { id: body.personId, organizationId: user.organizationId },
  });
  if (!person) {
    return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
  }

  const eventPerson = await prisma.eventPerson.upsert({
    where: {
      eventId_personId: { eventId: id, personId: body.personId },
    },
    update: {
      role: body.role ?? null,
    },
    create: {
      eventId: id,
      personId: body.personId,
      role: body.role ?? null,
    },
    include: { person: true },
  });

  return c.json(
    {
      data: {
        id: eventPerson.id,
        eventId: eventPerson.eventId,
        personId: eventPerson.personId,
        role: eventPerson.role,
        person: serializePerson(eventPerson.person),
      },
    },
    201
  );
});

// DELETE /api/events/:id/people/:personId — unassign person
eventsRouter.delete("/events/:id/people/:personId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canAction(c, "write.events")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id, personId } = c.req.param();

  // Verify event belongs to org
  const event = await prisma.event.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!event) {
    return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  }

  const eventPerson = await prisma.eventPerson.findUnique({
    where: { eventId_personId: { eventId: id, personId } },
  });

  if (!eventPerson) {
    return c.json({ error: { message: "Assignment not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.eventPerson.delete({
    where: { eventId_personId: { eventId: id, personId } },
  });

  return new Response(null, { status: 204 });
});

// POST /api/events/:id/shows
eventsRouter.post("/events/:id/shows", zValidator("json", CreateEventShowSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const eventId = c.req.param("id");
  const body = c.req.valid("json");
  const event = await prisma.event.findUnique({ where: { id: eventId, organizationId: user.organizationId } });
  if (!event) return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  const canAddShows = await canManageEventAsOwnerTeam({
    organizationId: user.organizationId,
    userId: user.id,
    userEmail: user.email,
    eventId,
  });
  if (!canAddShows) {
    return c.json(
      { error: { message: "Only the owner team can add shows", code: "FORBIDDEN" } },
      403
    );
  }
  const venue = await prisma.venue.findUnique({ where: { id: body.venueId, organizationId: user.organizationId } });
  if (!venue) return c.json({ error: { message: "Venue not found", code: "NOT_FOUND" } }, 404);
  if (body.teamResponsibleId) {
    const person = await prisma.person.findUnique({
      where: { id: body.teamResponsibleId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!person) return c.json({ error: { message: "Responsible person not found", code: "NOT_FOUND" } }, 404);
  }
  const show = await prismaAny.eventShow.create({
    data: {
      eventId,
      showDate: new Date(body.showDate),
      showTime: body.showTime,
      durationMinutes: body.durationMinutes,
      venueId: body.venueId,
      technicalNotes: body.technicalNotes ?? null,
      fohNotes: body.fohNotes ?? null,
      ticketNotes: body.ticketNotes ?? null,
      hospitalityNotes: body.hospitalityNotes ?? null,
      teamResponsibleId: body.teamResponsibleId ?? null,
      getInTime: body.getInTime ?? null,
      getInDurationMinutes: body.getInDurationMinutes ?? null,
      getOutTime: body.getOutTime ?? null,
      getOutDurationMinutes: body.getOutDurationMinutes ?? null,
      rehearsalTime: body.rehearsalTime ?? null,
      rehearsalDurationMinutes: body.rehearsalDurationMinutes ?? null,
      soundcheckTime: body.soundcheckTime ?? null,
      soundcheckDurationMinutes: body.soundcheckDurationMinutes ?? null,
      breakTime: body.breakTime ?? null,
      breakDurationMinutes: body.breakDurationMinutes ?? null,
      notes: body.notes ?? null,
    },
  });
  return c.json({ data: { id: show.id } }, 201);
});

// PUT /api/events/:id/shows/:showId
eventsRouter.put("/events/:id/shows/:showId", zValidator("json", UpdateEventShowSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const { id: eventId, showId } = c.req.param();
  const body = c.req.valid("json");
  const touchingTimingFields =
    body.showDate !== undefined || body.showTime !== undefined || body.durationMinutes !== undefined;
  if (touchingTimingFields) {
    const canEditTiming = await canManageEventAsOwnerTeam({
      organizationId: user.organizationId,
      userId: user.id,
      userEmail: user.email,
      eventId,
    });
    if (!canEditTiming) {
      return c.json(
        {
          error: {
            message: "Only the owner team can edit show date, start time, or duration",
            code: "FORBIDDEN",
          },
        },
        403
      );
    }
  } else if (!canAction(c, "write.events")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  const show = await prismaAny.eventShow.findFirst({
    where: { id: showId, eventId, event: { organizationId: user.organizationId } },
    select: { id: true },
  });
  if (!show) return c.json({ error: { message: "Show not found", code: "NOT_FOUND" } }, 404);
  if (body.venueId) {
    const venue = await prisma.venue.findUnique({ where: { id: body.venueId, organizationId: user.organizationId } });
    if (!venue) return c.json({ error: { message: "Venue not found", code: "NOT_FOUND" } }, 404);
  }
  if (body.teamResponsibleId) {
    const person = await prisma.person.findUnique({
      where: { id: body.teamResponsibleId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!person) return c.json({ error: { message: "Responsible person not found", code: "NOT_FOUND" } }, 404);
  }
  await prismaAny.eventShow.update({
    where: { id: showId },
    data: {
      ...(body.showDate !== undefined ? { showDate: new Date(body.showDate) } : {}),
      ...(body.showTime !== undefined ? { showTime: body.showTime } : {}),
      ...(body.durationMinutes !== undefined ? { durationMinutes: body.durationMinutes } : {}),
      ...(body.venueId !== undefined ? { venueId: body.venueId } : {}),
      ...(body.technicalNotes !== undefined ? { technicalNotes: body.technicalNotes || null } : {}),
      ...(body.fohNotes !== undefined ? { fohNotes: body.fohNotes || null } : {}),
      ...(body.ticketNotes !== undefined ? { ticketNotes: body.ticketNotes || null } : {}),
      ...(body.hospitalityNotes !== undefined ? { hospitalityNotes: body.hospitalityNotes || null } : {}),
      ...(body.teamResponsibleId !== undefined ? { teamResponsibleId: body.teamResponsibleId || null } : {}),
      ...(body.getInTime !== undefined ? { getInTime: body.getInTime || null } : {}),
      ...(body.getInDurationMinutes !== undefined ? { getInDurationMinutes: body.getInDurationMinutes ?? null } : {}),
      ...(body.getOutTime !== undefined ? { getOutTime: body.getOutTime || null } : {}),
      ...(body.getOutDurationMinutes !== undefined ? { getOutDurationMinutes: body.getOutDurationMinutes ?? null } : {}),
      ...(body.rehearsalTime !== undefined ? { rehearsalTime: body.rehearsalTime || null } : {}),
      ...(body.rehearsalDurationMinutes !== undefined ? { rehearsalDurationMinutes: body.rehearsalDurationMinutes ?? null } : {}),
      ...(body.soundcheckTime !== undefined ? { soundcheckTime: body.soundcheckTime || null } : {}),
      ...(body.soundcheckDurationMinutes !== undefined ? { soundcheckDurationMinutes: body.soundcheckDurationMinutes ?? null } : {}),
      ...(body.breakTime !== undefined ? { breakTime: body.breakTime || null } : {}),
      ...(body.breakDurationMinutes !== undefined ? { breakDurationMinutes: body.breakDurationMinutes ?? null } : {}),
      ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
    },
  });
  return c.json({ data: { ok: true } });
});

eventsRouter.delete("/events/:id/shows/:showId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  const { id: eventId, showId } = c.req.param();
  const canDeleteShows = await canManageEventAsOwnerTeam({
    organizationId: user.organizationId,
    userId: user.id,
    userEmail: user.email,
    eventId,
  });
  if (!canDeleteShows) {
    return c.json(
      { error: { message: "Only the owner team can delete shows", code: "FORBIDDEN" } },
      403
    );
  }
  const show = await prismaAny.eventShow.findFirst({
    where: { id: showId, eventId, event: { organizationId: user.organizationId } },
    include: { staffing: true },
  });
  if (!show) return c.json({ error: { message: "Show not found", code: "NOT_FOUND" } }, 404);
  for (const staff of show.staffing) {
    await removeStaffingFromSchedule(staff.id, user.organizationId);
  }
  await prismaAny.eventShow.delete({ where: { id: showId } });
  const remainingShows = await prismaAny.eventShow.count({ where: { eventId } });
  if (remainingShows === 0) {
    await prismaAny.event.update({
      where: { id: eventId },
      data: { status: "draft" },
    });
  }
  return new Response(null, { status: 204 });
});

eventsRouter.post(
  "/events/:id/shows/:showId/staffing",
  zValidator("json", UpsertEventShowStaffingSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId)
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    if (!canAction(c, "write.events")) {
      return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
    }
    const { id: eventId, showId } = c.req.param();
    const body = c.req.valid("json");
    const show = await prismaAny.eventShow.findFirst({
      where: { id: showId, eventId, event: { organizationId: user.organizationId } },
      select: { id: true },
    });
    if (!show) return c.json({ error: { message: "Show not found", code: "NOT_FOUND" } }, 404);
    const person = await prisma.person.findUnique({
      where: { id: body.personId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!person) return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);

    const staffing = await prismaAny.eventShowStaffing.upsert({
      where: { showId_personId: { showId, personId: body.personId } },
      create: {
        showId,
        personId: body.personId,
        role: body.role ?? null,
        meetingTime: body.meetingTime ?? null,
        meetingDurationMinutes: body.meetingDurationMinutes ?? null,
        notes: body.notes ?? null,
      },
      update: {
        role: body.role ?? null,
        meetingTime: body.meetingTime ?? null,
        meetingDurationMinutes: body.meetingDurationMinutes ?? null,
        notes: body.notes ?? null,
      },
    });
    await syncStaffingToSchedule(staffing.id);
    return c.json({ data: { id: staffing.id } }, 201);
  }
);

eventsRouter.delete("/events/:id/shows/:showId/staffing/:personId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  if (!canAction(c, "write.events")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  const { id: eventId, showId, personId } = c.req.param();
  const show = await prismaAny.eventShow.findFirst({
    where: { id: showId, eventId, event: { organizationId: user.organizationId } },
    select: { id: true },
  });
  if (!show) return c.json({ error: { message: "Show not found", code: "NOT_FOUND" } }, 404);
  const staffing = await prismaAny.eventShow.findUnique({
    where: { id: showId },
    select: {
      staffing: {
        where: { personId },
        select: { id: true },
      },
    },
  });
  const row = staffing?.staffing?.[0];
  if (!row) return c.json({ error: { message: "Staffing not found", code: "NOT_FOUND" } }, 404);
  await removeStaffingFromSchedule(row.id, user.organizationId);
  await prismaAny.eventShowStaffing.delete({ where: { id: row.id } });
  return new Response(null, { status: 204 });
});

export default eventsRouter;
