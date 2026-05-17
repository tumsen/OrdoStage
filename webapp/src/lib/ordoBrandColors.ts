/** OrdoStage wordmark / logo beam palette — keep in sync with `tailwind.config.ts` `ordo.*`. */
export const ORDO_HEX = {
  magenta: "#ff006e",
  orange: "#fb5607",
  yellow: "#ffbe0b",
  blue: "#3a86ff",
  violet: "#8338ec",
} as const;

export const ORDO_CHART_FLEX = ORDO_HEX.magenta;
export const ORDO_CHART_YEARLY = ORDO_HEX.violet;
export const ORDO_CHART_PER_USER = ORDO_HEX.blue;
export const ORDO_CHART_GRID = "rgba(255,255,255,0.06)";
export const ORDO_CHART_AXIS = "rgba(255,255,255,0.38)";

export type PlanAccent = "flex" | "yearly";

export const planAccentStyles: Record<
  PlanAccent,
  { cardBorder: string; label: string; value: string; sectionBorder: string; sectionBg: string }
> = {
  flex: {
    cardBorder: "border-ordo-magenta/35 bg-ordo-magenta/10",
    label: "text-ordo-magenta/90",
    value: "text-ordo-magenta",
    sectionBorder: "border-ordo-magenta/30",
    sectionBg: "bg-ordo-magenta/5",
  },
  yearly: {
    cardBorder: "border-ordo-violet/35 bg-ordo-violet/10",
    label: "text-ordo-violet/90",
    value: "text-ordo-violet",
    sectionBorder: "border-ordo-violet/30",
    sectionBg: "bg-ordo-violet/5",
  },
};

/** Savings / highlight chips on pricing surfaces */
export const ordoSavingsChipClass =
  "rounded-md border border-ordo-yellow/35 bg-ordo-yellow/15 px-2 py-0.5 text-[11px] font-medium text-ordo-yellow/95";

/** Admin model inputs (floor seat #, floor marginal) */
export const ordoModelHighlightInputClass =
  "border-ordo-yellow/30 focus-visible:ring-ordo-yellow/40";

export const ordoModelHighlightPanelClass = {
  border: "border-ordo-yellow/40 bg-ordo-yellow/10",
  label: "text-ordo-yellow/90",
} as const;
