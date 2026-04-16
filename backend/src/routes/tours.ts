import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import {
  CreateTourSchema,
  UpdateTourSchema,
  CreateTourShowSchema,
  UpdateTourShowSchema,
} from "../types";
import { canWrite } from "../permissions";

const toursRouter = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

function serializeTourShow(show: any) {
  return {
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
    createdAt: show.createdAt instanceof Date ? show.createdAt.toISOString() : show.createdAt,
    updatedAt: show.updatedAt instanceof Date ? show.updatedAt.toISOString() : show.updatedAt,
  };
}

function serializePerson(person: any) {
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

function serializeTour(tour: any) {
  return {
    id: tour.id,
    shareToken: tour.shareToken,
    name: tour.name,
    description: tour.description,
    status: tour.status as "draft" | "active" | "completed",
    tourManagerName: tour.tourManagerName,
    tourManagerPhone: tour.tourManagerPhone,
    tourManagerEmail: tour.tourManagerEmail,
    notes: tour.notes,
    showDuration: tour.showDuration,
    handsNeeded: tour.handsNeeded,
    stageRequirements: tour.stageRequirements,
    soundRequirements: tour.soundRequirements,
    lightingRequirements: tour.lightingRequirements,
    riderNotes: tour.riderNotes,
    techRiderPdfName: tour.techRiderPdfName ?? null,
    createdAt: tour.createdAt instanceof Date ? tour.createdAt.toISOString() : tour.createdAt,
    updatedAt: tour.updatedAt instanceof Date ? tour.updatedAt.toISOString() : tour.updatedAt,
  };
}

// GET /api/tours — list all tours for the org with show/people counts
toursRouter.get("/tours", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const tours = await prisma.tour.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { shows: true, people: true },
      },
    },
  });

  return c.json({
    data: tours.map((tour) => ({
      ...serializeTour(tour),
      _count: tour._count,
    })),
  });
});

// POST /api/tours — create a tour
toursRouter.post("/tours", zValidator("json", CreateTourSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canWrite(user.orgRole)) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const body = c.req.valid("json");
  const tour = await prisma.tour.create({
    data: {
      name: body.name,
      description: body.description ?? null,
      status: body.status ?? "draft",
      tourManagerName: body.tourManagerName ?? null,
      tourManagerPhone: body.tourManagerPhone ?? null,
      tourManagerEmail: body.tourManagerEmail ?? null,
      notes: body.notes ?? null,
      showDuration: body.showDuration ?? null,
      handsNeeded: body.handsNeeded ?? null,
      stageRequirements: body.stageRequirements ?? null,
      soundRequirements: body.soundRequirements ?? null,
      lightingRequirements: body.lightingRequirements ?? null,
      riderNotes: body.riderNotes ?? null,
      organizationId: user.organizationId,
    },
  });

  return c.json({ data: serializeTour(tour) }, 201);
});

// GET /api/tours/:id — get tour with all shows and people
toursRouter.get("/tours/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const { id } = c.req.param();
  const tour = await prisma.tour.findUnique({
    where: { id, organizationId: user.organizationId },
    include: {
      shows: {
        orderBy: [{ order: "asc" }, { date: "asc" }],
      },
      people: {
        include: { person: true },
      },
    },
  });

  if (!tour) {
    return c.json({ error: { message: "Tour not found", code: "NOT_FOUND" } }, 404);
  }

  return c.json({
    data: {
      ...serializeTour(tour),
      shows: tour.shows.map(serializeTourShow),
      people: tour.people.map((tp) => ({
        id: tp.id,
        tourId: tp.tourId,
        personId: tp.personId,
        role: tp.role,
        person: serializePerson(tp.person),
      })),
    },
  });
});

// PUT /api/tours/:id — update a tour
toursRouter.put("/tours/:id", zValidator("json", UpdateTourSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canWrite(user.orgRole)) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const body = c.req.valid("json");

  const existing = await prisma.tour.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) {
    return c.json({ error: { message: "Tour not found", code: "NOT_FOUND" } }, 404);
  }

  const tour = await prisma.tour.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.tourManagerName !== undefined && { tourManagerName: body.tourManagerName }),
      ...(body.tourManagerPhone !== undefined && { tourManagerPhone: body.tourManagerPhone }),
      ...(body.tourManagerEmail !== undefined && { tourManagerEmail: body.tourManagerEmail }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.showDuration !== undefined && { showDuration: body.showDuration }),
      ...(body.handsNeeded !== undefined && { handsNeeded: body.handsNeeded }),
      ...(body.stageRequirements !== undefined && { stageRequirements: body.stageRequirements }),
      ...(body.soundRequirements !== undefined && { soundRequirements: body.soundRequirements }),
      ...(body.lightingRequirements !== undefined && { lightingRequirements: body.lightingRequirements }),
      ...(body.riderNotes !== undefined && { riderNotes: body.riderNotes }),
    },
  });

  return c.json({ data: serializeTour(tour) });
});

