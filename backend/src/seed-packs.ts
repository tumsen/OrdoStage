import { prisma } from "./prisma";
import {
  DEFAULT_PRIVACY_CONTENT,
  DEFAULT_REFUND_CONTENT,
  DEFAULT_TERMS_CONTENT,
} from "./legal-defaults";

const DEFAULT_PACKS = [
  { packId: "pack_100", days: 100, amountCents: 900, label: "100 days" },
  { packId: "pack_500", days: 500, amountCents: 3900, label: "500 days" },
  { packId: "pack_1000", days: 1000, amountCents: 6900, label: "1000 days" },
  { packId: "pack_5000", days: 5000, amountCents: 29900, label: "5000 days" },
];

const DEFAULT_SITE_CONTENT: Array<{ key: string; value: string }> = [
  {
    key: "landing_title",
    value:
      "Ordo Stage is a planning platform built for theatres, venues, and touring productions.",
  },
  {
    key: "landing_subtitle",
    value:
      "It brings everything together in one place — from the first booking to the final curtain call.",
  },
  { key: "landing_cta_text", value: "Get started" },
  { key: "landing_cta_url", value: "/login" },
  { key: "terms_content", value: DEFAULT_TERMS_CONTENT },
  { key: "privacy_content", value: DEFAULT_PRIVACY_CONTENT },
  { key: "refund_content", value: DEFAULT_REFUND_CONTENT },
  /** Default credits charged to deactivate a person (orgs inherit via DB default; owners can override). */
  { key: "person_deactivate_credit_default", value: "20" },
  /** Credits for new organisations (also shown on marketing pages). */
  { key: "signup_credits", value: "30" },
  { key: "company_brand", value: "Ordo Stage" },
  { key: "company_entity", value: "Schwifty" },
  { key: "company_address", value: "Strandgade 1, 5700 Svendborg, Denmark" },
  { key: "company_vat", value: "DK28625383" },
  { key: "company_email", value: "mail@ordostage.com" },
  {
    key: "pricing_page_title",
    value: "Simple pricing that grows with your team",
  },
  {
    key: "pricing_intro",
    value: [
      "No subscriptions, no surprises. Just credits — buy a pack and use them as you need.",
      "When you create an account, you get {{signup_credits}} credits free to test the system.",
      "You can also enable automatic top-up under Billing in your organisation: choose a credit pack and a balance threshold. When credits fall to that level, we open a checkout so you can refill before work stops — a simple way to keep credits on the account without watching the balance every day.",
      "Every active user costs 1 credit per day. Add as many people as your project needs, and only pay for who's actually active.",
      "Need to pause someone? Deactivating a user costs {{deactivate_credits}} credits. Their info stays safe, and bringing them back is completely free.",
      "Want to remove someone entirely? Deleting a user is free — though keep in mind it permanently removes them and all their data.",
    ].join("\n\n"),
  },
  {
    key: "pricing_notes",
    value: [
      "You'll need at least one active user to keep your account editable.",
      "If your balance dips to −30 credits, your account switches to view-only mode. Top it up within 30 days and everything goes back to normal — wait longer and the account may be permanently deleted.",
    ].join("\n"),
  },
];

/** Merged into GET /api/site-content and GET /api/admin/site-content so UIs always see full defaults when keys are missing in DB. */
export function getDefaultSiteContentMap(): Record<string, string> {
  return Object.fromEntries(DEFAULT_SITE_CONTENT.map((item) => [item.key, item.value]));
}

export async function seedPacks() {
  for (const pack of DEFAULT_PACKS) {
    await prisma.pricePack.upsert({
      where: { packId: pack.packId },
      update: {},
      create: pack,
    });
  }

  for (const item of DEFAULT_SITE_CONTENT) {
    await prisma.siteContent.upsert({
      where: { key: item.key },
      update: {},
      create: item,
    });
  }
}
