import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";

function serializePublicPerson(person: any) {
  return {
    id: person.id,
    name: person.name,
    role: person.role,
    email: person.email,
    phone: person.phone,
    departmentId: person.departmentId,
    createdAt: person.createdAt instanceof Date ? person.createdAt.toISOString() : person.createdAt,
    updatedAt: person.updatedAt instanceof Date ? person.updatedAt.toISOString() : person.updatedAt,
  };
}

const publicRouter = new Hono();

// GET /api/public/tours/:token — public tour schedule (no auth)
publicRouter.get("/tours/:token", async (c) => {
  const { token } = c.req.param();

  const tour = await prisma.tour.findUnique({
    where: { shareToken: token },
    include: {
      shows: {
        orderBy: [{ order: "asc" }, { date: "asc" }],
        include: { showPeople: { include: { person: true } } },
      },
      people: { include: { person: true } },
    },
  });

  if (!tour) {
    return c.json({ error: { message: "Tour not found", code: "NOT_FOUND" } }, 404);
  }

  return c.json({
    data: {
      id: tour.id,
      shareToken: tour.shareToken,
      name: tour.name,
      description: tour.description,
      status: tour.status,
      tourManagerName: tour.tourManagerName,
      tourManagerPhone: tour.tourManagerPhone,
      tourManagerEmail: tour.tourManagerEmail,
      notes: tour.notes,
      showDuration: (tour as any).showDuration ?? null,
      handsNeeded: (tour as any).handsNeeded ?? null,
      stageRequirements: (tour as any).stageRequirements ?? null,
      soundRequirements: (tour as any).soundRequirements ?? null,
      lightingRequirements: (tour as any).lightingRequirements ?? null,
      riderNotes: (tour as any).riderNotes ?? null,
      createdAt: tour.createdAt.toISOString(),
      updatedAt: tour.updatedAt.toISOString(),
      shows: tour.shows.map((show: any) => ({
        id: show.id,
        tourId: show.tourId,
        date: show.date.toISOString(),
        type: show.type ?? "show",
        fromLocation: show.fromLocation,
        toLocation: show.toLocation,
        showTime: show.showTime,
        getInTime: show.getInTime,
        rehearsalTime: show.rehearsalTime,
        soundcheckTime: show.soundcheckTime,
        doorsTime: show.doorsTime,
        venueName: show.venueName,
        venueAddress: show.venueAddress,
        venueCity: show.venueCity,
        contactName: show.contactName,
        contactPhone: show.contactPhone,
        contactEmail: show.contactEmail,
        hotelName: show.hotelName,
        hotelAddress: show.hotelAddress,
        hotelPhone: show.hotelPhone,
        hotelCheckIn: show.hotelCheckIn,
        hotelCheckOut: show.hotelCheckOut,
        travelInfo: show.travelInfo,
        cateringInfo: show.cateringInfo,
        notes: show.notes,
        order: show.order,
        handsNeeded: show.handsNeeded ?? null,
        travelTimeMinutes: show.travelTimeMinutes,
        distanceKm: show.distanceKm,
        showPeople: (show.showPeople ?? []).map((sp: any) => ({
          id: sp.id,
          showId: sp.showId,
          personId: sp.personId,
          role: sp.role,
          person: serializePublicPerson(sp.person),
        })),
        createdAt: show.createdAt.toISOString(),
        updatedAt: show.updatedAt.toISOString(),
      })),
      people: tour.people.map((tp: any) => ({
        id: tp.id,
        tourId: tp.tourId,
        personId: tp.personId,
        role: tp.role,
        person: serializePublicPerson(tp.person),
      })),
    },
  });
});

// GET /api/public/person/:personalToken — personal view for a tour person
publicRouter.get("/person/:personalToken", async (c) => {
  const { personalToken } = c.req.param();

  const tourPerson = await prisma.tourPerson.findUnique({
    where: { personalToken },
    include: {
      person: true,
      tour: {
        include: {
          shows: {
            orderBy: [{ order: "asc" }, { date: "asc" }],
          },
          people: {
            include: { person: true },
          },
        },
      },
    },
  });

  if (!tourPerson) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  // Fetch notes for this person on this tour
  const myNotes = await prisma.tourPersonNote.findMany({
    where: { tourId: tourPerson.tourId, personId: tourPerson.personId },
  });

  const notesByShowId = new Map(myNotes.map((n) => [n.showId, n]));

  return c.json({
    data: {
      person: {
        id: tourPerson.person.id,
        name: tourPerson.person.name,
        role: tourPerson.role ?? tourPerson.person.role ?? null,
        email: tourPerson.person.email,
        phone: tourPerson.person.phone,
      },
      tour: {
        id: tourPerson.tour.id,
        name: tourPerson.tour.name,
        description: tourPerson.tour.description,
        status: tourPerson.tour.status,
        tourManagerName: tourPerson.tour.tourManagerName,
        tourManagerPhone: tourPerson.tour.tourManagerPhone,
        tourManagerEmail: tourPerson.tour.tourManagerEmail,
        shareToken: tourPerson.tour.shareToken,
        shows: tourPerson.tour.shows.map((show: any) => ({
          id: show.id,
          tourId: show.tourId,
          date: show.date instanceof Date ? show.date.toISOString() : show.date,
          type: show.type ?? "show",
          fromLocation: show.fromLocation,
          toLocation: show.toLocation,
          showTime: show.showTime,
          getInTime: show.getInTime,
          rehearsalTime: show.rehearsalTime,
          soundcheckTime: show.soundcheckTime,
          doorsTime: show.doorsTime,
          venueName: show.venueName,
          venueAddress: show.venueAddress,
          venueCity: show.venueCity,
          hotelName: show.hotelName,
          hotelAddress: show.hotelAddress,
          hotelCheckIn: show.hotelCheckIn,
          hotelCheckOut: show.hotelCheckOut,
          travelInfo: show.travelInfo,
          notes: show.notes,
          order: show.order,
          travelTimeMinutes: show.travelTimeMinutes ?? null,
          distanceKm: show.distanceKm ?? null,
          myNote: (() => {
            const n = notesByShowId.get(show.id);
            return n ? { id: n.id, note: n.note ?? null, needsHotel: n.needsHotel } : null;
          })(),
        })),
      },
    },
  });
});

// PUT /api/public/person/:personalToken/notes/:showId — person saves their note
publicRouter.put(
  "/person/:personalToken/notes/:showId",
  zValidator("json", z.object({ note: z.string().optional(), needsHotel: z.boolean().optional() })),
  async (c) => {
    const { personalToken, showId } = c.req.param();
    const body = c.req.valid("json");

    const tourPerson = await prisma.tourPerson.findUnique({ where: { personalToken } });
    if (!tourPerson) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

    // Verify show belongs to this tour
    const show = await prisma.tourShow.findFirst({
      where: { id: showId, tourId: tourPerson.tourId },
    });
    if (!show) return c.json({ error: { message: "Show not found", code: "NOT_FOUND" } }, 404);

    const note = await prisma.tourPersonNote.upsert({
      where: { showId_personId: { showId, personId: tourPerson.personId } },
      update: {
        ...(body.note !== undefined && { note: body.note }),
        ...(body.needsHotel !== undefined && { needsHotel: body.needsHotel }),
      },
      create: {
        tourId: tourPerson.tourId,
        showId,
        personId: tourPerson.personId,
        note: body.note ?? null,
        needsHotel: body.needsHotel ?? false,
      },
    });

    return c.json({
      data: { id: note.id, note: note.note ?? null, needsHotel: note.needsHotel },
    });
  }
);

export default publicRouter;
