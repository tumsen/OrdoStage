import { Hono } from "hono";
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
publicRouter.get("/:token", async (c) => {
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

export default publicRouter;
