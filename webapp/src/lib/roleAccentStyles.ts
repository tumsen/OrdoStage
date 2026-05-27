/** OrdoStage logo beam colours — magenta, orange, yellow, blue, violet */
export type OrdoAccent = "magenta" | "orange" | "yellow" | "blue" | "violet";

export const ROLE_ACCENT_BY_SLUG: Record<string, OrdoAccent> = {
  "hr-manager": "violet",
  producer: "magenta",
  "production-manager": "orange",
  "stage-manager": "yellow",
  "tour-manager": "blue",
  "head-of-stage": "violet",
  accountant: "yellow",
};

export function getRoleAccent(slug: string): OrdoAccent {
  return ROLE_ACCENT_BY_SLUG[slug] ?? "magenta";
}

/** Solid fill shared by active tab and panel (gradients sit on top of this in the panel). */
export const ROLE_TAB_PANEL_SOLID = "bg-[#12121c]";

type AccentStyleSet = {
  tabBar: string;
  tabInactive: string;
  tabActive: string;
  tabTitle: string;
  tabTitleInactive: string;
  panelBorder: string;
  panelBg: string;
  panelInset: string;
  connector: string;
  headerEyebrow: string;
  section: string;
  sectionHeading: string;
  marker: string;
};

/** Active tab — solid fill matching the panel base colour. */
export function roleActiveTabFill(styles: AccentStyleSet): string {
  return `${styles.panelBorder} ${ROLE_TAB_PANEL_SOLID}`;
}

/** Panel — same border + accent gradient (via colour matches tab solid). */
export function rolePanelFill(styles: AccentStyleSet): string {
  return `${styles.panelBorder} ${styles.panelBg}`;
}

