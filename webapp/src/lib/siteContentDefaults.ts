import type { Language } from "@/lib/preferences";

const LANDING_BY_LOCALE: Record<
  Language,
  {
    landing_title: string;
    landing_subtitle: string;
    landing_lead: string;
    landing_postscript: string;
    landing_closing: string;
    landing_section_heading: string;
    landing_section_body: string;
    landing_cta_text: string;
  }
> = {
  en: {
    landing_title: "OrdoStage — Planning for theaters, venues & touring productions",
    landing_subtitle:
      "Plan productions, coordinate teams, and run tours in one platform built for live performance.",
    landing_lead:
      "Stop juggling spreadsheets, email threads, and shared drives. OrdoStage connects scheduling, venue specs, tech riders, and crew coordination in one live workspace — from first rehearsal to closing night.",
    landing_postscript: [
      "Workflow-first planning — not a generic project tool.",
      "One schedule across venues, tours, and departments.",
      "Riders, specs, and staffing — linked to the show they belong to.",
    ].join("\n"),
    landing_closing: "For theaters · venues · touring companies · everyone running the show.",
    landing_section_heading: "See it by role",
    landing_section_body:
      "Same live data for your whole organisation — pick a role to explore what matters for that job.",
    landing_cta_text: "Get started free",
  },
  da: {
    landing_title: "OrdoStage — Planlægning til teatre, spillesteder og turnéproduktioner",
    landing_subtitle:
      "Planlæg produktioner, koordinér teams og kør turnéer i én platform bygget til live performance.",
    landing_lead:
      "Slut med at jonglere regneark, mailtråde og delte drev. OrdoStage forbinder planlægning, spillestedsspecifikationer, tech riders og crew-koordinering i ét levende workspace — fra første prøve til sidste forestilling.",
    landing_postscript: [
      "Workflow-først planlægning — ikke et generisk projektværktøj.",
      "Én kalender på tværs af spillesteder, turnéer og afdelinger.",
      "Riders, specs og bemanding — knyttet til den forestilling, de hører til.",
    ].join("\n"),
    landing_closing: "Til teatre · spillesteder · turnévirksomheder · alle der driver showet.",
    landing_section_heading: "Se det efter rolle",
    landing_section_body:
      "Samme live data for hele organisationen — vælg en rolle og udforsk det, der betyder noget for det job.",
    landing_cta_text: "Kom i gang gratis",
  },
  de: {
    landing_title: "OrdoStage — Planung für Theater, Spielstätten und Tourproduktionen",
    landing_subtitle:
      "Produktionen planen, Teams koordinieren und Touren fahren — in einer Plattform für Live-Performance.",
    landing_lead:
      "Schluss mit Tabellen, E-Mail-Ketten und geteilten Laufwerken. OrdoStage verbindet Terminplanung, Venue-Specs, Tech-Rider und Crew-Koordination in einem lebendigen Workspace — von der ersten Probe bis zur letzten Vorstellung.",
    landing_postscript: [
      "Workflow-first Planung — kein generisches Projekttool.",
      "Ein Kalender über Spielstätten, Touren und Abteilungen hinweg.",
      "Rider, Specs und Besetzung — verknüpft mit der Show, zu der sie gehören.",
    ].join("\n"),
    landing_closing: "Für Theater · Spielstätten · Tourfirmen · alle, die die Show am Laufen halten.",
    landing_section_heading: "Nach Rolle entdecken",
    landing_section_body:
      "Gleiche Live-Daten für die ganze Organisation — wählen Sie eine Rolle und sehen Sie, was für diesen Job zählt.",
    landing_cta_text: "Kostenlos starten",
  },
};

export function getLandingContentDefaults(language: Language) {
  return LANDING_BY_LOCALE[language];
}
