import { useCallback, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const LIGHT_X = [50, 75, 100, 125, 150] as const;
const BEAMS = [
  { d: "M 50 62 L 30 150 L 70 150 Z", fill: "#ff006e" },
  { d: "M 75 62 L 55 150 L 95 150 Z", fill: "#fb5607" },
  { d: "M 100 62 L 80 150 L 120 150 Z", fill: "#ffbe0b" },
  { d: "M 125 62 L 105 150 L 145 150 Z", fill: "#3a86ff" },
  { d: "M 150 62 L 130 150 L 170 150 Z", fill: "#8338ec" },
] as const;
const COLORS = ["#ff006e", "#fb5607", "#ffbe0b", "#3a86ff", "#8338ec"] as const;
/** Idle beam opacity (matches original SVG when not hovered). */
const IDLE_BEAM_OPACITY = [0.15, 0.15, 0.2, 0.15, 0.15] as const;

/** Gaussian-ish falloff: strongest when mouse aligns with that light horizontally. */
function beamStrength(mouseX: number, mouseY: number, lightX: number): number {
  const sigma = 42;
  const gx = Math.exp(-((mouseX - lightX) ** 2) / (2 * sigma * sigma));
  /** Slightly favor pointer below the bar (into the beams). */
  const yBoost = mouseY >= 52 ? 1 : 0.65 + (mouseY / 52) * 0.35;
  return Math.min(1, gx * yBoost);
}

type OrdoStageLogoProps = {
  className?: string;
  /** Pixel width & height (square). */
  size?: number;
  interactive?: boolean;
};

export function OrdoStageLogo({ className, size = 48, interactive = true }: OrdoStageLogoProps) {
  const uid = useId();
  const rootRef = useRef<SVGSVGElement>(null);
  const [inside, setInside] = useState(false);
  const [mx, setMx] = useState(100);
  const [my, setMy] = useState(80);

  const strengths = useMemo(() => {
    return LIGHT_X.map((lx) => beamStrength(mx, my, lx));
  }, [mx, my]);

  const updatePointer = useCallback((clientX: number, clientY: number) => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 200;
    const y = ((clientY - rect.top) / rect.height) * 200;
    setMx(x);
    setMy(y);
  }, []);

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
    setMx(100);
    setMy(120);
  };

  const gradId = `${uid}-textGrad`;
  const transition = "opacity 320ms ease, fill-opacity 380ms ease";

  return (
    <svg
      ref={rootRef}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("select-none shrink-0", interactive && "cursor-crosshair", className)}
      onMouseEnter={handleEnter}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      aria-hidden
      role="img"
    >
      <title>OrdoStage</title>
      <rect width="200" height="200" fill="#111111" />

      <text
        x="100"
        y="120"
        fontFamily="Arial Black, Helvetica, sans-serif"
        fontSize="48"
        fontWeight="900"
        fill="none"
        stroke="#222"
        strokeWidth="2"
        textAnchor="middle"
      >
        ORDO
      </text>
      <text
        x="100"
        y="155"
        fontFamily="Arial Black, Helvetica, sans-serif"
        fontSize="32"
        fontWeight="900"
        fill="none"
        stroke="#222"
        strokeWidth="2"
        textAnchor="middle"
      >
        STAGE
      </text>

      <rect x="30" y="50" width="140" height="12" fill="#333" rx="2" />

      {LIGHT_X.map((cx, i) => {
        const s = inside ? strengths[i] : 0;
        const glow = 0.72 + s * 0.28;
        return (
          <circle
            key={cx}
            cx={cx}
            cy="56"
            r="6"
            fill={COLORS[i]}
            style={{
              opacity: glow,
              filter: s > 0.35 ? `drop-shadow(0 0 ${4 + s * 8}px ${COLORS[i]})` : undefined,
              transition,
            }}
          />
        );
      })}

      {BEAMS.map((beam, i) => {
        const s = inside ? strengths[i] : 0;
        const base = 0.08;
        const peak = 0.52;
        const opacity = inside ? base + s * peak : IDLE_BEAM_OPACITY[i];
        return (
          <path
            key={beam.d}
            d={beam.d}
            fill={beam.fill}
            style={{
              opacity,
              transition,
            }}
          />
        );
      })}

      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ff006e" />
          <stop offset="25%" stopColor="#fb5607" />
          <stop offset="50%" stopColor="#ffbe0b" />
          <stop offset="75%" stopColor="#3a86ff" />
          <stop offset="100%" stopColor="#8338ec" />
        </linearGradient>
      </defs>

      <text
        x="100"
        y="120"
        fontFamily="Arial Black, Helvetica, sans-serif"
        fontSize="48"
        fontWeight="900"
        fill={`url(#${gradId})`}
        textAnchor="middle"
        style={{
          opacity: inside ? 0.92 + Math.max(...strengths) * 0.08 : 0.88,
          transition,
        }}
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
        textAnchor="middle"
        style={{
          opacity: inside ? 0.92 + Math.max(...strengths) * 0.08 : 0.88,
          transition,
        }}
      >
        STAGE
      </text>
    </svg>
  );
}
