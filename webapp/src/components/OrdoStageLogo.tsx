import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const LIGHT_X = [50, 75, 100, 125, 150] as const;
/** Beam floor y — below STAGE baseline (~155) so wash reads under the wordmark. */
const BEAM_FLOOR_Y = 178;

const BEAMS = [
  { d: `M 50 62 L 28 ${BEAM_FLOOR_Y} L 72 ${BEAM_FLOOR_Y} Z`, fill: "#ff006e" },
  { d: `M 75 62 L 53 ${BEAM_FLOOR_Y} L 97 ${BEAM_FLOOR_Y} Z`, fill: "#fb5607" },
  { d: `M 100 62 L 78 ${BEAM_FLOOR_Y} L 122 ${BEAM_FLOOR_Y} Z`, fill: "#ffbe0b" },
  { d: `M 125 62 L 103 ${BEAM_FLOOR_Y} L 147 ${BEAM_FLOOR_Y} Z`, fill: "#3a86ff" },
  { d: `M 150 62 L 128 ${BEAM_FLOOR_Y} L 172 ${BEAM_FLOOR_Y} Z`, fill: "#8338ec" },
] as const;
const COLORS = ["#ff006e", "#fb5607", "#ffbe0b", "#3a86ff", "#8338ec"] as const;
/** Idle beam opacity (matches original SVG when not hovered). */
const IDLE_BEAM_OPACITY = [0.15, 0.15, 0.2, 0.15, 0.15] as const;

/**
 * Map screen X to lamp focus 0–4: left edge → lamp 0, horizontal center → 2 (yellow),
 * right edge → lamp 4.
 */
function focusIndexFromScreenX(clientX: number, width: number): number {
  if (width <= 0) return 2;
  const t = clientX / width;
  return t * 4;
}

/**
 * Smooth ramp: distance 0 → 100%, 1 → 75%, 2 → 50%, 3 → 25%, 4+ → tail.
 * Piecewise-linear in “lamp index” space so sliding the pointer eases cleanly.
 */
function lampFalloff(distance: number): number {
  const a: [number, number][] = [
    [0, 1],
    [1, 0.75],
    [2, 0.5],
    [3, 0.25],
    [4, 0.06],
  ];
  if (distance <= 0) return 1;
  if (distance >= a[a.length - 1]![0]) return a[a.length - 1]![1];
  for (let k = 0; k < a.length - 1; k++) {
    const [d0, v0] = a[k]!;
    const [d1, v1] = a[k + 1]!;
    if (distance <= d1) {
      const t = (distance - d0) / (d1 - d0);
      return v0 + t * (v1 - v0);
    }
  }
  return a[a.length - 1]![1];
}

function lampStrengthsFromFocus(focusIndex: number): number[] {
  return LIGHT_X.map((_, i) => Math.min(1, lampFalloff(Math.abs(i - focusIndex))));
}

/** Full-width artboard horizontally so “ORDO” Os aren’t clipped in the sidebar crop. */
const VIEWBOX_DEFAULT = { x: 0, y: 0, w: 200, h: 200 } as const;
const VIEWBOX_SIDEBAR = { x: 0, y: 36, w: 200, h: 146 } as const;

type OrdoStageLogoProps = {
  className?: string;
  /** Pixel width & height (square). Ignored when `variant="sidebar"`. */
  size?: number;
  interactive?: boolean;
  /** Full width of the left nav; uses a tighter viewBox so the mark uses nav width. */
  variant?: "default" | "sidebar";
};

