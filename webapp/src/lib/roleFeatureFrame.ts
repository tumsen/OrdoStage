import type { OrdoAccent } from "@/lib/roleAccentStyles";

/** SVG stroke — solid ordo accent, aligned with tab panel borders. */
export const PANEL_STROKE: Record<OrdoAccent, string> = {
  magenta: "#ff006e",
  orange: "#fb5607",
  yellow: "#ffbe0b",
  blue: "#3a86ff",
  violet: "#8338ec",
};

const CARD_RADIUS = 16;
const TAB_RADIUS = 12;

/**
 * One continuous outline: card (no top under tab) + active tab (top and sides).
 * Coordinates are relative to the binder container.
 */
export function buildCardFramePath(
  containerWidth: number,
  panelTop: number,
  panelBottom: number,
  tabLeft: number,
  tabRight: number,
  tabTop: number,
  cardRadius = CARD_RADIUS,
  tabRadius = TAB_RADIUS
): string {
  const w = containerWidth;
  const bottom = panelBottom;
  const joinY = panelTop;
  const cr = cardRadius;
  const tr = tabRadius;

  let d = `M ${cr} ${bottom}`;
  d += ` L ${w - cr} ${bottom}`;
  d += ` Q ${w} ${bottom} ${w} ${bottom - cr}`;
  d += ` L ${w} ${joinY + cr}`;
  d += ` Q ${w} ${joinY} ${w - cr} ${joinY}`;

  if (tabRight < w - cr) {
    d += ` L ${tabRight} ${joinY}`;
  }

  // Active tab: up the right side, across the top, down the left side to the card top line
  d += ` L ${tabRight} ${tabTop + tr}`;
  d += ` Q ${tabRight} ${tabTop} ${tabRight - tr} ${tabTop}`;
  d += ` L ${tabLeft + tr} ${tabTop}`;
  d += ` Q ${tabLeft} ${tabTop} ${tabLeft} ${tabTop + tr}`;
  d += ` L ${tabLeft} ${joinY}`;

  if (tabLeft > cr) {
    d += ` L ${cr} ${joinY}`;
  }

  d += ` Q 0 ${joinY} 0 ${joinY + cr}`;
  d += ` L 0 ${bottom - cr}`;
  d += ` Q 0 ${bottom} ${cr} ${bottom}`;
  d += " Z";

  return d;
}
