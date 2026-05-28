import { useMemo } from "react";
import { usePublicSiteLanguage } from "@/contexts/PublicSiteLanguageContext";
import type { Language } from "@/lib/preferences";

export type MarketingMessages = {
  navFeatures: string;
  navPricing: string;
  navTerms: string;
  navPrivacy: string;
  navMailUs: string;
  signUpFree: string;
  logIn: string;
  skipToMain: string;
  pageHome: string;
  pageFeatures: string;
  pagePricing: string;
  pageTerms: string;
  pagePrivacy: string;
  pageInvite: string;
  pageSignUp: string;
  pageLogIn: string;
  roleFeaturesTitleSuffix: string;
  viewPricing: string;
  whySwitchHeading: string;
  whySwitchBody: string;
  chipFewerMistakes: string;
  chipFasterHandovers: string;
  chipBetterAlignment: string;
  platformGridHeading: string;
  platformGridIntro: string;
  roleBinderAriaLabel: string;
  pricingLinkText: string;
  accountantPricingNote: string;
  maintenanceFeaturesLead: string;
  maintenancePricingLink: string;
  maintenanceLoginLink: string;
  breadcrumbHome: string;
  breadcrumbFeatures: string;
  forRolePrefix: string;
  seeAlso: string;
  seeAlsoBody: string;
  learnMore: string;
  getStartedFree: string;
  allRoles: string;
};

const en: MarketingMessages = {
  navFeatures: "Features",
  navPricing: "Pricing",
  navTerms: "Terms",
  navPrivacy: "Privacy",
  navMailUs: "Mail us",
  signUpFree: "Sign up free",
  logIn: "Log in",
  skipToMain: "Skip to main content",
  pageHome: "Home",
  pageFeatures: "Features",
  pagePricing: "Pricing",
  pageTerms: "Terms of Service",
  pagePrivacy: "Privacy Policy",
  pageInvite: "Invitation",
  pageSignUp: "Sign up",
  pageLogIn: "Log in",
  roleFeaturesTitleSuffix: "Features",
  viewPricing: "View pricing",
  whySwitchHeading: "Why organisations switch",
  whySwitchBody:
    "Less re-keying between tools. Fewer “did you see the update?” moments before load-in. Technical, production, and operations leadership see the same live picture — so decisions on show day rest on current data, not memory.",
  chipFewerMistakes: "Fewer planning mistakes",
  chipFasterHandovers: "Faster handovers",
  chipBetterAlignment: "Better team alignment",
  platformGridHeading: "All platform functions",
  platformGridIntro:
    "Beyond role-specific workflows, OrdoStage brings scheduling, venues, tours, staffing, time, and production planning into one connected system.",
  roleBinderAriaLabel: "Features by role",
  pricingLinkText: "pricing page",
  accountantPricingNote: "Compare Flex and Yearly on the",
  maintenanceFeaturesLead: "When we are back online, use the menu for",
  maintenancePricingLink: "Pricing",
  maintenanceLoginLink: "Log in",
  breadcrumbHome: "Home",
  breadcrumbFeatures: "Features",
  forRolePrefix: "For",
  seeAlso: "See also",
  seeAlsoBody: "Other roles that often work closely with this one.",
  learnMore: "Learn more →",
  getStartedFree: "Get started free",
  allRoles: "All roles",
};

