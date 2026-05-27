import type { OrdoAccent } from "@/lib/roleAccentStyles";

/** SVG stroke matching panel border colour at 50% opacity. */
export const PANEL_STROKE: Record<OrdoAccent, string> = {
  magenta: "rgba(255, 0, 110, 0.5)",
  orange: "rgba(251, 86, 7, 0.5)",
  yellow: "rgba(255, 190, 11, 0.5)",
  blue: "rgba(58, 134, 255, 0.5)",
  violet: "rgba(131, 56, 236, 0.5)",
};

const CORNER_RADIUS = 16;

/**
 * Card outline: left, bottom, right, and top segments beside the active tab (not under it).
 * Coordinates are relative to the binder container (0,0 = top-left).
 */
export function buildCardFramePath(
  containerWidth: number,
  panelTop: number,
  panelBottom: number,
  tabLeft: number,
  tabRight: number,
  radius = CORNER_RADIUS
): string {
  const w = containerWidth;
  const bottom = panelBottom;
  const top = panelTop;
  const r = radius;

  let d = `M ${r} ${bottom}`;
  d += ` L ${w - r} ${bottom}`;
  d += ` Q ${w} ${bottom} ${w} ${bottom - r}`;
  d += ` L ${w} ${top + r}`;
  d += ` Q ${w} ${top} ${w - r} ${top}`;

  const rightEnd = Math.max(tabRight, r);
  if (rightEnd < w - r) {
    d += ` L ${rightEnd} ${top}`;
  }

  const leftStart = Math.min(tabLeft, w - r);
  d += ` M ${leftStart} ${top}`;

  if (leftStart > r) {
    d += ` L ${r} ${top}`;
  }

  d += ` Q 0 ${top} 0 ${top + r}`;
  d += ` L 0 ${bottom - r}`;
  d += ` Q 0 ${bottom} ${r} ${bottom}`;

  return d;
}
