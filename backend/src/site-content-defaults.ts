import type { z } from "zod";
import type { LanguageSchema } from "./types";

export type Language = z.infer<typeof LanguageSchema>;

const LANDING_KEYS = [
  "landing_title",
  "landing_subtitle",
  "landing_lead",
  "landing_postscript",
  "landing_closing",
  "landing_section_heading",
  "landing_section_body",
  "landing_cta_text",
  "landing_cta_url",
] as const;

const LANDING_BY_LOCALE: Record<Language, Record<(typeof LANDING_KEYS)[number], string>> = {
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
    landing_cta_url: "/signup",
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
    landing_cta_url: "/signup",
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
    landing_cta_url: "/signup",
  },
};

export function getLandingDefaultsForLanguage(language: Language): Record<string, string> {
  return { ...LANDING_BY_LOCALE[language] };
}

/** Merge locale-specific landing copy onto a base defaults map (non-landing keys). */
export function mergeLandingDefaults(
  base: Record<string, string>,
  language: Language
): Record<string, string> {
  return { ...base, ...LANDING_BY_LOCALE[language] };
}

export const LANDING_SITE_CONTENT_SEED_LOCALES: Language[] = ["en", "da", "de"];

export function getLandingSeedRows(): Array<{ key: string; value: string; locale: Language }> {
  const rows: Array<{ key: string; value: string; locale: Language }> = [];
  for (const locale of LANDING_SITE_CONTENT_SEED_LOCALES) {
    for (const key of LANDING_KEYS) {
      rows.push({ key, value: LANDING_BY_LOCALE[locale][key], locale });
    }
  }
  return rows;
}
