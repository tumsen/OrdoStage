import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import {
  contentDispositionHeader,
  sanitizeStoredFilename,
} from "../lib/contentDisposition";
import { filenameFromDisplayRename } from "../lib/documentFilenameRename";
import { CreateVenueSchema, UpdateVenueSchema, UpdateVenueDocumentSchema, type VenueDocumentKind } from "../types";
import { canAction } from "../requestRole";
import { env } from "../env";
import {
  GoogleMapsNotConfiguredError,
  googlePlaceAutocomplete,
  googlePlaceDetails,
} from "../lib/googlePlaces";

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

function serializeVenue(
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
    width: string | null;
    length: string | null;
    height: string | null;
    contactPersonName: string | null;
    contactPersonEmail: string | null;
    contactPersonPhone: string | null;
    contactPersonRole: string | null;
    contactCompanyName: string | null;
    contactCompanyVat: string | null;
    customFields: string | null;
    notes: string | null;
    organizationId: string;
    createdAt: Date;
    updatedAt: Date;
  },
  documentCount?: number,
  documentThumbnails?: Array<{ id: string; kind: string; name: string; filename: string; mimeType: string }>
) {
  const { organizationId: _org, ...rest } = venue;
  return {
    ...rest,
    customFields: parseCustomFields(venue.customFields),
    createdAt: venue.createdAt.toISOString(),
    updatedAt: venue.updatedAt.toISOString(),
    ...(documentCount !== undefined ? { documentCount } : {}),
    ...(documentThumbnails !== undefined
      ? {
          documentThumbnails: documentThumbnails.map((d) => ({
            id: d.id,
            kind: normalizeVenueDocKind(d.kind),
            name: d.name,
            filename: d.filename,
            mimeType: d.mimeType,
          })),
        }
      : {}),
  };
}

function normalizeVenueDocKind(raw: string | undefined): VenueDocumentKind {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "drawing" || s === "image" || s === "document" || s === "other") return s;
  return "other";
}

function serializeVenueDocument(row: {
  id: string;
  venueId: string;
  name: string;
  kind: string;
  filename: string;
  mimeType: string;
  createdAt: Date;
}) {
  const kind = normalizeVenueDocKind(row.kind);
  return {
    id: row.id,
    venueId: row.venueId,
    name: row.name,
    kind,
    filename: row.filename,
    mimeType: row.mimeType,
    createdAt: row.createdAt.toISOString(),
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
    include: {
      _count: { select: { documents: true } },
      documents: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, kind: true, name: true, filename: true, mimeType: true },
      },
    },
  });
  return c.json({
    data: venues.map((v) => {
      const { _count, documents, ...row } = v;
      return serializeVenue(row, _count.documents, documents);
    }),
  });
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
    return c.json(
      {
        error: {
          message: "Google Maps address search is not configured on the server.",
          code: "GOOGLE_MAPS_NOT_CONFIGURED",
        },
      },
      503
    );
  }

  try {
    const predictions = await googlePlaceAutocomplete({
      input: query,
      country: c.req.query("country")?.trim().toLowerCase(),
      types: c.req.query("types")?.trim(),
    });
    return c.json({ data: predictions });
  } catch (error) {
    if (error instanceof GoogleMapsNotConfiguredError) {
      return c.json(
        {
          error: {
            message: "Google Maps address search is not configured on the server.",
            code: "GOOGLE_MAPS_NOT_CONFIGURED",
          },
        },
        503
      );
    }
    return c.json({ data: [] });
  }
});

// GET /api/venues/address-details?placeId=... — returns structured address components
venuesRouter.get("/venues/address-details", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }

  const placeId = c.req.query("placeId")?.trim();
  if (!placeId) return c.json({ data: null });

  if (!env.GOOGLE_MAPS_API_KEY) {
    return c.json(
      {
        error: {
          message: "Google Maps address details are not configured on the server.",
          code: "GOOGLE_MAPS_NOT_CONFIGURED",
        },
      },
      503
    );
  }

  try {
    const data = await googlePlaceDetails(placeId);
    return c.json({ data });
  } catch (error) {
    if (error instanceof GoogleMapsNotConfiguredError) {
      return c.json(
        {
          error: {
            message: "Google Maps address details are not configured on the server.",
            code: "GOOGLE_MAPS_NOT_CONFIGURED",
          },
        },
        503
      );
    }
    return c.json({ data: null });
  }
});

