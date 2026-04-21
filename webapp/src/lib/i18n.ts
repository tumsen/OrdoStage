import { localeForLanguage, type Language } from "@/lib/preferences";
import { usePreferences } from "@/hooks/usePreferences";

type Primitive = string | number | boolean | null | undefined;

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K];
};

const en = {
  nav: {
    dashboard: "Dashboard",
    events: "Events",
    schedule: "Schedule",
    tours: "Tours",
    venues: "Venues",
    people: "People",
    team: "Team",
    calendars: "Calendars",
    billing: "Billing",
    roles: "Roles",
    account: "Account",
    ownerAdmin: "Owner Admin",
    signOut: "Sign out",
    workspace: "Workspace",
    switchOrganization: "Switch organization",
    current: "current",
    organizationFallback: "Organization",
  },
  credits: {
    noCreditsReadOnly: "No credits remaining. Your account is in read-only mode.",
    buyCredits: "Buy Credits ->",
    lowCredits:
      "Low credits: {{days}} {{daysLabel}} remaining. Top up to avoid read-only mode.",
    day: "day",
    days: "days",
    autoTopupReady:
      "Credits are low - a checkout is ready for your automatic top-up. Complete payment to add credits.",
    payNow: "Pay now ->",
  },
  account: {
    title: "Account",
    subtitle: "Personal settings, security and account deletion.",
    preferencesTitle: "Personal display preferences",
    preferencesHint:
      "Your choices override the organization defaults for your own account.",
    language: "Language",
    timeFormat: "Time format",
    distance: "Distance",
    deleteTitle: "Delete your login account",
    deleteHint:
      "This removes your OrdoStage login and sessions. If you are the only member of your organization, the organization and its data are deleted. If you are an owner with other members, transfer ownership first (Team page).",
    typeConfirm: "Type {{phrase}} to confirm",
    deleteCta: "Delete my account permanently",
    deleting: "Deleting...",
    deleteError: "Could not delete account.",
    phraseError: "Type {{phrase}} exactly (all caps).",
    savePrefError: "Could not save preference.",
  },
  billing: {
    orgDefaultsTitle: "Organization default language and formats",
    orgDefaultsHint:
      "This is the default for new members. Each user can still choose personal settings in their Account page.",
    defaultLanguage: "Default language",
    defaultTimeFormat: "Default time format",
    defaultDistance: "Default distance unit",
    updated: "Organization defaults updated.",
    updateError: "Could not update organization defaults.",
  },
  common: {
    english: "English",
    danish: "Danish",
    german: "German",
    clock24: "24-hour",
    clock12: "12-hour",
    kilometers: "Kilometers (km)",
    miles: "Miles (mi)",
    skipToContent: "Skip to main content",
  },
};

const da: DeepPartial<typeof en> = {
  nav: {
    dashboard: "Dashboard",
    events: "Begivenheder",
    schedule: "Plan",
    tours: "Turneer",
    venues: "Spillesteder",
    people: "Personer",
    team: "Team",
    calendars: "Kalendere",
    billing: "Fakturering",
    roles: "Roller",
    account: "Konto",
    ownerAdmin: "Ejer-admin",
    signOut: "Log ud",
    workspace: "Arbejdsrum",
    switchOrganization: "Skift organisation",
    current: "aktuel",
  },
  account: {
    title: "Konto",
    subtitle: "Personlige indstillinger, sikkerhed og kontosletning.",
    preferencesTitle: "Personlige visningsindstillinger",
    language: "Sprog",
    timeFormat: "Tidsformat",
    distance: "Afstand",
  },
  billing: {
    orgDefaultsTitle: "Organisationens standardsprog og formater",
    defaultLanguage: "Standardsprog",
    defaultTimeFormat: "Standard tidsformat",
    defaultDistance: "Standard afstandsenhed",
  },
  common: {
    english: "Engelsk",
    danish: "Dansk",
    german: "Tysk",
    clock24: "24-timers",
    clock12: "12-timers",
    kilometers: "Kilometer (km)",
    miles: "Miles (mi)",
    skipToContent: "Spring til indhold",
  },
};

const de: DeepPartial<typeof en> = {
  nav: {
    events: "Ereignisse",
    schedule: "Zeitplan",
    tours: "Tourneen",
    venues: "Spielorte",
    people: "Personen",
    team: "Team",
    calendars: "Kalender",
    billing: "Abrechnung",
    roles: "Rollen",
    account: "Konto",
    ownerAdmin: "Owner-Admin",
    signOut: "Abmelden",
    workspace: "Arbeitsbereich",
    switchOrganization: "Organisation wechseln",
    current: "aktuell",
  },
  account: {
    title: "Konto",
    subtitle: "Persoenliche Einstellungen, Sicherheit und Kontoloeschung.",
    preferencesTitle: "Persoenliche Anzeigeeinstellungen",
    language: "Sprache",
    timeFormat: "Zeitformat",
    distance: "Entfernung",
  },
  billing: {
    orgDefaultsTitle: "Standard-Sprache und Formate der Organisation",
    defaultLanguage: "Standardsprache",
    defaultTimeFormat: "Standard-Zeitformat",
    defaultDistance: "Standard-Entfernungseinheit",
  },
  common: {
    english: "Englisch",
    danish: "Daenisch",
    german: "Deutsch",
    clock24: "24-Stunden",
    clock12: "12-Stunden",
    kilometers: "Kilometer (km)",
    miles: "Meilen (mi)",
    skipToContent: "Zum Inhalt springen",
  },
};

function deepMerge<T extends Record<string, unknown>>(base: T, override: DeepPartial<T>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const baseValue = out[key];
    if (
      baseValue &&
      value &&
      typeof baseValue === "object" &&
      typeof value === "object" &&
      !Array.isArray(baseValue) &&
      !Array.isArray(value)
    ) {
      out[key] = deepMerge(
        baseValue as Record<string, unknown>,
        value as DeepPartial<Record<string, unknown>>
      );
      continue;
    }
    out[key] = value;
  }
  return out as T;
}

export const SUPPORTED_LANGUAGES: ReadonlyArray<Language> = ["en", "da", "de"];

const catalogs: Record<Language, typeof en> = {
  en,
  da: deepMerge(en, da),
  de: deepMerge(en, de),
};

export type TranslationKey = string;

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[part];
  }, obj);
}

function interpolate(template: string, vars?: Record<string, Primitive>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ""));
}

export function translate(
  language: Language,
  key: TranslationKey,
  vars?: Record<string, Primitive>
): string {
  const value =
    getByPath(catalogs[language] as unknown as Record<string, unknown>, key) ??
    getByPath(catalogs.en as unknown as Record<string, unknown>, key);
  if (typeof value !== "string") return key;
  return interpolate(value, vars);
}

export function useI18n() {
  const language = usePreferences().effective?.language ?? "en";
  const locale = localeForLanguage(language);

  const t = (key: TranslationKey, vars?: Record<string, Primitive>) =>
    translate(language, key, vars);

  return { language, locale, t };
}

