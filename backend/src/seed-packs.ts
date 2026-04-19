import { prisma } from "./prisma";

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
  {
    key: "terms_content",
    value:
      "## Terms of Service\\n\\nBy using OrdoStage, you agree to use the platform lawfully and responsibly. You are responsible for account access, content accuracy, and compliance with your local laws. OrdoStage may update or suspend services for maintenance, security, or legal obligations.",
  },
  {
    key: "privacy_content",
    value:
      "## Privacy Policy\\n\\nOrdoStage stores organization, scheduling, and account data to provide the service. We use this data only for product operation, support, billing, and security. We do not sell personal data. Contact support for export or deletion requests.",
  },
  {
    key: "refund_content",
    value:
      "## Refund Policy\\n\\nCredit-pack purchases are generally non-refundable once credits are delivered. If a purchase was made in error or technical issues prevented delivery, contact support and we will review your case promptly.",
  },
  /** Default credits charged to deactivate a person (orgs inherit via DB default; owners can override). */
  { key: "person_deactivate_credit_default", value: "20" },
  /** Credits for new organisations (also shown on marketing pages). */
  { key: "signup_credits", value: "30" },
];

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
