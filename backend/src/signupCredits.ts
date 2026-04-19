import { prisma } from "./prisma";

const KEY = "signup_credits";
const FALLBACK = 30;

/**
 * Credits granted when a new organisation is created (non–unlimited orgs).
 * Configured in Owner Admin → Website Content → "Free signup credits".
 */
export async function getSignupCreditsForNewOrg(): Promise<number> {
  const row = await prisma.siteContent.findUnique({ where: { key: KEY } });
  const raw = row?.value?.trim();
  if (raw == null || raw === "") return FALLBACK;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return FALLBACK;
  return n;
}
