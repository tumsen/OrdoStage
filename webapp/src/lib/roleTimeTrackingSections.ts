import type { Language } from "@/lib/preferences";

type FeatureSection = {
  heading: string;
  body?: string;
  bullets: readonly string[];
};

const TIME_TRACKING_HEADING: Record<Language, string> = {
  en: "Time tracking",
  da: "Tidsregistrering",
  de: "Zeiterfassung",
};

const FALLBACK: Record<Language, FeatureSection> = {
  en: {
    heading: TIME_TRACKING_HEADING.en,
    body: "Organisations log hours against events, roles, and categories in one place.",
    bullets: [
      "Staff and crew enter time linked to the work they performed",
      "Managers and finance use reports and exports from the same data",
      "Reduce reliance on ad-hoc spreadsheets after closing night",
    ],
  },
  da: {
    heading: TIME_TRACKING_HEADING.da,
    body: "Organisationer registrerer timer mod begivenheder, roller og kategorier ét sted.",
    bullets: [
      "Medarbejdere og crew registrerer tid knyttet til det arbejde, de udførte",
      "Ledere og økonomi bruger rapporter og eksport fra de samme data",
      "Mindre afhængighed af ad hoc-regneark efter sidste forestilling",
    ],
  },
  de: {
    heading: TIME_TRACKING_HEADING.de,
    body: "Organisationen erfassen Stunden gegen Events, Rollen und Kategorien an einem Ort.",
    bullets: [
      "Personal und Crew erfassen Zeit verknüpft mit der geleisteten Arbeit",
      "Leitung und Finanzen nutzen Berichte und Exporte aus denselben Daten",
      "Weniger Ad-hoc-Tabellen nach der letzten Vorstellung",
    ],
  },
};

