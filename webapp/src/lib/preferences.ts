export type Language = "en" | "da" | "de";
export type TimeFormat = "12h" | "24h";
export type DistanceUnit = "km" | "mi";

/** Languages available in the app and Owner Admin translations. Add new codes here and in backend `LanguageSchema`. */
export const SUPPORTED_LANGUAGES: ReadonlyArray<Language> = ["en", "da", "de"];

export interface PreferenceSet {
  language: Language;
  timeFormat: TimeFormat;
  distanceUnit: DistanceUnit;
}

export interface PreferencesPayload {
  organizationDefaults: PreferenceSet;
  userPreferences: PreferenceSet;
  effective: PreferenceSet;
}

const LOCALE_MAP: Record<Language, string> = {
  en: "en-US",
  da: "da-DK",
  de: "de-DE",
};

export function languageLabel(language: Language): string {
  if (language === "en") return "English";
  if (language === "da") return "Danish";
  return "German";
}

export function localeForLanguage(language: Language): string {
  return LOCALE_MAP[language];
}

/** Browsers report BCP-47; map to site language codes. */
export function getBrowserLanguage(): Language {
  if (typeof navigator === "undefined") return "en";
  const nav = (navigator.language || "en").toLowerCase();
  if (nav.startsWith("da")) return "da";
  if (nav.startsWith("de")) return "de";
  return "en";
}

export function formatDistanceKm(distanceKm: number, unit: DistanceUnit): string {
  if (unit === "mi") {
    const miles = distanceKm * 0.621371;
    return `${miles.toFixed(1)} mi`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

export function unitLabel(unit: DistanceUnit): string {
  return unit === "mi" ? "Miles (mi)" : "Kilometers (km)";
}

export function timeFormatLabel(timeFormat: TimeFormat): string {
  return timeFormat === "12h" ? "12-hour clock" : "24-hour clock";
}

