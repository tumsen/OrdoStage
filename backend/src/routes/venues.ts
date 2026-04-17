import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { CreateVenueSchema, UpdateVenueSchema } from "../types";
import { canWrite } from "../permissions";
import { env } from "../env";

const venuesRouter = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

function parseCustomFields(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.key === "string")
      .map((item) => ({
        key: String(item.key),
        value: item.value == null ? "" : String(item.value),
      }));
  } catch {
    return [];
  }
}

function serializeVenue(venue: {
  id: string;
  name: string;
  address: string | null;
  capacity: number | null;
  stageSize: string | null;
  ceilingHeight: string | null;
  customFields: string | null;
  notes: string | null;
  organizationId: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...venue,
    customFields: parseCustomFields(venue.customFields),
    createdAt: venue.createdAt.toISOString(),
    updatedAt: venue.updatedAt.toISOString(),
  };
}

// GET /api/venues
venuesRouter.get("/venues", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const venues = await prisma.venue.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { createdAt: "desc" },
  });
  return c.json({ data: venues.map(serializeVenue) });
});

// GET /api/venues/address-search?q=...
venuesRouter.get("/venues/address-search", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  const query = c.req.query("q")?.trim();
  if (!query || query.length < 3) {
    return c.json({ data: [] });
  }

  if (!env.GOOGLE_MAPS_API_KEY) {
    return c.json({ data: [] });
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", query);
  url.searchParams.set("types", "address");
  url.searchParams.set("key", env.GOOGLE_MAPS_API_KEY);

  const response = await fetch(url.toString());
  if (!response.ok) {
    return c.json({ data: [] });
  }

  const payload = (await response.json()) as {
    predictions?: Array<{ place_id?: string; description?: string }>;
  };

  const predictions = (payload.predictions ?? [])
    .filter((prediction) => prediction.place_id && prediction.description)
    .map((prediction) => ({
      placeId: prediction.place_id as string,
      description: prediction.description as string,
    }));

  return c.json({ data: predictions });
});

// POST /api/venues
venuesRouter.post("/venues", zValidator("json", CreateVenueSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canWrite(user.orgRole)) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const body = c.req.valid("json");
  const venue = await prisma.venue.create({
    data: {
      name: body.name,
      address: body.address ?? null,
      capacity: body.capacity ?? null,
      stageSize: body.stageSize ?? null,
      ceilingHeight: body.ceilingHeight ?? null,
      customFields: body.customFields ? JSON.stringify(body.customFields) : null,
      notes: body.notes ?? null,
      organizationId: user.organizationId,
    },
  });
  return c.json({ data: serializeVenue(venue) }, 201);
});

// GET /api/venues/:id
venuesRouter.get("/venues/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const { id } = c.req.param();
  const venue = await prisma.venue.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!venue) {
    return c.json({ error: { message: "Venue not found", code: "NOT_FOUND" } }, 404);
  }
  return c.json({ data: serializeVenue(venue) });
});

// PUT /api/venues/:id
venuesRouter.put("/venues/:id", zValidator("json", UpdateVenueSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canWrite(user.orgRole)) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const body = c.req.valid("json");
  const existing = await prisma.venue.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) {
    return c.json({ error: { message: "Venue not found", code: "NOT_FOUND" } }, 404);
  }
  const venue = await prisma.venue.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.address !== undefined && { address: body.address }),
      ...(body.capacity !== undefined && { capacity: body.capacity }),
      ...(body.stageSize !== undefined && { stageSize: body.stageSize }),
      ...(body.ceilingHeight !== undefined && { ceilingHeight: body.ceilingHeight }),
      ...(body.customFields !== undefined && {
        customFields: body.customFields ? JSON.stringify(body.customFields) : null,
      }),
      ...(body.notes !== undefined && { notes: body.notes }),
    },
  });
  return c.json({ data: serializeVenue(venue) });
});

// DELETE /api/venues/:id
venuesRouter.delete("/venues/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canWrite(user.orgRole)) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const { id } = c.req.param();
  const existing = await prisma.venue.findUnique({
    where: { id, organizationId: user.organizationId },
  });
  if (!existing) {
    return c.json({ error: { message: "Venue not found", code: "NOT_FOUND" } }, 404);
  }
  await prisma.venue.delete({ where: { id } });
  return new Response(null, { status: 204 });
});

export default venuesRouter;
