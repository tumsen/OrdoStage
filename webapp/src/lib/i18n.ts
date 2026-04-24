import { localeForLanguage, type Language } from "@/lib/preferences";
import { useAdminPanelLanguage } from "@/contexts/AdminPanelLanguageContext";
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
    roles: "Permission groups",
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
  admin: {
    uiLanguage: "Admin panel language",
    badge: "Admin",
    panel: "Panel",
    backToApp: "Back to app",
    nav: {
      dashboard: "Dashboard",
      organizations: "Organizations",
      users: "Users",
      pricing: "Pricing",
      websiteContent: "Website content",
    },
    pageTitle: {
      dashboard: "Dashboard",
      organizations: "Organizations",
      orgDetail: "Organization detail",
      users: "Users",
      pricing: "Pricing",
      websiteContent: "Website content",
      unknown: "Admin",
    },
    siteContent: {
      sectionTranslations: "Translations",
      editLocaleHint:
        "Edit public website copy for each language. Empty values fall back to English. New languages: add them in code (preferences + backend), then translate here.",
      contentLanguage: "Content language",
      title: "Website content",
      subtitle: "Edit landing page and legal texts used on public pages.",
      saving: "Saving...",
      save: "Save website content",
      saved: "Saved",
      saveError: "Failed to save website content.",
      creditsEnOnly:
        "Free signup credits are stored in English and apply to all organizations. Set “Content language” to English to edit this value.",
      publicHomeMode: "Public home (global)",
      publicHomeModeHint:
        "Applies in every language. The public shell always has a left menu (Features, Pricing, Terms, Privacy). Turn off both modes for the shorter “live” home; turn on maintenance for a minimal notice, or early-bird for the long welcome page.",
      maintenanceMode: "Maintenance welcome screen",
      maintenanceModeHint: "Replaces the home page with a short “back soon” message. No marketing sidebar.",
      earlyBirdMode: "Early-bird / private rollout home",
      earlyBirdModeHint: "Long single-page welcome (current rollout design). Off: compact live home with nav to Pricing and Log in.",
      flagSaveError: "Could not update that setting.",
    },
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
    roles: "Retningsgrupper",
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
  admin: {
    uiLanguage: "Sprog i admin-panelet",
    panel: "Panel",
    backToApp: "Tilbage til appen",
    nav: {
      dashboard: "Oversigt",
      organizations: "Organisationer",
      users: "Brugere",
      pricing: "Priser",
      websiteContent: "Websideindhold",
    },
    pageTitle: {
      dashboard: "Oversigt",
      organizations: "Organisationer",
      orgDetail: "Organisation",
      users: "Brugere",
      pricing: "Priser",
      websiteContent: "Websideindhold",
      unknown: "Admin",
    },
    siteContent: {
      sectionTranslations: "Oversættelser",
      editLocaleHint:
        "Redigér offentlig websidetekst for hvert sprog. Tomme felter falder tilbage til engelsk.",
      contentLanguage: "Indholdssprog",
      creditsEnOnly:
        "Gratis tilmeldingskreditter gemmes på engelsk for hele produktet. Vælg engelsk under “Indholdssprog” for at redigere værdien.",
      publicHomeMode: "Offentlig forside (globalt)",
      publicHomeModeHint:
        "Gælder alle sprog. For Paddle: slå begge fra, så besøgende får fuld navigation inkl. Priser.",
    },
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
    roles: "Berechtigungsgruppen",
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
  admin: {
    uiLanguage: "Admin-Sprache",
    panel: "Panel",
    backToApp: "Zurueck zur App",
    nav: {
      dashboard: "Uebersicht",
      organizations: "Organisationen",
      users: "Benutzer",
      pricing: "Preise",
      websiteContent: "Webseiten-Inhalt",
    },
    pageTitle: {
      dashboard: "Uebersicht",
      organizations: "Organisationen",
      orgDetail: "Organisation",
      users: "Benutzer",
      pricing: "Preise",
      websiteContent: "Webseiten-Inhalt",
      unknown: "Admin",
    },
    siteContent: {
      sectionTranslations: "Uebersetzungen",
      editLocaleHint:
        "Oeffentliche Webseitentexte pro Sprache bearbeiten. Leere Felder nutzen Englisch als Fallback.",
      contentLanguage: "Inhaltssprache",
      creditsEnOnly:
        "Kostenlose Anmelde-Credits werden einmalig auf Englisch gespeichert. Stellen Sie “Inhaltssprache” auf Englisch, um den Wert zu bearbeiten.",
      publicHomeMode: "Oeffentliche Startseite (global)",
      publicHomeModeHint:
        "Fuer alle Sprachen. Fuer Paddle beide ausschalten, damit Navigation und Preise sichtbar sind.",
    },
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

/** UI strings for the Owner Admin shell (uses panel language, not org/user preference). */
export function useAdminI18n() {
  const { language, setLanguage } = useAdminPanelLanguage();
  const locale = localeForLanguage(language);
  const t = (key: TranslationKey, vars?: Record<string, Primitive>) => translate(language, key, vars);
  return { language, setLanguage, locale, t };
}

export { SUPPORTED_LANGUAGES } from "@/lib/preferences";

