import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { CreateInternalBookingSchema, UpdateInternalBookingSchema } from "../types";

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
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...booking,
    startDate: booking.startDate.toISOString(),
    endDate: booking.endDate ? booking.endDate.toISOString() : null,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
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
  people: {
    include: { person: true },
  },
} as const;

function serializeFullBooking(booking: {
  id: string;
  title: string;
  description: string | null;
  startDate: Date;
  endDate: Date | null;
  type: string;
  venueId: string | null;
  organizationId: string;
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

  const bookings = await prisma.internalBooking.findMany({
    where: { organizationId: user.organizationId },
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

  const body = c.req.valid("json");

  const booking = await prisma.internalBooking.create({
    data: {
      title: body.title,
      description: body.description ?? null,
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : null,
      type: body.type ?? "other",
      venueId: body.venueId ?? null,
      organizationId: user.organizationId,
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

  const { id } = c.req.param();
  const body = c.req.valid("json");

  const existing = await prisma.internalBooking.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing)
    return c.json({ error: { message: "Booking not found", code: "NOT_FOUND" } }, 404);

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

  const { id } = c.req.param();
  const existing = await prisma.internalBooking.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing)
    return c.json({ error: { message: "Booking not found", code: "NOT_FOUND" } }, 404);

  await prisma.internalBooking.delete({ where: { id } });
  return new Response(null, { status: 204 });
});

export default bookingsRouter;