const BY_ROLE: Record<Language, Record<string, FeatureSection>> = {
  en: {
    "hr-manager": {
      heading: TIME_TRACKING_HEADING.en,
      body: "Connect your roster to the hours people actually work.",
      bullets: [
        "Staff and contractors log time against events, roles, and categories",
        "Reuse the same person record for staffing, invites, and time entries",
        "Support HR and finance with one trail from roster to reported hours",
      ],
    },
    producer: {
      heading: TIME_TRACKING_HEADING.en,
      body: "See labour against the productions you programme — not a separate timesheet tool.",
      bullets: [
        "Crew and staff log hours linked to events and shows in your season",
        "Compare activity across productions when reviewing run costs",
        "Keep artistic and operations aligned on who worked which show",
      ],
    },
    "production-manager": {
      heading: TIME_TRACKING_HEADING.en,
      body: "Track build and tech hours next to the production plan and event record.",
      bullets: [
        "Log time against productions, events, and staffing assignments",
        "Support retrospective costing after tech week and opening",
        "Give finance numbers tied to the work production actually coordinated",
      ],
    },
    "stage-manager": {
      heading: TIME_TRACKING_HEADING.en,
      body: "On busy show days, crew log hours where they belong — not on paper after load-out.",
      bullets: [
        "Let crew and staff log time against the event they are on",
        "Connect show-day work to the same schedule and staffing data you trust",
        "Reduce memory-based timesheets after a long run",
      ],
    },
    "tour-manager": {
      heading: TIME_TRACKING_HEADING.en,
      body: "Road crew hours stay linked to tour days and shows — city by city.",
      bullets: [
        "Log time against tour dates and performances on the road",
        "Support payroll and costing when the company moves every week",
        "Keep routing, staffing, and hours in one system instead of spreadsheets",
      ],
    },
    "head-of-stage": {
      heading: TIME_TRACKING_HEADING.en,
      body: "Technical and stage crew hours tie back to venues, events, and get-ins.",
      bullets: [
        "Log time against venue bookings and the events they support",
        "Track technical and stage labour for internal costing and reports",
        "Align crew hours with the room and show they worked",
      ],
    },
    accountant: {
      heading: TIME_TRACKING_HEADING.en,
      body: "Finance receives structured time data — not a folder of loose timesheets.",
      bullets: [
        "Collect entries from staff and crew linked to the work they did",
        "Run time reports for payroll prep and retrospective costing",
        "Export when finance needs to reconcile outside OrdoStage",
      ],
    },
  },
  da: {
    "hr-manager": {
      heading: TIME_TRACKING_HEADING.da,
      body: "Kobl din personliste til de timer, folk faktisk arbejder.",
      bullets: [
        "Medarbejdere og freelancere registrerer tid mod begivenheder, roller og kategorier",
        "Genbrug samme personpost til bemanding, invitationer og tidsregistrering",
        "Understøt HR og økonomi med én sti fra personliste til rapporterede timer",
      ],
    },
    producer: {
      heading: TIME_TRACKING_HEADING.da,
      body: "Se arbejdskraft mod de produktioner, du programmerer — ikke et separat timeseddelværktøj.",
      bullets: [
        "Crew og medarbejdere registrerer timer knyttet til begivenheder og forestillinger i sæsonen",
        "Sammenlign aktivitet på tværs af produktioner ved gennemgang af driftsomkostninger",
        "Hold kunstnerisk og drift aligned om, hvem der arbejdede på hvilken forestilling",
      ],
    },
    "production-manager": {
      heading: TIME_TRACKING_HEADING.da,
      body: "Følg build- og tech-timer ved siden af produktionsplan og begivenhed.",
      bullets: [
        "Registrer tid mod produktioner, begivenheder og bemandingstildelinger",
        "Understøt retrospektiv omkostning efter tech week og premiere",
        "Giv økonomi tal knyttet til det arbejde, produktion faktisk koordinerede",
      ],
    },
    "stage-manager": {
      heading: TIME_TRACKING_HEADING.da,
      body: "På travle showdage registrerer crew timer, hvor de hører til — ikke på papir efter load-out.",
      bullets: [
        "Lad crew og medarbejdere registrere tid mod den begivenhed, de er på",
        "Kobl showdagsarbejde til samme plan og bemanding, du stoler på",
        "Færre hukommelsesbaserede timesedler efter en lang periode",
      ],
    },
    "tour-manager": {
      heading: TIME_TRACKING_HEADING.da,
      body: "Turné-crew timer forbliver knyttet til turnédage og forestillinger — by for by.",
      bullets: [
        "Registrer tid mod turnédatoer og forestillinger på vejen",
        "Understøt løn og omkostning, når selskabet flytter hver uge",
        "Hold routing, bemanding og timer i ét system i stedet for regneark",
      ],
    },
    "head-of-stage": {
      heading: TIME_TRACKING_HEADING.da,
      body: "Teknisk og stage-crew timer knyttes tilbage til spillesteder, begivenheder og get-ins.",
      bullets: [
        "Registrer tid mod spillestedsbookinger og de begivenheder, de understøtter",
        "Følg teknisk og stage-arbejdskraft til intern omkostning og rapporter",
        "Align crew-timer med det rum og den forestilling, de arbejdede på",
      ],
    },
    accountant: {
      heading: TIME_TRACKING_HEADING.da,
      body: "Økonomi modtager strukturerede tidsdata — ikke en mappe med løse timesedler.",
      bullets: [
        "Indsaml poster fra medarbejdere og crew knyttet til det udførte arbejde",
        "Kør tidsrapporter til lønforberedelse og retrospektiv omkostning",
        "Eksportér når økonomi skal afstemme uden for OrdoStage",
      ],
    },
  },
  de: {
    "hr-manager": {
      heading: TIME_TRACKING_HEADING.de,
      body: "Verknüpfen Sie Ihren Stamm mit den Stunden, die Menschen tatsächlich arbeiten.",
      bullets: [
        "Personal und Freelancer erfassen Zeit gegen Events, Rollen und Kategorien",
        "Dieselbe Person für Besetzung, Einladungen und Zeiteinträge wiederverwenden",
        "HR und Finanzen mit einer Spur vom Stamm zu gemeldeten Stunden unterstützen",
      ],
    },
    producer: {
      heading: TIME_TRACKING_HEADING.de,
      body: "Arbeitszeit gegen die Produktionen sehen, die Sie programmieren — kein separates Zeiterfassungstool.",
      bullets: [
        "Crew und Personal erfassen Stunden verknüpft mit Events und Shows der Saison",
        "Aktivität über Produktionen vergleichen bei Laufkosten-Review",
        "Künstlerisches und Betrieb aligned, wer an welcher Show gearbeitet hat",
      ],
    },
    "production-manager": {
      heading: TIME_TRACKING_HEADING.de,
      body: "Build- und Tech-Stunden neben Produktionsplan und Event erfassen.",
      bullets: [
        "Zeit gegen Produktionen, Events und Besetzungszuweisungen erfassen",
        "Retrospektive Kosten nach Tech Week und Premiere unterstützen",
        "Finanzen Zahlen verknüpft mit der koordinierten Produktionsarbeit geben",
      ],
    },
    "stage-manager": {
      heading: TIME_TRACKING_HEADING.de,
      body: "An vollen Showtagen erfasst die Crew Stunden dort, wo sie hingehören — nicht auf Papier nach Load-out.",
      bullets: [
        "Crew und Personal erfassen Zeit gegen das Event, an dem sie sind",
        "Showtag-Arbeit mit demselben Plan und derselben Besetzung verbinden",
        "Weniger erinnerungsbasierte Stundenzettel nach langen Läufen",
      ],
    },
    "tour-manager": {
      heading: TIME_TRACKING_HEADING.de,
      body: "Tour-Crew-Stunden bleiben mit Tourtagen und Shows verknüpft — Stadt für Stadt.",
      bullets: [
        "Zeit gegen Tourdaten und Vorstellungen unterwegs erfassen",
        "Lohn und Kosten unterstützen, wenn die Company wöchentlich umzieht",
        "Routing, Besetzung und Stunden in einem System statt Tabellen",
      ],
    },
    "head-of-stage": {
      heading: TIME_TRACKING_HEADING.de,
      body: "Technische und Stage-Crew-Stunden verknüpft mit Spielstätten, Events und Get-ins.",
      bullets: [
        "Zeit gegen Venue-Buchungen und die Events, die sie tragen, erfassen",
        "Technische und Stage-Arbeit für interne Kosten und Berichte verfolgen",
        "Crew-Stunden mit Raum und Show abstimmen, an der gearbeitet wurde",
      ],
    },
    accountant: {
      heading: TIME_TRACKING_HEADING.de,
      body: "Finanzen erhalten strukturierte Zeitdaten — keinen Ordner loser Stundenzettel.",
      bullets: [
        "Einträge von Personal und Crew verknüpft mit der geleisteten Arbeit sammeln",
        "Zeitberichte für Lohnvorbereitung und retrospektive Kosten",
        "Export, wenn Finanzen außerhalb von OrdoStage abstimmen müssen",
      ],
    },
  },
};

export const PLANS_BILLING_HEADING: Record<Language, string> = {
  en: "Plans & billing",
  da: "Planer og fakturering",
  de: "Pläne & Abrechnung",
};

/** Role-specific time tracking copy — included on every role's feature spec. */
export function getTimeTrackingSection(roleSlug: string, language: Language = "en"): FeatureSection {
  return BY_ROLE[language][roleSlug] ?? FALLBACK[language];
}

export function isTimeTrackingSection(heading: string): boolean {
  const headings = new Set([
    TIME_TRACKING_HEADING.en,
    TIME_TRACKING_HEADING.da,
    TIME_TRACKING_HEADING.de,
  ]);
  return headings.has(heading) || /time\s*track|time\s*log|tidsregistrering|zeiterfassung/i.test(heading);
}

export function isPlansBillingSection(heading: string): boolean {
  return Object.values(PLANS_BILLING_HEADING).includes(heading);
}