// POST /api/venues
venuesRouter.post("/venues", zValidator("json", CreateVenueSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canAction(c, "write.venues")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }

  const body = c.req.valid("json");
  const venue = await prisma.venue.create({
    data: {
      name: body.name,
      addressStreet:  body.addressStreet  ?? null,
      addressNumber:  body.addressNumber  ?? null,
      addressZip:     body.addressZip     ?? null,
      addressCity:    body.addressCity    ?? null,
      addressState:   body.addressState   ?? null,
      addressCountry: body.addressCountry ?? null,
      capacity: body.capacity ?? null,
      width: body.width ?? null,
      length: body.length ?? null,
      height: body.height ?? null,
      contactPersonName: body.contactPersonName?.trim() || null,
      contactPersonEmail: body.contactPersonEmail?.trim() || null,
      contactPersonPhone: body.contactPersonPhone?.trim() || null,
      contactPersonRole: body.contactPersonRole?.trim() || null,
      contactCompanyName: body.contactCompanyName?.trim() || null,
      contactCompanyVat: body.contactCompanyVat?.trim() || null,
      customFields: body.customFields ? JSON.stringify(body.customFields) : null,
      notes: body.notes ?? null,
      organizationId: user.organizationId,
    },
  });
  return c.json({ data: serializeVenue(venue, 0) }, 201);
});

// GET /api/venues/documents/:docId/download — before /venues/:id
venuesRouter.get("/venues/documents/:docId/download", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { docId } = c.req.param();
  const doc = await prisma.venueDocument.findFirst({
    where: { id: docId, venue: { organizationId: user.organizationId } },
    select: { id: true, data: true, mimeType: true, filename: true },
  });
  if (!doc) {
    return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  }
  return new Response(doc.data, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": contentDispositionHeader("attachment", doc.filename),
      "Content-Length": String(doc.data.length),
    },
  });
});

venuesRouter.patch("/venues/documents/:docId", zValidator("json", UpdateVenueDocumentSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "write.venues")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  const { docId } = c.req.param();
  const body = c.req.valid("json");
  const doc = await prisma.venueDocument.findFirst({
    where: { id: docId, venue: { organizationId: user.organizationId } },
    select: { id: true, filename: true },
  });
  if (!doc) {
    return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  }
  const data: { name?: string; kind?: string; filename?: string } = {};
  if (body.name !== undefined) {
    const nextName = body.name.trim();
    data.name = nextName;
    data.filename = filenameFromDisplayRename(nextName, doc.filename);
  }
  if (body.kind !== undefined) data.kind = body.kind;
  const row = await prisma.venueDocument.update({
    where: { id: doc.id },
    data,
    select: {
      id: true,
      venueId: true,
      name: true,
      kind: true,
      filename: true,
      mimeType: true,
      createdAt: true,
    },
  });
  return c.json({ data: serializeVenueDocument(row) });
});

venuesRouter.delete("/venues/documents/:docId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "write.venues")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  const { docId } = c.req.param();
  const doc = await prisma.venueDocument.findFirst({
    where: { id: docId, venue: { organizationId: user.organizationId } },
    select: { id: true },
  });
  if (!doc) {
    return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  }
  await prisma.venueDocument.delete({ where: { id: doc.id } });
  return new Response(null, { status: 204 });
});

