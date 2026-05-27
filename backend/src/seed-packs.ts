import { prisma } from "./prisma";
import {
  DEFAULT_PRIVACY_CONTENT,
  DEFAULT_REFUND_CONTENT,
  DEFAULT_TERMS_CONTENT,
} from "./legal-defaults";

const DEFAULT_SITE_CONTENT: Array<{ key: string; value: string }> = [
  {
    key: "landing_title",
    value: "OrdoStage — Planning for theaters, venues & touring productions",
  },
  {
    key: "landing_subtitle",
    value:
      "Plan productions, coordinate teams, and run tours in one platform built for live performance.",
  },
  {
    key: "landing_lead",
    value:
      "Stop juggling spreadsheets, email threads, and shared drives. OrdoStage connects scheduling, venue specs, tech riders, and crew coordination in one live workspace — from first rehearsal to closing night.",
  },
  {
    key: "landing_postscript",
    value: [
      "Workflow-first planning — not a generic project tool.",
      "One schedule across venues, tours, and departments.",
      "Riders, specs, and staffing — linked to the show they belong to.",
    ].join("\n"),
  },
  {
    key: "landing_closing",
    value: "For theaters · venues · touring companies · everyone running the show.",
  },
  {
    key: "landing_section_heading",
    value: "See it by role",
  },
  {
    key: "landing_section_body",
    value:
      "Same live data for your whole organisation — pick a role to explore what matters for that job.",
  },
  { key: "landing_cta_text", value: "Get started free" },
  { key: "landing_cta_url", value: "/signup" },
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

/** Merged into GET /api/site-content and GET /api/admin/site-content so UIs always see full defaults when keys are missing in DB. */
export function getDefaultSiteContentMap(): Record<string, string> {
  return Object.fromEntries(DEFAULT_SITE_CONTENT.map((item) => [item.key, item.value]));
}

export async function seedPacks() {
  for (const item of DEFAULT_SITE_CONTENT) {
    await prisma.siteContent.upsert({
      where: { key_locale: { key: item.key, locale: "en" } },
      update: {},
      create: { key: item.key, locale: "en", value: item.value },
    });
  }
}
