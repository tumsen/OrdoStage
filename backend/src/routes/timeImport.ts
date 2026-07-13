import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { auth } from "../auth";
import { canAction } from "../requestRole";
import {
  TimeImportPreviewRequestSchema,
  TimeImportRemapRequestSchema,
  TimeImportRunRequestSchema,
} from "../types";
import {
  listImportBatches,
  listImportExternals,
  previewTimerlyImport,
  remapImportedEntries,
  runTimerlyImport,
} from "../services/timeImport";

const timeImportRouter = new Hono<{
  Variables: { user: typeof auth.$Infer.Session.user | null };
}>();

function iso(d: Date) {
  return d.toISOString();
}

timeImportRouter.post(
  "/time/import/preview",
  zValidator("json", TimeImportPreviewRequestSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId) {
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    }
    if (!canAction(c, "time.read_all")) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }
    const body = c.req.valid("json");
    const data = await previewTimerlyImport(user.organizationId, body.csvText, body.fileName);
    return c.json({ data });
  }
);

timeImportRouter.post(
  "/time/import/run",
  zValidator("json", TimeImportRunRequestSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId || !user.id) {
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    }
    if (!canAction(c, "time.read_all")) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }
    const body = c.req.valid("json");
    try {
      const data = await runTimerlyImport({
        organizationId: user.organizationId,
        userId: user.id,
        csvText: body.csvText,
        fileName: body.fileName,
        personMappings: body.personMappings,
        projectMappings: body.projectMappings,
        tagMappings: body.tagMappings,
        batchId: body.batchId,
        offset: body.offset,
        limit: body.limit,
      });
      return c.json({ data });
    } catch (err) {
      console.error("[time-import]", err);
      const message = err instanceof Error ? err.message : "Import failed";
      const code =
        message.includes("TimeImportBatch") || message.includes("importBatchId")
          ? "MIGRATION_REQUIRED"
          : "IMPORT_FAILED";
      return c.json({ error: { message, code } }, code === "MIGRATION_REQUIRED" ? 503 : 500);
    }
  }
);

timeImportRouter.post(
  "/time/import/remap",
  zValidator("json", TimeImportRemapRequestSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId) {
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    }
    if (!canAction(c, "time.read_all")) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }
    const body = c.req.valid("json");
    const data = await remapImportedEntries({
      organizationId: user.organizationId,
      batchId: body.batchId,
      projectMappings: body.projectMappings,
      tagMappings: body.tagMappings,
    });
    return c.json({ data });
  }
);

timeImportRouter.get("/time/import/batches", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "time.read_all")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const rows = await listImportBatches(user.organizationId);
  return c.json({
    data: rows.map((r: (typeof rows)[number]) => ({
      ...r,
      createdAt: iso(r.createdAt),
    })),
  });
});

timeImportRouter.get("/time/import/externals", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "time.read_all")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const batchId = c.req.query("batchId");
  const data = await listImportExternals(user.organizationId, batchId || undefined);
  return c.json({ data });
});

export default timeImportRouter;
