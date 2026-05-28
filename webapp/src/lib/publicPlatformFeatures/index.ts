import type { Language } from "@/lib/preferences";
import { rawPlatformFeatureAreasDa } from "./da";
import { rawPlatformFeatureAreasDe } from "./de";
import { rawPlatformFeatureAreasEn } from "./en";
import type { PlatformFeatureArea } from "./types";

export type { PlatformFeatureArea } from "./types";

const BY_LANG: Record<Language, readonly PlatformFeatureArea[]> = {
  en: rawPlatformFeatureAreasEn,
  da: rawPlatformFeatureAreasDa,
  de: rawPlatformFeatureAreasDe,
};

export function getPlatformFeatureAreas(language: Language): readonly PlatformFeatureArea[] {
  return BY_LANG[language];
}

/** @deprecated Use getPlatformFeatureAreas(language) */
export const PLATFORM_FEATURE_AREAS = rawPlatformFeatureAreasEn;

/** @deprecated Use getPlatformFeatureAreas(language) */
export const PLATFORM_FEATURE_HIGHLIGHTS = PLATFORM_FEATURE_AREAS;
