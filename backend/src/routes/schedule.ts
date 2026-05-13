import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { excludeMirroredEventInternalBookings } from "../internalBookingMirrorFilter";
import { serializeTourShow } from "./tours";
import { internalBookingOverlapsRangeWhere } from "../bookingRangeQuery";

const scheduleRouter = new Hono<{
  Variables: { user: typeof auth.$Infer.Session.user | null };
}>();

function serializeDate(d: Date) {
  return d.toISOString();
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
    createdAt: serializeDate(venue.createdAt),
    updatedAt: serializeDate(venue.updatedAt),
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
    createdAt: serializeDate(person.createdAt),
    updatedAt: serializeDate(person.updatedAt),
  };
}

// GET /api/schedule
scheduleRouter.get("/schedule", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const { venueId, personId, from, to } = c.req.query();

  const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : null;
  const toDateExclusive = to ? new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86_400_000) : null;

  const bookingDateFilter = internalBookingOverlapsRangeWhere(fromDate, toDateExclusive);

  const showDateRange =
    fromDate || toDateExclusive
      ? {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDateExclusive ? { lt: toDateExclusive } : {}),
        }
      : undefined;
  const jobDateRange =
    fromDate || toDateExclusive
      ? {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDateExclusive ? { lt: toDateExclusive } : {}),
        }
      : undefined;

  // Build event where clause
  const eventWhere: Record<string, unknown> = {
    organizationId: user.organizationId,
  };
  if (fromDate || toDateExclusive) {
    eventWhere.OR = [
      {
        startDate: {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDateExclusive ? { lt: toDateExclusive } : {}),
        },
      },
      {
        shows: {
          some: {
            showDate: showDateRange,
          },
        },
      },
    ];
  }
  if (venueId) eventWhere.venueId = venueId;
  if (personId) {
    eventWhere.AND = [
      {
        OR: [
          { people: { some: { personId } } },
          { shows: { some: { jobs: { some: { personId } } } } },
        ],
      },
    ];
  }

  // Build booking where clause (omit mirrored event job/staffing rows — same slots as show jobs)
  const bookingWhere: Record<string, unknown> = {
    organizationId: user.organizationId,
    ...(bookingDateFilter ?? {}),
    ...excludeMirroredEventInternalBookings,
  };
  if (venueId) bookingWhere.venueId = venueId;
  if (personId) {
    bookingWhere.people = { some: { personId } };
  }

  const [events, bookings, tours] = await Promise.all([
    prisma.event.findMany({
      where: eventWhere,
      orderBy: { startDate: "asc" },
      select: {
        id: true,
        title: true,
        description: true,
        startDate: true,
        endDate: true,
        status: true,
        venueId: true,
        tags: true,
        contactPerson: true,
        getInTime: true,
        setupTime: true,
        stageSize: true,
        actorCount: true,
        allergies: true,
        customFields: true,
        createdAt: true,
        updatedAt: true,
        venue: true,
        shows: {
          ...(showDateRange ? { where: { showDate: showDateRange } } : {}),
          select: {
            id: true,
            eventId: true,
            showDate: true,
            showTime: true,
            durationMinutes: true,
            status: true,
            venueId: true,
            venue: true,
            jobs: {
              ...(jobDateRange ? { where: { jobDate: jobDateRange } } : {}),
              select: {
                id: true,
                showId: true,
                title: true,
                jobDate: true,
                startTime: true,
                durationMinutes: true,
                venueId: true,
                venue: true,
                departmentId: true,
                personId: true,
                sortOrder: true,
                createdAt: true,
                updatedAt: true,
                person: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
              orderBy: [{ jobDate: "asc" }, { startTime: "asc" }, { sortOrder: "asc" }],
            },
          },
          orderBy: [{ showDate: "asc" }, { showTime: "asc" }],
        },
      },
    }),
    prisma.internalBooking.findMany({
      where: bookingWhere,
      orderBy: { startDate: "asc" },
      include: {
        venue: true,
        createdBy: { select: { id: true, name: true, email: true } },
        people: { include: { person: true } },
      },
    }),
    prisma.tour.findMany({
      where: {
        organizationId: user.organizationId,
        ...(fromDate || toDateExclusive
          ? {
              shows: {
                some: {
                  date: {
                    ...(fromDate ? { gte: fromDate } : {}),
                    ...(toDateExclusive ? { lt: toDateExclusive } : {}),
                  },
                },
              },
            }
          : {}),
        ...(personId
          ? {
              shows: {
                some: {
                  showPeople: { some: { personId } },
                },
              },
            }
          : {}),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        shows: {
          ...(fromDate || toDateExclusive
            ? {
                where: {
                  date: {
                    ...(fromDate ? { gte: fromDate } : {}),
                    ...(toDateExclusive ? { lt: toDateExclusive } : {}),
                  },
                },
              }
            : {}),
          orderBy: [{ date: "asc" }, { order: "asc" }],
          include: {
            scheduleEvents: { orderBy: { sortOrder: "asc" } },
          },
        },
      },
    }),
  ]);

  const serializedEvents = events.map((event) => ({
    ...event,
    startDate: event.startDate ? serializeDate(event.startDate) : null,
    endDate: event.endDate ? serializeDate(event.endDate) : null,
    createdAt: serializeDate(event.createdAt),
    updatedAt: serializeDate(event.updatedAt),
    venue: serializeVenue(event.venue),
    people: [],
    documents: [],
    shows: event.shows.map((show) => ({
      id: show.id,
      eventId: show.eventId,
      showDate: serializeDate(show.showDate),
      showTime: show.showTime,
      durationMinutes: show.durationMinutes,
      status: show.status ?? "draft",
      venueId: show.venueId,
      venue: serializeVenue(show.venue),
      jobs: show.jobs.map((job) => ({
        id: job.id,
        showId: job.showId,
        title: job.title,
        jobDate: serializeDate(job.jobDate),
        startTime: job.startTime,
        durationMinutes: job.durationMinutes,
        venueId: job.venueId,
        venue: serializeVenue(job.venue)!,
        departmentId: job.departmentId,
        personId: job.personId,
        person: job.person
          ? {
              id: job.person.id,
              name: job.person.name,
            }
          : null,
        sortOrder: job.sortOrder,
        createdAt: serializeDate(job.createdAt),
        updatedAt: serializeDate(job.updatedAt),
      })),
    })),
  }));

  const serializedBookings = bookings.map((booking) => ({
    ...booking,
    startDate: serializeDate(booking.startDate),
    endDate: booking.endDate ? serializeDate(booking.endDate) : null,
    createdAt: serializeDate(booking.createdAt),
    updatedAt: serializeDate(booking.updatedAt),
    venue: serializeVenue(booking.venue),
    createdBy: booking.createdBy
      ? { id: booking.createdBy.id, name: booking.createdBy.name, email: booking.createdBy.email }
      : null,
    people: booking.people.map((bp) => ({
      id: bp.id,
      personId: bp.personId,
      role: bp.role,
      person: serializePerson(bp.person),
    })),
  }));

  const serializedTours = tours.map((tour) => ({
    ...tour,
    createdAt: serializeDate(tour.createdAt),
    updatedAt: serializeDate(tour.updatedAt),
    shows: tour.shows.map((show) => ({
      ...serializeTourShow(show),
      showPeople: [],
    })),
    people: [],
    teams: [],
    personNotes: [],
  }));

  return c.json({
    data: {
      events: serializedEvents,
      bookings: serializedBookings,
      tours: serializedTours,
    },
  });
});

export default scheduleRouter;
