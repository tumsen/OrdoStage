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
    team: "Teams",
    calendars: "Calendars",
    billing: "Billing",
    roles: "Permission groups",
    account: "Account",
    time: "Time",
    ownerAdmin: "Owner Admin",
    signOut: "Sign out",
    workspace: "Workspace",
    switchOrganization: "Switch organization",
    current: "current",
    organizationFallback: "Organization",
  },
  billingAlerts: {
    overdueReadOnly: "Billing overdue. Your account is in read-only mode.",
    openBilling: "Open billing ->",
    dueSoon:
      "Invoice due soon: {{days}} {{daysLabel}} remaining to avoid read-only mode.",
    day: "day",
    days: "days",
  },
  time: {
    title: "Time tracking",
    subtitle:
      "Log hours against show jobs and custom work. Drag on the grid to add a block; drag blocks to move; drag the top or bottom edge to adjust.",
    week: "Week",
    month: "Month",
    noAccess: "You do not have access to time tracking in this organization.",
    needPersonLink: "Link your user account to a person in the directory (same email) to use time tracking.",
    planned: "Planned",
    job: "Job",
    customBlock: "Time",
    addBlock: "Add custom time",
    logJob: "Log",
    dragHint:
      "Drag on empty space to create a block (snaps to 5 minutes). Drag a block to move; drag the top or bottom edge to adjust. Pencil: project, times, tags, note.",
    gridStartsAt: "Day starts",
    upcomingTitle: "Upcoming assigned jobs",
    upcomingHint: "Show jobs from today onward. Add one to your grid as a movable time block.",
    addToTime: "Add to Time",
    showWeek: "Go to week",
    inThisWeek: "this week",
    saveError: "Could not save time entry.",
    entryCreated: "Time entry saved.",
    entryUpdated: "Entry updated.",
    entryDeleted: "Deleted.",
    deleteError: "Could not delete entry.",
    editEntry: "Edit entry",
    projectLabel: "Project",
    noProject: "None",
    tagsLabel: "Tags",
    tagsEmpty: "No tags yet. Add some in the catalog section below (week view).",
    noteLabel: "Note",
    notePlaceholder: "Optional details…",
    startTimeLabel: "Start",
    endTimeLabel: "End",
    fiveMinuteGridHint: "Times use a 5-minute grid (e.g. 09:00, 09:05, 09:10).",
    searchProjects: "Search projects…",
    noProjectMatches: "No matching projects.",
    saveEntry: "Save",
    saving: "Saving…",
    deleteEntry: "Delete entry",
    deleteEntryConfirm: "Click again to confirm delete",
    cancelDelete: "Cancel",
    personFilter: "Person",
    me: "Me",
    catalogTitle: "Time tracking catalog",
    catalogHint:
      "Add tags and your own project names. Every event and each show is also available as a time project (created automatically; see the note below).",
    eventsProjectsAutoHint:
      "Each event is a project named like the event. Each performance is a project named “Event name · date” (and show time when set). The list refreshes when projects load — you do not need to create or link them manually.",
    tagsHeading: "Tags",
    projectsHeading: "Projects",
    tagPlaceholder: "e.g. Meeting",
    projectPlaceholder: "e.g. Front of house",
    add: "Add",
    remove: "Remove",
    catalogTagAdded: "Tag added.",
    catalogProjectAdded: "Project added.",
    catalogRemoved: "Removed.",
    catalogSaveError: "Could not save catalog.",
    catalogDeleteConfirm: "Remove this item?",
    catalogColorLabel: "Colour",
    catalogColorReset: "Use automatic colour",
    linkFromEventsHeading: "Link events & shows",
    linkFromEventsHint:
      "Add a time project tied to an event or a single performance. Those projects appear in the project picker on each time entry.",
    selectEventPlaceholder: "Choose event…",
    selectShowPlaceholder: "Scope…",
    wholeEventProject: "Entire event",
    addLinkedProject: "Add as project",
    projectLinkedEvent: "Linked to event",
    projectLinkedShow: "Linked to performance",
    showCancelled: "cancelled",
    categoryLabel: "Category",
    categoryWork: "Work",
    categoryVacation: "Vacation",
    categorySick: "Sick leave",
    categoryHoliday: "Holiday",
    reportsLink: "Reports",
    reportsTitle: "Time reports",
    reportsSubtitle: "Analyse hours, projects, overtime, and leave across your team.",
    reportsNoAccess: "You need the 'View everyone's time' permission to access reports.",
    exportCsv: "Export CSV",
    reportTotalHours: "Total hours",
    reportPersonCount: "People",
    reportChartTitle: "Hours by day",
    reportTabPersons: "By person",
    reportTabProjects: "By project",
    reportTabEntries: "Entries",
    reportColPerson: "Person",
    reportColProject: "Project",
    reportColTotal: "Total",
    reportColContract: "Contract h/wk",
    reportColOvertime: "Overtime",
    reportColShare: "Share",
    reportNoData: "No entries found for the selected filters.",
    reportContractHint:
      "Click the contract hours cell to set expected weekly hours per person. Overtime = logged work hours − contracted hours over the period.",
    reportColVacUsed: "Vac. used",
    reportColVacLeft: "Vac. left",
    addVacationDay: "Add vacation day",
    addSickDay: "Add sick day",
  },
  account: {
    title: "Account",
    subtitle: "Personal settings, security, and organisation deletion (owners only).",
    preferencesTitle: "Personal display preferences",
    preferencesHint:
      "Your choices override the organization defaults for your own account.",
    language: "Language",
    timeFormat: "Time format",
    distance: "Distance",
    deleteTitle: "Delete organisation, all users, and all data",
    deleteHint:
      "Cannot be undone. This permanently deletes this organisation and all of its data (people, events, billing records, documents in this workspace). Members who belong only to this organisation lose their login account. Each organisation owner must enter their own Ordo Stage login password below; if there are several owners, every owner’s password is required.",
    typeConfirm: "Type exactly: {{phrase}}",
    ownerPasswordLabel: "Login password for {{email}}",
    ownerPasswordsHeading: "Every organisation owner must confirm",
    deleteLoadingRequirements: "Loading…",
    deleteNoOwners: "This organisation has no owner on file; contact support.",
    orgDeletePhraseError: "Type the confirmation phrase exactly as shown.",
    orgDeletePasswordMissing: "Enter every owner’s password.",
    deleteCta: "Delete organisation permanently",
    deleting: "Deleting…",
    deleteError: "Could not delete organisation.",
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
      users: "Platform admins",
      pricing: "Pricing",
      websiteContent: "Website content",
    },
    pageTitle: {
      dashboard: "Dashboard",
      organizations: "Organizations",
      orgDetail: "Organization detail",
      users: "Platform admins",
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
    time: "Tid",
    dashboard: "Dashboard",
    events: "Begivenheder",
    schedule: "Plan",
    tours: "Turneer",
    venues: "Spillesteder",
    people: "Personer",
    team: "Teams",
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
  time: {
    title: "Tidsregistrering",
    subtitle: "Registrer timer mod jobs og eget arbejde. Træk blokke så de matcher start og slut.",
    week: "Uge",
    month: "Måned",
    needPersonLink: "Din konto skal være koblet til en person i kataloget (samme e-mail).",
    addBlock: "Tilføj tidsblok",
    logJob: "Log",
    planned: "Planlagt",
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
      users: "Platform-admins",
      pricing: "Priser",
      websiteContent: "Websideindhold",
    },
    pageTitle: {
      dashboard: "Oversigt",
      organizations: "Organisationer",
      orgDetail: "Organisation",
      users: "Platform-admins",
      pricing: "Priser",
      websiteContent: "Websideindhold",
      unknown: "Admin",
    },
    siteContent: {
      sectionTranslations: "Oversættelser",
      editLocaleHint:
        "Redigér offentlig websidetekst for hvert sprog. Tomme felter falder tilbage til engelsk.",
      contentLanguage: "Indholdssprog",
      publicHomeMode: "Offentlig forside (globalt)",
      publicHomeModeHint:
        "Gælder alle sprog. For Paddle: slå begge fra, så besøgende får fuld navigation inkl. Priser.",
    },
  },
};

const de: DeepPartial<typeof en> = {
  nav: {
    time: "Zeit",
    events: "Ereignisse",
    schedule: "Zeitplan",
    tours: "Tourneen",
    venues: "Spielorte",
    people: "Personen",
    team: "Teams",
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
      users: "Plattform-Admins",
      pricing: "Preise",
      websiteContent: "Webseiten-Inhalt",
    },
    pageTitle: {
      dashboard: "Uebersicht",
      organizations: "Organisationen",
      orgDetail: "Organisation",
      users: "Plattform-Admins",
      pricing: "Preise",
      websiteContent: "Webseiten-Inhalt",
      unknown: "Admin",
    },
    siteContent: {
      sectionTranslations: "Uebersetzungen",
      editLocaleHint:
        "Oeffentliche Webseitentexte pro Sprache bearbeiten. Leere Felder nutzen Englisch als Fallback.",
      contentLanguage: "Inhaltssprache",
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

