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
    shows: "Shows",
    production: "Production planner",
    staffing: "Staffing",
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
      "Drag on empty space to create a block (snaps to 5 minutes). Drag a block to move; drag the top or bottom edge to adjust. Pencil: project, times, category (e.g. Rejsegodtgørsel), tags, note.",
    calendarWeekIso: "Week {{week}}",
    weekColumnDayHours: "Day",
    weekColumnRunningHours: "Running",
    gridStartsAt: "Day starts",
    upcomingTitle: "Upcoming assigned jobs",
    weekToolsExpand: "Upcoming jobs & catalog",
    upcomingHint: "Show jobs from today onward. Add one to your grid as a movable time block.",
    addToTime: "Add to Time",
    showWeek: "Go to week",
    inThisWeek: "this week",
    saveError: "Could not save time entry.",
    entryCreated: "Time entry saved.",
    entryUpdated: "Entry updated.",
    entryDeleted: "Deleted.",
    deleteError: "Could not delete entry.",
    entryLocked: "Entry locked.",
    entryUnlocked: "Entry unlocked.",
    editEntry: "Edit entry",
    lockEntry: "Lock entry",
    unlockEntry: "Unlock entry",
    lockedShort: "Locked",
    lockedEntryHint: "This entry is locked. Unlock it before editing or deleting.",
    unlockedEntryHint: "Lock this entry to prevent edits and deletes.",
    projectLabel: "Project",
    noProject: "None",
    tagsLabel: "Tags",
    tagsEmpty: "No tags yet. Add some in the catalog section below (week view).",
    noteLabel: "Note",
    notePlaceholder: "Optional details…",
    startTimeLabel: "Start",
    endTimeLabel: "End",
    editTimePreciseHint:
      "Use any minute (HH:MM), e.g. 07:24 for 7h 24m. Dragging on the week grid still snaps to 5 minutes.",
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
    parentCategoryPageTitle: "Time parent categories",
    parentCategoryPageHint:
      "Group time projects under parent categories. Link events and tours so their automatic time projects roll up here, and add standalone projects that are not tied to a show.",
    parentCategoriesHeading: "Parent categories",
    parentCategoryPlaceholder: "e.g. Administration",
    parentCategoryAdded: "Parent category added.",
    parentCategoryEmpty: "No parent categories yet.",
    parentCategorySelectPrompt: "Create or select a parent category to manage its projects and links.",
    parentCategoryLoading: "Loading catalog…",
    parentCategoryDeleteConfirm: "Delete this parent category? Linked events, tours, and projects will be unlinked.",
    parentCategoryProjectsHeading: "Standalone projects",
    parentCategoryProjectsHint: "Projects for work that is not an event or tour — office, prep, marketing, etc.",
    parentCategoryStandaloneProject: "Standalone project",
    parentCategoryNoProjects: "No standalone projects in this category.",
    parentCategoryEventsHeading: "Events",
    parentCategoryEventsHint: "Each linked event’s automatic time project belongs to this category.",
    parentCategoryLinkEvent: "Link event",
    parentCategoryNoEvents: "No events linked yet.",
    parentCategoryToursHeading: "Tours",
    parentCategoryToursHint: "Each linked tour’s automatic time project belongs to this category.",
    parentCategorySelectTour: "Choose tour…",
    parentCategoryLinkTour: "Link tour",
    parentCategoryLinkedTour: "Linked tour",
    parentCategoryNoTours: "No tours linked yet.",
    parentCategoryCatalogLink: "Parent categories",
    backToTime: "Back to time",
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
    categoryExtraVacation: "Extra vacation day",
    categoryCompTime: "Comp time",
    categorySick: "Sick leave",
    categoryHoliday: "Holiday",
    categoryTravelAllowance: "Travel allowance (rejsegodtgørsel)",
    reportsLink: "Reports",
    payrollLink: "Payroll data",
    payrollTitle: "Payroll data",
    payrollSubtitle: "Vacation balances, overtime, and absence for payroll export.",
    payrollVacationYear: "Vacation year",
    payrollApprovedOnly: "Approved timesheets only",
    payrollColNorm: "Weekly norm",
    payrollColWork: "Work hours",
    payrollColOvertime: "Overtime",
    payrollColVacEarned: "Vac. earned",
    payrollColVacUsed: "Vac. used",
    payrollColVacLeft: "Vac. left",
    payrollColExtraUsed: "Extra vac. used",
    payrollColExtraLeft: "Extra vac. left",
    payrollColCompEarned: "Comp earned",
    payrollColCompUsed: "Comp used",
    payrollColCompLeft: "Comp left",
    payrollColSick: "Sick days",
    payrollColApproved: "Approved",
    payrollNoData: "No people found for the selected period.",
    leaveBalancesTitle: "Leave balances",
    leaveVacationEarned: "Vacation earned",
    leaveVacationUsed: "Vacation used",
    leaveVacationRemaining: "Vacation remaining",
    leaveExtraRemaining: "Extra vacation left",
    leaveCompRemaining: "Comp time left",
    leaveSickDays: "Sick days (year)",
    addVacationDay: "Add vacation day",
    addExtraVacationDay: "Add extra vacation day",
    addCompTimeDay: "Add comp time",
    addSickDay: "Add sick day",
    leavePolicyTitle: "Leave policy",
    leavePolicyHint: "Organization defaults for vacation year, norms, and comp time from overtime.",
    leavePolicyVacationYearStart: "Vacation year starts",
    leavePolicyDefaultVacation: "Default vacation days / year",
    leavePolicyDefaultExtraVacation: "Default extra vacation days",
    leavePolicyDefaultWeeklyHours: "Default weekly hours",
    leavePolicyCompFromOvertime: "Accrue comp time from overtime",
    leaveProfileTitle: "Leave & norms",
    leaveProfileHint: "Work norms and vacation rights for this person.",
    leaveProfileUseOrgDefaults: "Use organization defaults",
    leaveProfileExtraVacation: "Extra vacation days / year",
    leaveProfileMonthlyHours: "Monthly hours",
    leaveProfileAnnualHours: "Annual hours",
    leaveProfileSickStatus: "Sick leave status",
    leaveProfileSickNone: "None",
    leaveProfileSickActive: "Active",
    leaveProfileSickNote: "Sick leave note",
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
        "Applies in every language. The public shell always has a left menu (Features, Pricing, Terms, Privacy). Maintenance mode replaces the home page with a short notice; otherwise visitors see the marketing home with role-based features and sign-up.",
      maintenanceMode: "Maintenance welcome screen",
      maintenanceModeHint: "Replaces the home page with a short “back soon” message. The Features section stays available in the main area.",
      flagSaveError: "Could not update that setting.",
    },
  },
  venueInfo: {
    stageCapacityTitle: "Stage & capacity",
    capacityMetricLabel: "Capacity",
    widthLabel: "Width",
    depthLabel: "Depth",
    heightLabel: "Height",
    capacityPerson: "{{count}} person",
    capacityPersons: "{{count}} persons",
    tableColumnTitle: "Size & capacity (m · persons)",
    tableColumnFiles: "Files",
    tableColumnNotes: "Notes",
    widthShort: "W",
    depthShort: "D",
    heightShort: "H",
    audienceCapacityLabel: "Audience capacity (persons)",
    widthMetersLabel: "Width (m)",
    depthMetersLabel: "Depth (m)",
    heightMetersLabel: "Height (m)",
    capacityShortLabel: "Capacity",
    capacityInputSuffix: "persons",
  },
};