// DELETE /api/tours/:id — delete a tour (cascades shows and people)
toursRouter.delete("/tours/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canWrite(user.orgRole)) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const existing = await prisma.tour.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) {
    return c.json({ error: { message: "Tour not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.tour.delete({ where: { id } });
  return new Response(null, { status: 204 });
});

// POST /api/tours/:id/shows — add a show to a tour
toursRouter.post("/tours/:id/shows", zValidator("json", CreateTourShowSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canWrite(user.orgRole)) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const body = c.req.valid("json");

  const tour = await prisma.tour.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!tour) {
    return c.json({ error: { message: "Tour not found", code: "NOT_FOUND" } }, 404);
  }

  const show = await prisma.tourShow.create({
    data: {
      tourId: id,
      date: new Date(body.date),
      type: body.type ?? "show",
      fromLocation: body.fromLocation ?? null,
      toLocation: body.toLocation ?? null,
      showTime: body.showTime ?? null,
      getInTime: body.getInTime ?? null,
      rehearsalTime: body.rehearsalTime ?? null,
      soundcheckTime: body.soundcheckTime ?? null,
      doorsTime: body.doorsTime ?? null,
      venueName: body.venueName ?? null,
      venueAddress: body.venueAddress ?? null,
      venueCity: body.venueCity ?? null,
      contactName: body.contactName ?? null,
      contactPhone: body.contactPhone ?? null,
      contactEmail: body.contactEmail ?? null,
      hotelName: body.hotelName ?? null,
      hotelAddress: body.hotelAddress ?? null,
      hotelPhone: body.hotelPhone ?? null,
      hotelCheckIn: body.hotelCheckIn ?? null,
      hotelCheckOut: body.hotelCheckOut ?? null,
      travelInfo: body.travelInfo ?? null,
      cateringInfo: body.cateringInfo ?? null,
      notes: body.notes ?? null,
      order: body.order ?? 0,
      handsNeeded: body.handsNeeded ?? null,
      travelTimeMinutes: body.travelTimeMinutes ?? null,
      distanceKm: body.distanceKm ?? null,
    },
  });

  return c.json({ data: serializeTourShow(show) }, 201);
});

// PUT /api/tours/:id/shows/:showId — update a show
toursRouter.put(
  "/tours/:id/shows/:showId",
  zValidator("json", UpdateTourShowSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId)
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

    if (!canWrite(user.orgRole)) {
      return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
    }

    const { id, showId } = c.req.param();
    const body = c.req.valid("json");

    // Verify tour belongs to org
    const tour = await prisma.tour.findUnique({
      where: { id, organizationId: user.organizationId },
    });
    if (!tour) {
      return c.json({ error: { message: "Tour not found", code: "NOT_FOUND" } }, 404);
    }

    const existingShow = await prisma.tourShow.findUnique({
      where: { id: showId, tourId: id },
    });
    if (!existingShow) {
      return c.json({ error: { message: "Show not found", code: "NOT_FOUND" } }, 404);
    }

    const show = await prisma.tourShow.update({
      where: { id: showId },
      data: {
        ...(body.date !== undefined && { date: new Date(body.date) }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.fromLocation !== undefined && { fromLocation: body.fromLocation }),
        ...(body.toLocation !== undefined && { toLocation: body.toLocation }),
        ...(body.showTime !== undefined && { showTime: body.showTime }),
        ...(body.getInTime !== undefined && { getInTime: body.getInTime }),
        ...(body.rehearsalTime !== undefined && { rehearsalTime: body.rehearsalTime }),
        ...(body.soundcheckTime !== undefined && { soundcheckTime: body.soundcheckTime }),
        ...(body.doorsTime !== undefined && { doorsTime: body.doorsTime }),
        ...(body.venueName !== undefined && { venueName: body.venueName }),
        ...(body.venueAddress !== undefined && { venueAddress: body.venueAddress }),
        ...(body.venueCity !== undefined && { venueCity: body.venueCity }),
        ...(body.contactName !== undefined && { contactName: body.contactName }),
        ...(body.contactPhone !== undefined && { contactPhone: body.contactPhone }),
        ...(body.contactEmail !== undefined && { contactEmail: body.contactEmail }),
        ...(body.hotelName !== undefined && { hotelName: body.hotelName }),
        ...(body.hotelAddress !== undefined && { hotelAddress: body.hotelAddress }),
        ...(body.hotelPhone !== undefined && { hotelPhone: body.hotelPhone }),
        ...(body.hotelCheckIn !== undefined && { hotelCheckIn: body.hotelCheckIn }),
        ...(body.hotelCheckOut !== undefined && { hotelCheckOut: body.hotelCheckOut }),
        ...(body.travelInfo !== undefined && { travelInfo: body.travelInfo }),
        ...(body.cateringInfo !== undefined && { cateringInfo: body.cateringInfo }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.order !== undefined && { order: body.order }),
        ...(body.handsNeeded !== undefined && { handsNeeded: body.handsNeeded }),
        ...(body.travelTimeMinutes !== undefined && { travelTimeMinutes: body.travelTimeMinutes }),
        ...(body.distanceKm !== undefined && { distanceKm: body.distanceKm }),
      },
    });

    return c.json({ data: serializeTourShow(show) });
  }
);

