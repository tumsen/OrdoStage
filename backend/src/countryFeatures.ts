import { z } from "zod";
import { OrganizationCountryFeaturesSchema } from "./types";

export type OrganizationCountryFeatures = z.infer<typeof OrganizationCountryFeaturesSchema>;

/** Known per-country modules (extend as more countries/features ship). */
export const COUNTRY_FEATURE_CATALOG = {
  DK: {
    label: "Denmark",
    features: {
      travelAllowance: {
        label: "SKAT travel allowance (diæter)",
        description:
          "Tax-free travel allowance with day-by-day meal reductions per SKAT rules.",
      },
    },
  },
} as const;

export type CountryFeatureKey = keyof (typeof COUNTRY_FEATURE_CATALOG)["DK"]["features"];

export function normalizeCountryFeatures(raw: unknown): OrganizationCountryFeatures {
  const parsed = OrganizationCountryFeaturesSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

export function isCountryFeatureEnabled(
  features: unknown,
  country: string,
  feature: CountryFeatureKey
): boolean {
  const normalized = normalizeCountryFeatures(features);
  const countryKey = country.trim().toUpperCase();
  return normalized[countryKey]?.[feature] === true;
}

export function patchCountryFeatures(
  current: unknown,
  country: string,
  patch: Partial<NonNullable<OrganizationCountryFeatures[string]>>
): OrganizationCountryFeatures {
  const normalized = normalizeCountryFeatures(current);
  const countryKey = country.trim().toUpperCase();
  return {
    ...normalized,
    [countryKey]: { ...normalized[countryKey], ...patch },
  };
}
