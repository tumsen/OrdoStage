import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { excludeMirroredEventInternalBookings } from "../internalBookingMirrorFilter";
import { CreateInternalBookingSchema, UpdateInternalBookingSchema } from "../types";
import { canAction } from "../requestRole";
import { internalBookingOverlapsRangeWhere } from "../bookingRangeQuery";

const bookingsRouter = new Hono<{
  Variables: { user: typeof auth.$Infer.Session.user | null };
}>();

function serializeBooking(booking: {
  id: string;
  title: string;
  description: string | null;
  startDate: Date;
  endDate: Date | null;
  type: string;
  venueId: string | null;
  eventId: string | null;
  isLocked: boolean;
  organizationId: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: booking.id,
    title: booking.title,
    description: booking.description,
    startDate: booking.startDate.toISOString(),
    endDate: booking.endDate ? booking.endDate.toISOString() : null,
    type: booking.type,
    venueId: booking.venueId,
    eventId: booking.eventId,
    isLocked: booking.isLocked,
    organizationId: booking.organizationId,
    createdById: booking.createdById,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
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
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...person,
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
  };
}

const bookingInclude = {
  venue: true,
  createdBy: { select: { id: true, name: true, email: true } },
  people: {
    include: { person: true },
  },
} as const;

function serializeCreator(user: { id: string; name: string; email: string } | null) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email };
}

function serializeFullBooking(booking: {
  id: string;
  title: string;
  description: string | null;
  startDate: Date;
  endDate: Date | null;
  type: string;
  venueId: string | null;
  eventId: string | null;
  isLocked: boolean;
  organizationId: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  venue: {
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
  } | null;
  createdBy: { id: string; name: string; email: string } | null;
  people: Array<{
    id: string;
    bookingId: string;
    personId: string;
    role: string | null;
    person: {
      id: string;
      name: string;
      role: string | null;
      email: string | null;
      phone: string | null;
      organizationId: string;
      createdAt: Date;
      updatedAt: Date;
    };
  }>;
}) {
  return {
    ...serializeBooking(booking),
    createdBy: serializeCreator(booking.createdBy),
    venue: serializeVenue(booking.venue),
    people: booking.people.map((bp) => ({
      id: bp.id,
      personId: bp.personId,
      role: bp.role,
      person: serializePerson(bp.person),
    })),
  };
}

// GET /api/bookings
bookingsRouter.get("/bookings", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const eventIdFilter = c.req.query("eventId");
  const venueIdFilter = c.req.query("venueId");
  const fromQ = c.req.query("from");
  const toQ = c.req.query("to");

  const where: Record<string, unknown> = { organizationId: user.organizationId };
  if (eventIdFilter) where.eventId = eventIdFilter;
  if (venueIdFilter) where.venueId = venueIdFilter;
  const fromDate = fromQ ? new Date(`${fromQ}T00:00:00.000Z`) : null;
  const toDateExclusive = toQ
    ? new Date(new Date(`${toQ}T00:00:00.000Z`).getTime() + 86_400_000)
    : null;
  const overlap = internalBookingOverlapsRangeWhere(fromDate, toDateExclusive);
  if (overlap) {
    Object.assign(where, overlap);
  }

  const bookings = await prisma.internalBooking.findMany({
    where: { ...where, ...excludeMirroredEventInternalBookings },
    orderBy: { startDate: "asc" },
    include: bookingInclude,
  });

  return c.json({ data: bookings.map(serializeFullBooking) });
});

