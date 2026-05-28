import { prisma } from "./prisma";
import {
  DEFAULT_PRIVACY_CONTENT,
  DEFAULT_REFUND_CONTENT,
  DEFAULT_TERMS_CONTENT,
} from "./legal-defaults";
import { getLandingSeedRows, mergeLandingDefaults, type Language as SiteLanguage } from "./site-content-defaults";
import type { z } from "zod";
import type { LanguageSchema } from "./types";

const DEFAULT_SITE_CONTENT: Array<{ key: string; value: string }> = [
  { key: "terms_content", value: DEFAULT_TERMS_CONTENT },
  { key: "privacy_content", value: DEFAULT_PRIVACY_CONTENT },
  { key: "refund_content", value: DEFAULT_REFUND_CONTENT },
  { key: "company_brand", value: "Ordo Stage" },
  { key: "company_entity", value: "Schwifty" },
  { key: "company_address", value: "Strandgade 1, 5700 Svendborg, Denmark" },
  { key: "company_vat", value: "DK28625383" },
  { key: "company_email", value: "mail@ordostage.com" },
  {
    key: "pricing_page_title",
    value: "Flex or Yearly — pricing that scales with your team",
  },
  /** Global (English row is source of truth; merged for all languages). 1 = on, 0 = off. */
  { key: "public_maintenance_mode", value: "0" },
  {
    key: "public_maintenance_title",
    value: "We will be back soon",
  },
  {
    key: "public_maintenance_subtitle",
    value: "OrdoStage is being updated. Please try again in a little while.",
  },
  {
    key: "pricing_intro",
    value: [
      "Two plans: Flex (monthly postpaid for billable activity) and Yearly (committed seats, 12 months upfront).",
      "Flex: pay for real usage each month—or nothing when the team is quiet. No annual lock-in.",
      "Yearly: deepest volume discount when your roster is stable; checkout in the app via Paddle.",
      "Yearly overage above commitment is billed monthly at Flex marginal rates; seat increases are prorated top-ups.",
    ].join("\n\n"),
  },
  {
    key: "pricing_notes",
    value: [
      "Self-serve Yearly checkout up to 150 seats; contact us for enterprise.",
      "For custom commercial terms, contact mail@ordostage.com.",
    ].join("\n"),
  },
];

function getBaseSiteContentMap(): Record<string, string> {
  return Object.fromEntries(DEFAULT_SITE_CONTENT.map((item) => [item.key, item.value]));
}

/** Merged into GET /api/site-content and GET /api/admin/site-content so UIs always see full defaults when keys are missing in DB. */
export function getDefaultSiteContentMap(language: z.infer<typeof LanguageSchema> = "en"): Record<string, string> {
  return mergeLandingDefaults(getBaseSiteContentMap(), language as SiteLanguage);
}

export async function seedPacks() {
  for (const item of DEFAULT_SITE_CONTENT) {
    await prisma.siteContent.upsert({
      where: { key_locale: { key: item.key, locale: "en" } },
      update: {},
      create: { key: item.key, locale: "en", value: item.value },
    });
  }
  for (const row of getLandingSeedRows()) {
    await prisma.siteContent.upsert({
      where: { key_locale: { key: row.key, locale: row.locale } },
      update: {},
      create: { key: row.key, locale: row.locale, value: row.value },
    });
  }
}