export function OrdoStageLogo({
  className,
  size = 48,
  interactive = true,
  variant = "default",
}: OrdoStageLogoProps) {
  const vb = variant === "sidebar" ? VIEWBOX_SIDEBAR : VIEWBOX_DEFAULT;
  const uid = useId();

  const [smoothFocus, setSmoothFocus] = useState(2);
  const targetFocusRef = useRef(2);
  const smoothFocusRef = useRef(2);
  const lastClientXRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!interactive) return;
    if (typeof window === "undefined") return;

    const setTarget = (clientX: number) => {
      lastClientXRef.current = clientX;
      const w = window.innerWidth;
      if (w <= 0) return;
      targetFocusRef.current = focusIndexFromScreenX(clientX, w);
    };

    const tick = () => {
      rafRef.current = null;
      const tgt = targetFocusRef.current;
      const prev = smoothFocusRef.current;
      const alpha = 0.14;
      let next = prev + (tgt - prev) * alpha;
      if (Math.abs(tgt - next) < 0.0008) next = tgt;
      smoothFocusRef.current = next;
      setSmoothFocus(next);
      if (Math.abs(tgt - next) > 0.0015) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    const scheduleTick = () => {
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick);
    };

    const onMove = (e: MouseEvent) => {
      setTarget(e.clientX);
      scheduleTick();
    };

    const onResize = () => {
      setTarget(lastClientXRef.current);
      scheduleTick();
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("resize", onResize);

    const w = window.innerWidth;
    const initialX = w > 0 ? w / 2 : 0;
    lastClientXRef.current = initialX;
    if (w > 0) {
      const t = focusIndexFromScreenX(initialX, w);
      targetFocusRef.current = t;
      smoothFocusRef.current = t;
      setSmoothFocus(t);
    }

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", onResize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [interactive]);

  const strengths = useMemo(() => {
    if (!interactive) return LIGHT_X.map(() => 0);
    return lampStrengthsFromFocus(smoothFocus);
  }, [interactive, smoothFocus]);

  const gradId = `${uid}-textGrad`;
  /** Long easing on top of rAF-smoothed focus so opacity never pops. */
  const beamTransition =
    "opacity 340ms cubic-bezier(0.35, 0.06, 0.2, 1), fill-opacity 340ms cubic-bezier(0.35, 0.06, 0.2, 1)";
  const bulbTransition =
    "opacity 320ms cubic-bezier(0.35, 0.06, 0.2, 1), filter 340ms cubic-bezier(0.35, 0.06, 0.2, 1)";

  const viewBoxAttr = `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;

  return (
    <svg
      width={variant === "sidebar" ? undefined : size}
      height={variant === "sidebar" ? undefined : size}
      viewBox={viewBoxAttr}
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      overflow="visible"
      className={cn(
        "select-none",
        variant === "sidebar" ? "w-full h-auto min-w-0" : "shrink-0",
        interactive && "pointer-events-none",
        className,
      )}
      style={
        variant === "sidebar"
          ? { aspectRatio: `${vb.w} / ${vb.h}` }
          : undefined
      }
      aria-hidden
      role="img"
    >
      <title>OrdoStage</title>
      <rect width="200" height="200" fill="#111111" />

      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ff006e" stopOpacity={1} />
          <stop offset="25%" stopColor="#fb5607" stopOpacity={1} />
          <stop offset="50%" stopColor="#ffbe0b" stopOpacity={1} />
          <stop offset="75%" stopColor="#3a86ff" stopOpacity={1} />
          <stop offset="100%" stopColor="#8338ec" stopOpacity={1} />
        </linearGradient>
      </defs>

      <rect x="30" y="50" width="140" height="12" fill="#333" rx="2" />

      {LIGHT_X.map((cx, i) => {
        const s = interactive ? strengths[i] ?? 0 : 0;
        const glow = 0.76 + s * 0.24;
        return (
          <circle
            key={cx}
            cx={cx}
            cy="56"
            r="6"
            fill={COLORS[i]}
            style={{
              opacity: glow,
              filter: s > 0.28 ? `drop-shadow(0 0 ${3 + s * 10}px ${COLORS[i]})` : undefined,
              transition: bulbTransition,
            }}
          />
        );
      })}

      {BEAMS.map((beam, i) => {
        const s = interactive ? strengths[i] ?? 0 : 0;
        const floor = 0.06;
        const peak = 0.62;
        const opacity = interactive ? floor + s * peak : IDLE_BEAM_OPACITY[i];
        return (
          <path
            key={beam.d}
            d={beam.d}
            fill={beam.fill}
            style={{
              opacity,
              transition: beamTransition,
            }}
          />
        );
      })}

      <text
        x="100"
        y="120"
        fontFamily="Arial Black, Helvetica, sans-serif"
        fontSize="48"
        fontWeight="900"
        fill={`url(#${gradId})`}
        fillOpacity={1}
        stroke="none"
        textAnchor="middle"
        style={{ opacity: 1 }}
      >
        ORDO
      </text>
      <text
        x="100"
        y="155"
        fontFamily="Arial Black, Helvetica, sans-serif"
        fontSize="32"
        fontWeight="900"
        fill={`url(#${gradId})`}
        fillOpacity={1}
        stroke="none"
        textAnchor="middle"
        style={{ opacity: 1 }}
      >
        STAGE
      </text>
    </svg>
  );
}
