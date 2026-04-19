import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { adminMiddleware } from "../admin-middleware";
import { getDefaultSiteContentMap } from "../seed-packs";

/** Old seed/marketing placeholders — DB still has these on many installs; prefer full legal defaults from repo. */
function isLegacyLegalPlaceholder(key: string, dbValue: string): boolean {
  const v = dbValue.trim();
  if (!v) return true;
  if (key === "terms_content") {
    return (
      v.startsWith("## Terms of Service") ||
      v.includes("By using OrdoStage") ||
      (v.length < 800 && !v.includes("Last updated: April 2026"))
    );
  }
  if (key === "privacy_content") {
    return (
      v.startsWith("## Privacy Policy") ||
      v.includes("OrdoStage stores organization") ||
      (v.length < 800 && !v.includes("Last updated: April 2026"))
    );
  }
  if (key === "refund_content") {
    return v.startsWith("## Refund Policy") || v.includes("Credit-pack purchases are generally non-refundable once credits are delivered.");
  }
  return false;
}

/** Defaults first; DB fills in. Empty strings and legacy stub legal rows do not override canonical defaults in repo. */
function mergeSiteContentRows(rows: { key: string; value: string }[]): Record<string, string> {
  const defaults = getDefaultSiteContentMap();
  const fromDb = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const out: Record<string, string> = { ...defaults };
  for (const [key, dbValue] of Object.entries(fromDb)) {
    if ((key === "terms_content" || key === "privacy_content" || key === "refund_content") && isLegacyLegalPlaceholder(key, dbValue)) {
      continue;
    }
    if (dbValue.trim() === "") continue;
    out[key] = dbValue;
  }
  return out;
}

const siteContentRouter = new Hono<{
  Variables: { user: typeof auth.$Infer.Session.user | null };
}>();

siteContentRouter.get("/site-content", async (c) => {
  const rows = await prisma.siteContent.findMany();
  const data = mergeSiteContentRows(rows);
  return c.json({ data });
});

siteContentRouter.use("/admin/site-content/*", adminMiddleware);
siteContentRouter.use("/admin/site-content", adminMiddleware);

siteContentRouter.get("/admin/site-content", async (c) => {
  const rows = await prisma.siteContent.findMany({ orderBy: { key: "asc" } });
  const data = mergeSiteContentRows(rows);
  return c.json({ data });
});

siteContentRouter.put("/admin/site-content", async (c) => {
  const body = await c.req.json();
  const schema = z.record(z.string(), z.string());
  const updates = schema.parse(body);

  await prisma.$transaction(
    Object.entries(updates).map(([key, value]) =>
      prisma.siteContent.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    )
  );

  const rows = await prisma.siteContent.findMany({ orderBy: { key: "asc" } });
  const data = mergeSiteContentRows(rows);
  return c.json({ data });
});

export default siteContentRouter;
