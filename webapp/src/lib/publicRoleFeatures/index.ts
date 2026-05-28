import type { Language } from "@/lib/preferences";
import {
  getTimeTrackingSection,
  isPlansBillingSection,
  isTimeTrackingSection,
  PLANS_BILLING_HEADING,
} from "@/lib/roleTimeTrackingSections";
import { rawPublicRoleFeaturesDa } from "./da";
import { rawPublicRoleFeaturesDe } from "./de";
import { rawPublicRoleFeaturesEn } from "./en";
import type { PublicRoleFeature } from "./types";

export type { PublicRoleFeature, PublicRoleFeatureSection } from "./types";

function withTimeTrackingSection(role: PublicRoleFeature, language: Language): PublicRoleFeature {
  const withoutTime = role.sections.filter((s) => !isTimeTrackingSection(s.heading));
  const billingIdx = withoutTime.findIndex((s) => isPlansBillingSection(s.heading));
  const timeSection = getTimeTrackingSection(role.slug, language);
  if (billingIdx >= 0) {
    return {
      ...role,
      sections: [...withoutTime.slice(0, billingIdx), timeSection, ...withoutTime.slice(billingIdx)],
    };
  }
  return { ...role, sections: [...withoutTime, timeSection] };
}

const RAW_BY_LANG: Record<Language, PublicRoleFeature[]> = {
  en: rawPublicRoleFeaturesEn,
  da: rawPublicRoleFeaturesDa,
  de: rawPublicRoleFeaturesDe,
};

const CACHE: Partial<Record<Language, readonly PublicRoleFeature[]>> = {};

export function getPublicRoleFeatures(language: Language): readonly PublicRoleFeature[] {
  if (!CACHE[language]) {
    CACHE[language] = RAW_BY_LANG[language].map((r) => withTimeTrackingSection(r, language));
  }
  return CACHE[language]!;
}

const SLUG_SET = new Set(rawPublicRoleFeaturesEn.map((r) => r.slug));

export function isPublicRoleSlug(slug: string | undefined): slug is string {
  return slug != null && SLUG_SET.has(slug);
}

export function getRoleBySlug(slug: string, language: Language = "en"): PublicRoleFeature | undefined {
  return getPublicRoleFeatures(language).find((r) => r.slug === slug);
}

/** @deprecated Use getPublicRoleFeatures(language) */
export const PUBLIC_ROLE_FEATURES = getPublicRoleFeatures("en");

export { PLANS_BILLING_HEADING };