export const ORDO_ACCENT_STYLES: Record<OrdoAccent, AccentStyleSet> = {
  magenta: {
    tabBar: "bg-ordo-magenta",
    tabInactive:
      "border-ordo-magenta/30 bg-gradient-to-br from-ordo-magenta/14 via-white/[0.02] to-transparent hover:border-ordo-magenta/50 hover:from-ordo-magenta/20",
    tabActive:
      "border-ordo-magenta/55 border-b-transparent bg-[#12121c] shadow-[0_-6px_28px_rgba(255,0,110,0.2)]",
    tabTitle: "text-ordo-magenta",
    tabTitleInactive: "text-white/95",
    panelBorder: "border-ordo-magenta/50",
    panelBg: "bg-gradient-to-br from-ordo-magenta/[0.14] via-[#12121c] to-[#0d0d14]",
    panelInset: "shadow-[inset_0_2px_0_rgba(255,0,110,0.35)]",
    connector: "bg-gradient-to-r from-ordo-magenta via-ordo-orange to-ordo-yellow",
    headerEyebrow: "text-ordo-magenta",
    section: "border-ordo-magenta/35 bg-gradient-to-br from-ordo-magenta/[0.14] to-ordo-violet/[0.06]",
    sectionHeading: "text-ordo-magenta/95",
    marker: "marker:text-ordo-magenta",
  },
  orange: {
    tabBar: "bg-ordo-orange",
    tabInactive:
      "border-ordo-orange/30 bg-gradient-to-br from-ordo-orange/14 via-white/[0.02] to-transparent hover:border-ordo-orange/50 hover:from-ordo-orange/20",
    tabActive:
      "border-ordo-orange/55 border-b-transparent bg-[#12121c] shadow-[0_-6px_28px_rgba(251,86,7,0.2)]",
    tabTitle: "text-ordo-orange",
    tabTitleInactive: "text-white/95",
    panelBorder: "border-ordo-orange/50",
    panelBg: "bg-gradient-to-br from-ordo-orange/[0.14] via-[#12121c] to-[#0d0d14]",
    panelInset: "shadow-[inset_0_2px_0_rgba(251,86,7,0.35)]",
    connector: "bg-gradient-to-r from-ordo-orange via-ordo-yellow to-ordo-magenta",
    headerEyebrow: "text-ordo-orange",
    section: "border-ordo-orange/35 bg-gradient-to-br from-ordo-orange/[0.14] to-ordo-magenta/[0.06]",
    sectionHeading: "text-ordo-orange/95",
    marker: "marker:text-ordo-orange",
  },
  yellow: {
    tabBar: "bg-ordo-yellow",
    tabInactive:
      "border-ordo-yellow/30 bg-gradient-to-br from-ordo-yellow/12 via-white/[0.02] to-transparent hover:border-ordo-yellow/50 hover:from-ordo-yellow/18",
    tabActive:
      "border-ordo-yellow/55 border-b-transparent bg-[#12121c] shadow-[0_-6px_28px_rgba(255,190,11,0.18)]",
    tabTitle: "text-ordo-yellow",
    tabTitleInactive: "text-white/95",
    panelBorder: "border-ordo-yellow/50",
    panelBg: "bg-gradient-to-br from-ordo-yellow/[0.12] via-[#12121c] to-ordo-orange/[0.08]",
    panelInset: "shadow-[inset_0_2px_0_rgba(255,190,11,0.35)]",
    connector: "bg-gradient-to-r from-ordo-yellow via-ordo-orange to-ordo-magenta",
    headerEyebrow: "text-ordo-yellow",
    section: "border-ordo-yellow/35 bg-gradient-to-br from-ordo-yellow/[0.12] to-ordo-orange/[0.06]",
    sectionHeading: "text-ordo-yellow/95",
    marker: "marker:text-ordo-yellow",
  },
  blue: {
    tabBar: "bg-ordo-blue",
    tabInactive:
      "border-ordo-blue/30 bg-gradient-to-br from-ordo-blue/14 via-white/[0.02] to-transparent hover:border-ordo-blue/50 hover:from-ordo-blue/20",
    tabActive:
      "border-ordo-blue/55 border-b-transparent bg-[#12121c] shadow-[0_-6px_28px_rgba(58,134,255,0.2)]",
    tabTitle: "text-ordo-blue",
    tabTitleInactive: "text-white/95",
    panelBorder: "border-ordo-blue/50",
    panelBg: "bg-gradient-to-br from-ordo-blue/[0.14] via-[#12121c] to-ordo-violet/[0.08]",
    panelInset: "shadow-[inset_0_2px_0_rgba(58,134,255,0.35)]",
    connector: "bg-gradient-to-r from-ordo-blue via-ordo-violet to-ordo-magenta",
    headerEyebrow: "text-ordo-blue",
    section: "border-ordo-blue/35 bg-gradient-to-br from-ordo-blue/[0.14] to-ordo-violet/[0.06]",
    sectionHeading: "text-ordo-blue/95",
    marker: "marker:text-ordo-blue",
  },
  violet: {
    tabBar: "bg-ordo-violet",
    tabInactive:
      "border-ordo-violet/30 bg-gradient-to-br from-ordo-violet/14 via-white/[0.02] to-transparent hover:border-ordo-violet/50 hover:from-ordo-violet/20",
    tabActive:
      "border-ordo-violet/55 border-b-transparent bg-[#12121c] shadow-[0_-6px_28px_rgba(131,56,236,0.22)]",
    tabTitle: "text-ordo-violet",
    tabTitleInactive: "text-white/95",
    panelBorder: "border-ordo-violet/50",
    panelBg: "bg-gradient-to-br from-ordo-violet/[0.14] via-[#12121c] to-ordo-magenta/[0.08]",
    panelInset: "shadow-[inset_0_2px_0_rgba(131,56,236,0.35)]",
    connector: "bg-gradient-to-r from-ordo-violet via-ordo-magenta to-ordo-orange",
    headerEyebrow: "text-ordo-violet",
    section: "border-ordo-violet/35 bg-gradient-to-br from-ordo-violet/[0.14] to-ordo-magenta/[0.06]",
    sectionHeading: "text-ordo-violet/95",
    marker: "marker:text-ordo-violet",
  },
};
