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
} from "../types";
import { canAction } from "../requestRole";

const eventsRouter = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();
const prismaAny = prisma as any;

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
  const event = await prisma.event.create({
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
      organizationId: user.organizationId,
    },
    include: eventInclude,
  });

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

  if (!canAction(c, "write.events")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const existing = await prisma.event.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) {
    return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  }
  await prisma.event.delete({ where: { id } });
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
  if (!canAction(c, "write.events")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  const eventId = c.req.param("id");
  const body = c.req.valid("json");
  const event = await prisma.event.findUnique({ where: { id: eventId, organizationId: user.organizationId } });
  if (!event) return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
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
  if (!canAction(c, "write.events")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  const { id: eventId, showId } = c.req.param();
  const show = await prismaAny.eventShow.findFirst({
    where: { id: showId, eventId, event: { organizationId: user.organizationId } },
    include: { staffing: true },
  });
  if (!show) return c.json({ error: { message: "Show not found", code: "NOT_FOUND" } }, 404);
  for (const staff of show.staffing) {
    await removeStaffingFromSchedule(staff.id, user.organizationId);
  }
  await prismaAny.eventShow.delete({ where: { id: showId } });
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