const da: DeepPartial<typeof en> = {
  nav: {
    time: "Tid",
    dashboard: "Dashboard",
    events: "Begivenheder",
    schedule: "Plan",
    shows: "Shows",
    production: "Produktionsplan",
    staffing: "Bemanding",
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
    categoryTravelAllowance: "Rejsegodtgørsel",
    dragHint:
      "Træk på tom plads for at oprette en blok (snapper til 5 min). Træk blokke for at flytte; træk top eller bund for at ændre længde. Blyant: projekt, tidspunkter, kategori (fx rejsegodtgørsel), tags, note.",
    editTimePreciseHint:
      "Brug præcis tid (TT:MM), fx 07:24 for 7 t. 24 min. Træk på ugen snupper stadig til 5 minutter.",
    weekToolsExpand: "Kommende jobs & katalog",
    weekColumnDayHours: "Dag",
    weekColumnRunningHours: "Sum",
    categoryExtraVacation: "Feriefridag",
    categoryCompTime: "Afspadsering",
    payrollLink: "Løngrundlag",
    payrollTitle: "Løn-datagrundlag",
    payrollSubtitle: "Ferie, overarbejde og fravær til lønkørsel.",
    leaveBalancesTitle: "Fraværssaldi",
    addExtraVacationDay: "Tilføj feriefridag",
    addCompTimeDay: "Tilføj afspadsering",
    leavePolicyTitle: "Fraværspolitik",
    leaveProfileTitle: "Fravær og norm",
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
  venueInfo: {
    stageCapacityTitle: "Scene & kapacitet",
    capacityMetricLabel: "Kapacitet",
    widthLabel: "Bredde",
    depthLabel: "Dybde",
    heightLabel: "Højde",
    capacityPerson: "{{count}} person",
    capacityPersons: "{{count}} personer",
    tableColumnTitle: "Størrelse & kapacitet (m · personer)",
    tableColumnFiles: "Filer",
    tableColumnNotes: "Noter",
    audienceCapacityLabel: "Publikumskapacitet (personer)",
    widthMetersLabel: "Bredde (m)",
    depthMetersLabel: "Dybde (m)",
    heightMetersLabel: "Højde (m)",
    capacityShortLabel: "Kapacitet",
    capacityInputSuffix: "personer",
  },
};

const de: DeepPartial<typeof en> = {
  nav: {
    time: "Zeit",
    events: "Ereignisse",
    schedule: "Zeitplan",
    shows: "Shows",
    production: "Produktionsplaner",
    staffing: "Besetzung",
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
  time: {
    editTimePreciseHint:
      "Beliebige Minute (HH:MM), z. B. 07:24 für 7h 24m. Ziehen in der Wochenansicht bleibt auf 5 Minuten gerastert.",
    weekToolsExpand: "Anstehende Jobs & Katalog",
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
  venueInfo: {
    stageCapacityTitle: "Buehne & Kapazitaet",
    capacityMetricLabel: "Kapazitaet",
    widthLabel: "Breite",
    depthLabel: "Tiefe",
    heightLabel: "Hoehe",
    capacityPerson: "{{count}} Person",
    capacityPersons: "{{count}} Personen",
    tableColumnTitle: "Groesse & Kapazitaet (m · Personen)",
    tableColumnFiles: "Dateien",
    tableColumnNotes: "Notizen",
    audienceCapacityLabel: "Zuschauerkapazitaet (Personen)",
    widthMetersLabel: "Breite (m)",
    depthMetersLabel: "Tiefe (m)",
    heightMetersLabel: "Hoehe (m)",
    capacityShortLabel: "Kapazitaet",
    capacityInputSuffix: "Personen",
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

