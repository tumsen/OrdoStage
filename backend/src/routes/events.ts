import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { CreateEventSchema, UpdateEventSchema, AssignPersonSchema } from "../types";
import { canAction } from "../requestRole";

const eventsRouter = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

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
  address: string | null;
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

const eventInclude = {
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
} as const;

function serializeFullEvent(event: {
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
  venue: {
    id: string;
    name: string;
    address: string | null;
    capacity: number | null;
    notes: string | null;
    organizationId: string;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  people: Array<{
    id: string;
    eventId: string;
    personId: string;
    role: string | null;
    person: {
      id: string;
      name: string;
      role: string | null;
      email: string | null;
      phone: string | null;
      departmentId: string | null;
      organizationId: string;
      createdAt: Date;
      updatedAt: Date;
    };
  }>;
  documents: Array<{
    id: string;
    eventId: string;
    name: string;
    type: string;
    filename: string;
    mimeType: string;
    createdAt: Date;
  }>;
}) {
  return {
    ...serializeEvent(event),
    venue: serializeVenue(event.venue),
    people: event.people.map((ep) => ({
      id: ep.id,
      eventId: ep.eventId,
      personId: ep.personId,
      role: ep.role,
      person: serializePerson(ep.person),
    })),
    documents: event.documents.map(serializeDocument),
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

export default eventsRouter;
