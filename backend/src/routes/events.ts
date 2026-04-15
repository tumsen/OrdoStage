import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import prisma from "../db";
import { CreateEventSchema, UpdateEventSchema, AssignPersonSchema } from "../types";

const eventsRouter = new Hono();

function serializeEvent(event: {
  id: string;
  title: string;
  description: string | null;
  startDate: Date;
  endDate: Date | null;
  status: string;
  venueId: string | null;
  tags: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...event,
    startDate: event.startDate.toISOString(),
    endDate: event.endDate ? event.endDate.toISOString() : null,
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
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...person,
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

// GET /api/events
eventsRouter.get("/events", async (c) => {
  const { status, venueId, from, to } = c.req.query();

  const where: Record<string, unknown> = {};
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
    include: {
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
    },
  });

  const serialized = events.map((event) => ({
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
  }));

  return c.json({ data: serialized });
});

// POST /api/events
eventsRouter.post("/events", zValidator("json", CreateEventSchema), async (c) => {
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
    },
    include: {
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
    },
  });

  return c.json(
    {
      data: {
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
      },
    },
    201
  );
});

// GET /api/events/:id
eventsRouter.get("/events/:id", async (c) => {
  const { id } = c.req.param();
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
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
    },
  });

  if (!event) {
    return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  }

  return c.json({
    data: {
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
    },
  });
});

// PUT /api/events/:id
eventsRouter.put("/events/:id", zValidator("json", UpdateEventSchema), async (c) => {
  const { id } = c.req.param();
  const body = c.req.valid("json");

  const existing = await prisma.event.findUnique({ where: { id } });
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
    },
    include: {
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
    },
  });

  return c.json({
    data: {
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
    },
  });
});

// DELETE /api/events/:id
eventsRouter.delete("/events/:id", async (c) => {
  const { id } = c.req.param();
  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) {
    return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  }
  await prisma.event.delete({ where: { id } });
  return new Response(null, { status: 204 });
});

// POST /api/events/:id/people — assign person to event
eventsRouter.post(
  "/events/:id/people",
  zValidator("json", AssignPersonSchema),
  async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid("json");

    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) {
      return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
    }

    const person = await prisma.person.findUnique({ where: { id: body.personId } });
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
  }
);

// DELETE /api/events/:id/people/:personId — unassign person
eventsRouter.delete("/events/:id/people/:personId", async (c) => {
  const { id, personId } = c.req.param();

  const eventPerson = await prisma.eventPerson.findUnique({
    where: { eventId_personId: { eventId: id, personId } },
  });

  if (!eventPerson) {
    return c.json(
      { error: { message: "Assignment not found", code: "NOT_FOUND" } },
      404
    );
  }

  await prisma.eventPerson.delete({
    where: { eventId_personId: { eventId: id, personId } },
  });

  return new Response(null, { status: 204 });
});

export default eventsRouter;