const da: MarketingMessages = {
  navFeatures: "Funktioner",
  navPricing: "Priser",
  navTerms: "Vilkår",
  navPrivacy: "Privatliv",
  navMailUs: "Skriv til os",
  signUpFree: "Opret gratis konto",
  logIn: "Log ind",
  skipToMain: "Spring til hovedindhold",
  pageHome: "Forside",
  pageFeatures: "Funktioner",
  pagePricing: "Priser",
  pageTerms: "Servicevilkår",
  pagePrivacy: "Privatlivspolitik",
  pageInvite: "Invitation",
  pageSignUp: "Opret konto",
  pageLogIn: "Log ind",
  roleFeaturesTitleSuffix: "Funktioner",
  viewPricing: "Se priser",
  whySwitchHeading: "Hvorfor organisationer skifter",
  whySwitchBody:
    "Mindre genindtastning mellem værktøjer. Færre “så du opdateringen?”-øjeblikke før load-in. Teknik, produktion og drift ser det samme live billede — så beslutninger på showdagen bygger på aktuelle data, ikke hukommelse.",
  chipFewerMistakes: "Færre planlægningsfejl",
  chipFasterHandovers: "Hurtigere overleveringer",
  chipBetterAlignment: "Bedre team-alignment",
  platformGridHeading: "Alle platformfunktioner",
  platformGridIntro:
    "Ud over rollebaserede workflows samler OrdoStage planlægning, spillesteder, turnéer, bemanding, tid og produktionsplanlægning i ét sammenhængende system.",
  roleBinderAriaLabel: "Funktioner efter rolle",
  pricingLinkText: "prissiden",
  accountantPricingNote: "Sammenlign Flex og Yearly på",
  maintenanceFeaturesLead: "Når vi er online igen, brug menuen til",
  maintenancePricingLink: "Priser",
  maintenanceLoginLink: "Log ind",
  breadcrumbHome: "Forside",
  breadcrumbFeatures: "Funktioner",
  forRolePrefix: "Til",
  seeAlso: "Se også",
  seeAlsoBody: "Andre roller, der ofte arbejder tæt sammen med denne.",
  learnMore: "Læs mere →",
  getStartedFree: "Kom i gang gratis",
  allRoles: "Alle roller",
};

const de: MarketingMessages = {
  navFeatures: "Funktionen",
  navPricing: "Preise",
  navTerms: "AGB",
  navPrivacy: "Datenschutz",
  navMailUs: "Schreiben Sie uns",
  signUpFree: "Kostenlos registrieren",
  logIn: "Anmelden",
  skipToMain: "Zum Hauptinhalt springen",
  pageHome: "Startseite",
  pageFeatures: "Funktionen",
  pagePricing: "Preise",
  pageTerms: "Nutzungsbedingungen",
  pagePrivacy: "Datenschutzerklärung",
  pageInvite: "Einladung",
  pageSignUp: "Registrieren",
  pageLogIn: "Anmelden",
  roleFeaturesTitleSuffix: "Funktionen",
  viewPricing: "Preise ansehen",
  whySwitchHeading: "Warum Organisationen wechseln",
  whySwitchBody:
    "Weniger Doppeleingaben zwischen Tools. Weniger „Hast du das Update gesehen?“ vor dem Load-in. Technik, Produktion und Betrieb sehen dasselbe Live-Bild — Entscheidungen am Showtag basieren auf aktuellen Daten, nicht auf Erinnerung.",
  chipFewerMistakes: "Weniger Planungsfehler",
  chipFasterHandovers: "Schnellere Übergaben",
  chipBetterAlignment: "Besseres Team-Alignment",
  platformGridHeading: "Alle Plattformfunktionen",
  platformGridIntro:
    "Neben rollenspezifischen Workflows verbindet OrdoStage Terminplanung, Spielstätten, Touren, Besetzung, Zeit und Produktionsplanung in einem System.",
  roleBinderAriaLabel: "Funktionen nach Rolle",
  pricingLinkText: "Preisseite",
  accountantPricingNote: "Vergleichen Sie Flex und Yearly auf der",
  maintenanceFeaturesLead: "Wenn wir wieder online sind, nutzen Sie das Menü für",
  maintenancePricingLink: "Preise",
  maintenanceLoginLink: "Anmelden",
  breadcrumbHome: "Startseite",
  breadcrumbFeatures: "Funktionen",
  forRolePrefix: "Für",
  seeAlso: "Siehe auch",
  seeAlsoBody: "Weitere Rollen, die oft eng mit dieser zusammenarbeiten.",
  learnMore: "Mehr erfahren →",
  getStartedFree: "Kostenlos starten",
  allRoles: "Alle Rollen",
};

export const marketingMessages: Record<Language, MarketingMessages> = { en, da, de };

export function useMarketingCopy() {
  const { language } = usePublicSiteLanguage();
  const t = useMemo(() => marketingMessages[language], [language]);
  return { t, language };
}