// DELETE /api/tours/:id/shows/:showId — delete a show
toursRouter.delete("/tours/:id/shows/:showId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canWrite(user.orgRole)) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id, showId } = c.req.param();

  // Verify tour belongs to org
  const tour = await prisma.tour.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!tour) {
    return c.json({ error: { message: "Tour not found", code: "NOT_FOUND" } }, 404);
  }

  const existingShow = await prisma.tourShow.findUnique({
    where: { id: showId, tourId: id },
  });
  if (!existingShow) {
    return c.json({ error: { message: "Show not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.tourShow.delete({ where: { id: showId } });
  return new Response(null, { status: 204 });
});

// POST /api/tours/:id/people — add person to tour
toursRouter.post(
  "/tours/:id/people",
  zValidator("json", z.object({ personId: z.string(), role: z.string().optional() })),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId)
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

    if (!canWrite(user.orgRole)) {
      return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
    }

    const { id } = c.req.param();
    const body = c.req.valid("json");

    const tour = await prisma.tour.findUnique({
      where: { id, organizationId: user.organizationId },
    });
    if (!tour) {
      return c.json({ error: { message: "Tour not found", code: "NOT_FOUND" } }, 404);
    }

    const person = await prisma.person.findUnique({
      where: { id: body.personId, organizationId: user.organizationId },
    });
    if (!person) {
      return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);
    }

    const tourPerson = await prisma.tourPerson.upsert({
      where: {
        tourId_personId: { tourId: id, personId: body.personId },
      },
      update: {
        role: body.role ?? null,
      },
      create: {
        tourId: id,
        personId: body.personId,
        role: body.role ?? null,
      },
      include: { person: true },
    });

    return c.json(
      {
        data: {
          id: tourPerson.id,
          tourId: tourPerson.tourId,
          personId: tourPerson.personId,
          role: tourPerson.role,
          person: serializePerson(tourPerson.person),
        },
      },
      201
    );
  }
);

// DELETE /api/tours/:id/people/:personId — remove person from tour
toursRouter.delete("/tours/:id/people/:personId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canWrite(user.orgRole)) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id, personId } = c.req.param();

  // Verify tour belongs to org
  const tour = await prisma.tour.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!tour) {
    return c.json({ error: { message: "Tour not found", code: "NOT_FOUND" } }, 404);
  }

  const tourPerson = await prisma.tourPerson.findUnique({
    where: { tourId_personId: { tourId: id, personId } },
  });
  if (!tourPerson) {
    return c.json({ error: { message: "Person assignment not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.tourPerson.delete({
    where: { tourId_personId: { tourId: id, personId } },
  });

  return new Response(null, { status: 204 });
});

// POST /api/tours/:id/tech-rider — upload static tech rider PDF
toursRouter.post("/tours/:id/tech-rider", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  if (!canWrite(user.orgRole))
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);

  const { id } = c.req.param();
  const tour = await prisma.tour.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!tour) return c.json({ error: { message: "Tour not found", code: "NOT_FOUND" } }, 404);

  const formData = await c.req.parseBody();
  const file = formData["file"];
  if (!file || typeof file === "string")
    return c.json({ error: { message: "File is required", code: "BAD_REQUEST" } }, 400);

  const arrayBuffer = await (file as File).arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await prisma.tour.update({
    where: { id },
    data: {
      techRiderPdfData: buffer,
      techRiderPdfName: (file as File).name,
    },
  });

  return c.json({ data: { name: (file as File).name } }, 201);
});

// GET /api/tours/:id/tech-rider/download — download the static tech rider PDF bytes
toursRouter.get("/tours/:id/tech-rider/download", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const { id } = c.req.param();
  const tour = await prisma.tour.findUnique({
    where: { id, organizationId: user.organizationId },
    select: { techRiderPdfData: true, techRiderPdfName: true },
  });

  if (!tour?.techRiderPdfData)
    return c.json({ error: { message: "No tech rider PDF uploaded", code: "NOT_FOUND" } }, 404);

  return new Response(tour.techRiderPdfData, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${tour.techRiderPdfName || "tech-rider.pdf"}"`,
      "Content-Length": String(tour.techRiderPdfData.length),
    },
  });
});

// DELETE /api/tours/:id/tech-rider — remove the static tech rider PDF
toursRouter.delete("/tours/:id/tech-rider", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  if (!canWrite(user.orgRole))
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);

  const { id } = c.req.param();
  const tour = await prisma.tour.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!tour) return c.json({ error: { message: "Tour not found", code: "NOT_FOUND" } }, 404);

  await prisma.tour.update({
    where: { id },
    data: { techRiderPdfData: null, techRiderPdfName: null },
  });

  return new Response(null, { status: 204 });
});

export default toursRouter;
