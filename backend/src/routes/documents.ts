import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";

const documentsRouter = new Hono<{ Variables: { user: typeof auth.$Infer.Session.user | null } }>();

// GET /api/events/:eventId/documents
documentsRouter.get("/events/:eventId/documents", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const { eventId } = c.req.param();

  const event = await prisma.event.findUnique({
    where: { id: eventId, organizationId: user.organizationId },
  });
  if (!event) {
    return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  }

  const documents = await prisma.document.findMany({
    where: { eventId },
    select: {
      id: true,
      eventId: true,
      name: true,
      type: true,
      filename: true,
      mimeType: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json({
    data: documents.map((doc) => ({
      ...doc,
      createdAt: doc.createdAt.toISOString(),
    })),
  });
});

// POST /api/events/:eventId/documents — multipart file upload
documentsRouter.post("/events/:eventId/documents", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const { eventId } = c.req.param();

  const event = await prisma.event.findUnique({
    where: { id: eventId, organizationId: user.organizationId },
  });
  if (!event) {
    return c.json({ error: { message: "Event not found", code: "NOT_FOUND" } }, 404);
  }

  const formData = await c.req.parseBody();
  const file = formData["file"];
  const name = formData["name"];
  const type = formData["type"];

  if (!file || typeof file === "string") {
    return c.json({ error: { message: "File is required", code: "BAD_REQUEST" } }, 400);
  }

  if (typeof name !== "string" || !name.trim()) {
    return c.json({ error: { message: "Name is required", code: "BAD_REQUEST" } }, 400);
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const document = await prisma.document.create({
    data: {
      eventId,
      name: name.trim(),
      type: typeof type === "string" && type.trim() ? type.trim() : "other",
      filename: file.name,
      data: buffer,
      mimeType: file.type || "application/octet-stream",
    },
    select: {
      id: true,
      eventId: true,
      name: true,
      type: true,
      filename: true,
      mimeType: true,
      createdAt: true,
    },
  });

  return c.json(
    {
      data: {
        ...document,
        createdAt: document.createdAt.toISOString(),
      },
    },
    201
  );
});

// GET /api/documents/:id/download — serve file
documentsRouter.get("/documents/:id/download", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const { id } = c.req.param();

  // Verify document belongs to org via event relation
  const document = await prisma.document.findFirst({
    where: {
      id,
      event: { organizationId: user.organizationId },
    },
  });
  if (!document) {
    return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  }

  return new Response(document.data, {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": `attachment; filename="${document.filename}"`,
      "Content-Length": String(document.data.length),
    },
  });
});

// DELETE /api/documents/:id
documentsRouter.delete("/documents/:id", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId)
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);

  const { id } = c.req.param();

  const document = await prisma.document.findFirst({
    where: {
      id,
      event: { organizationId: user.organizationId },
    },
  });
  if (!document) {
    return c.json({ error: { message: "Document not found", code: "NOT_FOUND" } }, 404);
  }

  await prisma.document.delete({ where: { id } });
  return new Response(null, { status: 204 });
});

export default documentsRouter;
