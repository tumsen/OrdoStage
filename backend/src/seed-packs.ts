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
    value: "The operating platform for theaters, venues, and touring productions",
  },
  {
    key: "landing_lead",
    value:
      "Stop managing productions across spreadsheets, emails, and shared drives. OrdoStage brings your entire operation into one place — from first rehearsal to closing night.",
  },
  {
    key: "landing_section_heading",
    value: "Built for how live performance actually works:",
  },
  {
    key: "landing_section_body",
    value:
      "Planning that follows your workflow, not a generic project manager. Shared scheduling across venues, tours, and departments. Technical riders, venue specs, and team coordination — all connected, always current.",
  },
  {
    key: "landing_closing",
    value: "For theaters. For venues. For touring companies. For the people running the show.",
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
    value: "Postpaid pricing that scales with usage",
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
      "Billing is postpaid and based on real monthly usage.",
      "Every active user contributes billable usage days.",
      "Invoices are issued on the first day of each month for the previous month's usage.",
      "Payment is due within 7 days unless your contract says otherwise.",
      "If an invoice is overdue, the organization becomes view-only until payment is completed.",
      "No credit card is required to start. If you stop paying, accounts with an unpaid negative balance for 30 days may be permanently deleted, including organization data.",
    ].join("\n\n"),
  },
  {
    key: "pricing_notes",
    value: [
      "Pricing is usage-based and billed monthly in arrears.",
      "For custom commercial terms, contact us directly.",
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
