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

type AccentStyleSet = {
  tabBar: string;
  tabInactive: string;
  tabActive: string;
  tabTitle: string;
  tabTitleInactive: string;
  panelBorder: string;
  /** Top tint — active tab fill; matches panel gradient start. */
  panelTop: string;
  panelBg: string;
  panelInset: string;
  connector: string;
  headerEyebrow: string;
  section: string;
  sectionHeading: string;
  marker: string;
};

/** Role tab card — accent border and tint (selected or not). */
export function roleTabCard(styles: AccentStyleSet): string {
  return `${styles.panelBorder} ${styles.panelTop}`;
}

/** Active tab — border on top and sides only; bottom is open into the card. */
export function roleActiveTabJoin(styles: AccentStyleSet): string {
  return roleTabCard(styles);
}

/** Panel — same role tint at the top, deepening below. */
export function rolePanelFill(styles: AccentStyleSet): string {
  return `${styles.panelBorder} ${styles.panelBg}`;
}

/** Panel background only (border applied on outer shell). */
export function rolePanelBackground(styles: AccentStyleSet): string {
  return styles.panelBg;
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
    panelTop: "bg-ordo-magenta/[0.25]",
    panelBg: "bg-gradient-to-b from-ordo-magenta/[0.25] via-ordo-magenta/10 to-[#12121c]",
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
    panelTop: "bg-ordo-orange/[0.25]",
    panelBg: "bg-gradient-to-b from-ordo-orange/[0.25] via-ordo-orange/10 to-[#12121c]",
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
    panelTop: "bg-ordo-yellow/[0.22]",
    panelBg: "bg-gradient-to-b from-ordo-yellow/[0.22] via-ordo-yellow/10 to-[#12121c]",
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
    panelTop: "bg-ordo-blue/[0.25]",
    panelBg: "bg-gradient-to-b from-ordo-blue/[0.25] via-ordo-blue/10 to-[#12121c]",
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
    panelTop: "bg-ordo-violet/[0.28]",
    panelBg: "bg-gradient-to-b from-ordo-violet/[0.28] via-ordo-violet/[0.12] to-[#12121c]",
    panelInset: "shadow-[inset_0_2px_0_rgba(131,56,236,0.35)]",
    connector: "bg-gradient-to-r from-ordo-violet via-ordo-magenta to-ordo-orange",
    headerEyebrow: "text-ordo-violet",
    section: "border-ordo-violet/35 bg-gradient-to-br from-ordo-violet/[0.14] to-ordo-magenta/[0.06]",
    sectionHeading: "text-ordo-violet/95",
    marker: "marker:text-ordo-violet",
  },
};
