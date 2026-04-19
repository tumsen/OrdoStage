import { useCallback, useId, useMemo, useRef, useState } from "react";
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

const LAMP_SPACING = 25;
const FIRST_LAMP_X = 50;

/** Continuous “focus” between lamps 0–4 from horizontal position. */
function focusIndexFromMouseX(mouseX: number): number {
  return (mouseX - FIRST_LAMP_X) / LAMP_SPACING;
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

/** 0–1 level per lamp while pointer is over the graphic. */
function lampStrengths(mouseX: number, mouseY: number): number[] {
  const focus = focusIndexFromMouseX(mouseX);
  const yFade = mouseY >= 48 ? 1 : 0.22 + Math.max(0, mouseY / 48) * 0.78;
  return LIGHT_X.map((_, i) => Math.min(1, lampFalloff(Math.abs(i - focus)) * yFade));
}

/** Default 200×200 artwork. Sidebar crops empty margin so the mark can span the nav width. */
const VIEWBOX_DEFAULT = { x: 0, y: 0, w: 200, h: 200 } as const;
/** Tighter crop; bottom clears extended beams (see BEAM_FLOOR_Y). */
const VIEWBOX_SIDEBAR = { x: 10, y: 36, w: 180, h: 146 } as const;

type OrdoStageLogoProps = {
  className?: string;
  /** Pixel width & height (square). Ignored when `variant="sidebar"`. */
  size?: number;
  interactive?: boolean;
  /** Full width of the left nav; uses a tighter viewBox so the logo reads at ~nav width. */
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
  const rootRef = useRef<SVGSVGElement>(null);
  const [inside, setInside] = useState(false);
  const [mx, setMx] = useState(() => vb.x + vb.w / 2);
  const [my, setMy] = useState(() => vb.y + vb.h * 0.45);

  const strengths = useMemo(() => lampStrengths(mx, my), [mx, my]);

  const updatePointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = vb.x + ((clientX - rect.left) / rect.width) * vb.w;
      const y = vb.y + ((clientY - rect.top) / rect.height) * vb.h;
      setMx(x);
      setMy(y);
    },
    [vb],
  );

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!interactive) return;
    updatePointer(e.clientX, e.clientY);
  };

  const handleEnter = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!interactive) return;
    setInside(true);
    updatePointer(e.clientX, e.clientY);
  };

  const handleLeave = () => {
    setInside(false);
    setMx(vb.x + vb.w / 2);
    setMy(vb.y + vb.h * 0.45);
  };

  const gradId = `${uid}-textGrad`;
  /** Short + smooth: fast follow, no mushy lag. */
  const beamTransition = "opacity 165ms cubic-bezier(0.4, 0, 0.2, 1), fill-opacity 165ms cubic-bezier(0.4, 0, 0.2, 1)";
  const bulbTransition =
    "opacity 165ms cubic-bezier(0.4, 0, 0.2, 1), filter 165ms cubic-bezier(0.4, 0, 0.2, 1)";

  const viewBoxAttr = `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;

  return (
    <svg
      ref={rootRef}
      width={variant === "sidebar" ? undefined : size}
      height={variant === "sidebar" ? undefined : size}
      viewBox={viewBoxAttr}
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(
        "select-none",
        variant === "sidebar" ? "w-full h-auto min-w-0" : "shrink-0",
        interactive && "cursor-crosshair",
        className,
      )}
      style={
        variant === "sidebar"
          ? { aspectRatio: `${vb.w} / ${vb.h}` }
          : undefined
      }
      onMouseEnter={handleEnter}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
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
        const s = inside ? strengths[i] : 0;
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
        const s = inside ? strengths[i] : 0;
        const floor = 0.06;
        const peak = 0.62;
        const opacity = inside ? floor + s * peak : IDLE_BEAM_OPACITY[i];
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

      {/* Gradient wordmark only (drawn last — full rainbow on top). */}
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
