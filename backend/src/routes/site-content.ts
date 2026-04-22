import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { adminMiddleware } from "../admin-middleware";
import { getDefaultSiteContentMap } from "../seed-packs";
import { LanguageSchema } from "../types";

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

type SiteContentRow = { key: string; locale: string; value: string };

/** Defaults first; `en` rows fill in; non-`en` locales override by key. */
function mergeSiteContentForLanguage(rows: SiteContentRow[], language: z.infer<typeof LanguageSchema>): Record<string, string> {
  const defaults = getDefaultSiteContentMap();
  const enRows = rows.filter((r) => r.locale === "en");
  const langRows = language === "en" ? [] : rows.filter((r) => r.locale === language);

  const out: Record<string, string> = { ...defaults };
  for (const row of enRows) {
    const dbValue = row.value;
    if (dbValue.trim() === "") continue;
    if (
      (row.key === "terms_content" || row.key === "privacy_content" || row.key === "refund_content") &&
      isLegacyLegalPlaceholder(row.key, dbValue)
    ) {
      continue;
    }
    out[row.key] = dbValue;
  }
  for (const row of langRows) {
    if (row.value.trim() === "") continue;
    if (
      (row.key === "terms_content" || row.key === "privacy_content" || row.key === "refund_content") &&
      isLegacyLegalPlaceholder(row.key, row.value)
    ) {
      continue;
    }
    out[row.key] = row.value;
  }
  return out;
}

const siteContentRouter = new Hono<{
  Variables: { user: typeof auth.$Infer.Session.user | null };
}>();

function parseLanguage(c: { req: { query: (k: string) => string | undefined } }): z.infer<typeof LanguageSchema> {
  const raw = c.req.query("language") ?? c.req.query("lang") ?? "en";
  const parsed = LanguageSchema.safeParse(raw);
  return parsed.success ? parsed.data : "en";
}

siteContentRouter.get("/site-content", async (c) => {
  const language = parseLanguage(c);
  const rows = await prisma.siteContent.findMany();
  const data = mergeSiteContentForLanguage(rows, language);
  return c.json({ data });
});

siteContentRouter.use("/admin/site-content/*", adminMiddleware);
siteContentRouter.use("/admin/site-content", adminMiddleware);

siteContentRouter.get("/admin/site-content", async (c) => {
  const language = parseLanguage(c);
  const rows = await prisma.siteContent.findMany({ orderBy: [{ key: "asc" }, { locale: "asc" }] });
  const data = mergeSiteContentForLanguage(rows, language);
  return c.json({ data });
});

const putBodySchema = z.record(z.string(), z.string());

siteContentRouter.put("/admin/site-content", async (c) => {
  const language = parseLanguage(c);
  const body = await c.req.json();
  const updates = putBodySchema.parse(body);

  await prisma.$transaction(
    Object.entries(updates).map(([key, value]) =>
      prisma.siteContent.upsert({
        where: { key_locale: { key, locale: language } },
        update: { value },
        create: { key, locale: language, value },
      })
    )
  );

  const rows = await prisma.siteContent.findMany({ orderBy: [{ key: "asc" }, { locale: "asc" }] });
  const data = mergeSiteContentForLanguage(rows, language);
  return c.json({ data });
});

export default siteContentRouter;