// GET /api/venues/:id/documents
venuesRouter.get("/venues/:id/documents", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  const { id } = c.req.param();
  const venue = await prisma.venue.findUnique({
    where: { id, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!venue) {
    return c.json({ error: { message: "Venue not found", code: "NOT_FOUND" } }, 404);
  }
  const rows = await prisma.venueDocument.findMany({
    where: { venueId: id },
    select: {
      id: true,
      venueId: true,
      name: true,
      kind: true,
      filename: true,
      mimeType: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return c.json({ data: rows.map(serializeVenueDocument) });
});

// POST /api/venues/:id/documents (multipart)
venuesRouter.post("/venues/:id/documents", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "write.venues")) {
    return c.json({ error: { message: "Insufficient permissions", code: "FORBIDDEN" } }, 403);
  }
  const { id } = c.req.param();
  const venue = await prisma.venue.findUnique({
    where: { id, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!venue) {
    return c.json({ error: { message: "Venue not found", code: "NOT_FOUND" } }, 404);
  }
  const formData = await c.req.parseBody();
  const file = formData["file"];
  const name = formData["name"];
  const kindField = formData["kind"];
  if (!file || typeof file === "string") {
    return c.json({ error: { message: "File is required", code: "BAD_REQUEST" } }, 400);
  }
  const rawName = typeof name === "string" && name.trim() ? name.trim() : file.name;
  const kind = normalizeVenueDocKind(typeof kindField === "string" ? kindField : undefined);
  const bytes = Buffer.from(await file.arrayBuffer());
  const row = await prisma.venueDocument.create({
    data: {
      venueId: venue.id,
      name: rawName,
      kind,
      filename: sanitizeStoredFilename(file.name),
      data: bytes,
      mimeType: file.type || "application/octet-stream",
    },
    select: {
      id: true,
      venueId: true,
      name: true,
      kind: true,
      filename: true,
      mimeType: true,
      createdAt: true,
    },
  });
  return c.json({ data: serializeVenueDocument(row) }, 201);
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
  const count = await prisma.venueDocument.count({ where: { venueId: venue.id } });
  return c.json({ data: serializeVenue(venue, count) });
});

// PUT /api/venues/:id
venuesRouter.put("/venues/:id", zValidator("json", UpdateVenueSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canAction(c, "write.venues")) {
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
      ...(body.addressStreet  !== undefined && { addressStreet:  body.addressStreet }),
      ...(body.addressNumber  !== undefined && { addressNumber:  body.addressNumber }),
      ...(body.addressZip     !== undefined && { addressZip:     body.addressZip }),
      ...(body.addressCity    !== undefined && { addressCity:    body.addressCity }),
      ...(body.addressState   !== undefined && { addressState:   body.addressState }),
      ...(body.addressCountry !== undefined && { addressCountry: body.addressCountry }),
      ...(body.capacity !== undefined && { capacity: body.capacity }),
      ...(body.width !== undefined && { width: body.width }),
      ...(body.length !== undefined && { length: body.length }),
      ...(body.height !== undefined && { height: body.height }),
      ...(body.contactPersonName !== undefined && {
        contactPersonName: body.contactPersonName?.trim() || null,
      }),
      ...(body.contactPersonEmail !== undefined && {
        contactPersonEmail: body.contactPersonEmail?.trim() || null,
      }),
      ...(body.contactPersonPhone !== undefined && {
        contactPersonPhone: body.contactPersonPhone?.trim() || null,
      }),
      ...(body.contactPersonRole !== undefined && {
        contactPersonRole: body.contactPersonRole?.trim() || null,
      }),
      ...(body.contactCompanyName !== undefined && {
        contactCompanyName: body.contactCompanyName?.trim() || null,
      }),
      ...(body.contactCompanyVat !== undefined && {
        contactCompanyVat: body.contactCompanyVat?.trim() || null,
      }),
      ...(body.customFields !== undefined && {
        customFields: body.customFields ? JSON.stringify(body.customFields) : null,
      }),
      ...(body.notes !== undefined && { notes: body.notes }),
    },
  });
  const docCount = await prisma.venueDocument.count({ where: { venueId: venue.id } });
  return c.json({ data: serializeVenue(venue, docCount) });
});

// DELETE /api/venues/:id
venuesRouter.delete("/venues/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  if (!canAction(c, "write.venues")) {
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
