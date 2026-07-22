import type { CSSProperties } from "react";
import type { TimeProjectFillPattern } from "@/contracts/backendTypes";

/** Stable accents when catalog colour is not set (#RRGGBB). */
const FALLBACK_PALETTE = [
  "#38bdf8",
  "#a78bfa",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#fb7185",
  "#2dd4bf",
  "#c084fc",
] as const;

export const TIME_PROJECT_FILL_PATTERN_OPTIONS: {
  id: TimeProjectFillPattern;
  labelKey: `time.${string}`;
}[] = [
  { id: "solid", labelKey: "time.fillPatternSolid" },
  { id: "hatch_diag", labelKey: "time.fillPatternHatchDiag" },
  { id: "hatch_diag_rev", labelKey: "time.fillPatternHatchDiagRev" },
  { id: "hatch_horiz", labelKey: "time.fillPatternHatchHoriz" },
  { id: "hatch_vert", labelKey: "time.fillPatternHatchVert" },
  { id: "crosshatch", labelKey: "time.fillPatternCrosshatch" },
  { id: "dots", labelKey: "time.fillPatternDots" },
];

export function fallbackAccentHex(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length];
}

/** Resolved display hex for a catalog row (stored colour or deterministic fallback). */
export function displayHex(stored: string | null | undefined, id: string): string {
  if (stored && /^#[0-9A-Fa-f]{6}$/.test(stored)) return stored;
  return fallbackAccentHex(id);
}

export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return `rgba(148, 163, 184, ${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function normalizeFillPattern(
  pattern: string | null | undefined
): TimeProjectFillPattern {
  if (
    pattern === "hatch_diag" ||
    pattern === "hatch_diag_rev" ||
    pattern === "hatch_horiz" ||
    pattern === "hatch_vert" ||
    pattern === "crosshatch" ||
    pattern === "dots"
  ) {
    return pattern;
  }
  return "solid";
}

/** CSS background for a project colour + optional hatch/fill pattern. */
export function projectFillBackground(
  hex: string,
  pattern: string | null | undefined,
  alpha = 0.32
): string {
  const base = hexToRgba(hex, alpha);
  const line = hexToRgba(hex, Math.min(0.85, alpha + 0.38));
  const p = normalizeFillPattern(pattern);
  switch (p) {
    case "hatch_diag":
      return `repeating-linear-gradient(45deg, ${base} 0 5px, ${line} 5px 7px)`;
    case "hatch_diag_rev":
      return `repeating-linear-gradient(-45deg, ${base} 0 5px, ${line} 5px 7px)`;
    case "hatch_horiz":
      return `repeating-linear-gradient(0deg, ${base} 0 5px, ${line} 5px 7px)`;
    case "hatch_vert":
      return `repeating-linear-gradient(90deg, ${base} 0 5px, ${line} 5px 7px)`;
    case "crosshatch":
      return [
        `repeating-linear-gradient(45deg, ${base} 0 5px, ${line} 5px 6px)`,
        `repeating-linear-gradient(-45deg, transparent 0 5px, ${line} 5px 6px)`,
      ].join(", ");
    case "dots":
      return `radial-gradient(circle at 1.5px 1.5px, ${line} 1.2px, ${base} 1.4px)`;
    default:
      return base;
  }
}

export function projectFillBackgroundSize(pattern: string | null | undefined): string | undefined {
  return normalizeFillPattern(pattern) === "dots" ? "8px 8px" : undefined;
}

/** Inline styles for time-entry / month-pill surfaces tinted by project. */
export function timeProjectSurfaceStyle(
  hex: string,
  pattern: string | null | undefined,
  opts?: { behind?: boolean }
): CSSProperties {
  const alpha = opts?.behind ? 0.14 : 0.32;
  const p = normalizeFillPattern(pattern);
  const borderColor = hexToRgba(hex, opts?.behind ? 0.35 : 0.65);
  const color = "rgba(255,255,255,0.92)";
  if (p === "solid") {
    return {
      backgroundColor: hexToRgba(hex, alpha),
      borderColor,
      color,
    };
  }
  return {
    backgroundColor: hexToRgba(hex, alpha * 0.55),
    backgroundImage: projectFillBackground(hex, p, alpha),
    backgroundSize: projectFillBackgroundSize(p),
    borderColor,
    color,
  };
}

/** Preview swatch style for catalog fill pickers. */
export function fillPatternPreviewStyle(
  hex: string,
  pattern: TimeProjectFillPattern
): CSSProperties {
  return timeProjectSurfaceStyle(hex, pattern);
}
