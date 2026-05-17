import { prisma } from "./prisma";
import {
  DEFAULT_PRIVACY_CONTENT,
  DEFAULT_REFUND_CONTENT,
  DEFAULT_TERMS_CONTENT,
} from "./legal-defaults";

const DEFAULT_SITE_CONTENT: Array<{ key: string; value: string }> = [
  { key: "landing_title", value: "OrdoStage" },
  {
    key: "landing_subtitle",
    value:
      "Production operations for theatres, concert halls, clubs, and touring shows — one workspace your whole company can trust on show day.",
  },
  {
    key: "landing_lead",
    value:
      "Whether you run a repertory season, book a busy music room, or move a tour through cities every week, the same problems show up: dates slip, specs drift apart, and crews work from outdated notes. OrdoStage ties events, venues, tours, staffing, and documents together so technical, production, and front-of-house teams share one live picture — from first hold on the calendar to load-out.",
  },
  {
    key: "landing_section_heading",
    value: "Everything your live organisation already juggles — in one place",
  },
  {
    key: "landing_section_body",
    value:
      "Plan shows and venue holds on a real calendar. Route tours with day-by-day detail. Keep venue specs, files, and tech riders next to the booking they belong to. Staff jobs from the same roster your people and departments already use. Track time when you need it, share calendars when partners ask, and lock access down with roles that match how theatres and venues actually work.",
  },
  {
    key: "landing_closing",
    value:
      "Built for resident companies and presenting houses. For music venues and festivals. For tour managers and road crews. For anyone who cannot afford a wrong answer on opening night.",
  },
  {
    key: "landing_postscript",
    value:
      "We are in private rollout now. Early access theaters will be onboarded first. Early-bird tester offer: theaters that join testing get unlimited use for 6 months. Contact: mail@ordostage.com",
  },
  { key: "landing_cta_text", value: "View pricing" },
  { key: "landing_cta_url", value: "/pricing" },
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
  { key: "public_early_bird_landing", value: "1" },
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