// POST /api/bookings
bookingsRouter.post("/bookings", zValidator("json", CreateInternalBookingSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canAction(c, "write.schedule")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const body = c.req.valid("json");

  if (body.eventId) {
    const ev = await prisma.event.findFirst({
      where: { id: body.eventId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!ev) return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  }

  const booking = await prisma.internalBooking.create({
    data: {
      title: body.title,
      description: body.description ?? null,
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : null,
      type: body.type ?? "other",
      venueId: body.venueId ?? null,
      eventId: body.eventId ?? null,
      isLocked: body.isLocked === true,
      organizationId: user.organizationId,
      createdById: user.id,
      people: body.personIds
        ? {
            create: body.personIds.map((p) => ({
              personId: p.personId,
              role: p.role ?? null,
            })),
          }
        : undefined,
    },
    include: bookingInclude,
  });

  return c.json({ data: serializeFullBooking(booking) }, 201);
});

// GET /api/bookings/:id
bookingsRouter.get("/bookings/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const { id } = c.req.param();
  const booking = await prisma.internalBooking.findUnique({
    where: { id, organizationId: user.organizationId },
    include: bookingInclude,
  });

  if (!booking)
    return c.json({ error: { message: "Booking not found", code: "NOT_FOUND" } }, 404);

  return c.json({ data: serializeFullBooking(booking) });
});

// PUT /api/bookings/:id
bookingsRouter.put("/bookings/:id", zValidator("json", UpdateInternalBookingSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canAction(c, "write.schedule")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const body = c.req.valid("json");

  const existing = await prisma.internalBooking.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing)
    return c.json({ error: { message: "Booking not found", code: "NOT_FOUND" } }, 404);

  // Locked bookings can only be unlocked. Reject any other change.
  if (existing.isLocked) {
    const onlyUnlocking =
      body.isLocked === false &&
      body.title === undefined &&
      body.description === undefined &&
      body.startDate === undefined &&
      body.endDate === undefined &&
      body.type === undefined &&
      body.venueId === undefined &&
      body.eventId === undefined &&
      body.personIds === undefined;
    if (!onlyUnlocking) {
      return c.json(
        {
          error: {
            message: "Booking is locked. Unlock it first to make changes.",
            code: "LOCKED",
          },
        },
        409
      );
    }
  }

  const mergedType = body.type ?? existing.type;
  const mergedStart =
    body.startDate !== undefined ? new Date(body.startDate) : existing.startDate;
  const mergedEnd =
    body.endDate !== undefined
      ? body.endDate
        ? new Date(body.endDate)
        : null
      : existing.endDate;
  if (mergedType === "venue_booking") {
    if (!mergedEnd || mergedEnd.getTime() <= mergedStart.getTime()) {
      return c.json(
        {
          error: {
            message: "Venue booking requires an end date and time after the start (multi-day is allowed).",
            code: "BAD_REQUEST",
          },
        },
        400
      );
    }
  }

  // Replace people list if provided
  if (body.personIds !== undefined) {
    await prisma.internalBookingPerson.deleteMany({ where: { bookingId: id } });
    if (body.personIds.length > 0) {
      await prisma.internalBookingPerson.createMany({
        data: body.personIds.map((p) => ({
          bookingId: id,
          personId: p.personId,
          role: p.role ?? null,
        })),
      });
    }
  }

  const booking = await prisma.internalBooking.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.startDate !== undefined && { startDate: new Date(body.startDate) }),
      ...(body.endDate !== undefined && {
        endDate: body.endDate ? new Date(body.endDate) : null,
      }),
      ...(body.type !== undefined && { type: body.type }),
      ...(body.venueId !== undefined && { venueId: body.venueId }),
      ...(body.eventId !== undefined && { eventId: body.eventId }),
      ...(body.isLocked !== undefined && { isLocked: body.isLocked }),
    },
    include: bookingInclude,
  });

  return c.json({ data: serializeFullBooking(booking) });
});

// DELETE /api/bookings/:id
bookingsRouter.delete("/bookings/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canAction(c, "write.schedule")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const existing = await prisma.internalBooking.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing)
    return c.json({ error: { message: "Booking not found", code: "NOT_FOUND" } }, 404);

  if (existing.isLocked) {
    return c.json(
      {
        error: {
          message: "Booking is locked. Unlock it first to delete.",
          code: "LOCKED",
        },
      },
      409
    );
  }

  await prisma.internalBooking.delete({ where: { id } });
  return new Response(null, { status: 204 });
});

export default bookingsRouter;
