import { memo, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

const LIGHT_X = [50, 75, 100, 125, 150] as const;
const BEAM_FLOOR_Y = 178;

const BEAMS = [
  { d: `M 50 62 L 28 ${BEAM_FLOOR_Y} L 72 ${BEAM_FLOOR_Y} Z`, fill: "#ff006e" },
  { d: `M 75 62 L 53 ${BEAM_FLOOR_Y} L 97 ${BEAM_FLOOR_Y} Z`, fill: "#fb5607" },
  { d: `M 100 62 L 78 ${BEAM_FLOOR_Y} L 122 ${BEAM_FLOOR_Y} Z`, fill: "#ffbe0b" },
  { d: `M 125 62 L 103 ${BEAM_FLOOR_Y} L 147 ${BEAM_FLOOR_Y} Z`, fill: "#3a86ff" },
  { d: `M 150 62 L 128 ${BEAM_FLOOR_Y} L 172 ${BEAM_FLOOR_Y} Z`, fill: "#8338ec" },
] as const;
const COLORS = ["#ff006e", "#fb5607", "#ffbe0b", "#3a86ff", "#8338ec"] as const;
const IDLE_BEAM_OPACITY = [0.15, 0.15, 0.2, 0.15, 0.15] as const;

const STEP = 0.2;
const MIN_S = 0.2;

/**
 * Continuous “rider” curve: peak follows `focus`; each neighbour is 20% dimmer,
 * interpolated smoothly as `focus` moves (no stepped lampFalloff).
 * At focus=0: 100%, 80%, 60%, 40%, 20%.
 */
function linearRampStrengths(focus: number): number[] {
  const f = Math.min(4, Math.max(0, focus));
  return LIGHT_X.map((_, i) => {
    const v = 1 - STEP * Math.abs(i - f);
    return Math.max(MIN_S, Math.min(1, v));
  });
}

function focusIndexFromScreenX(clientX: number, width: number): number {
  if (width <= 0) return 2;
  const t = Math.min(1, Math.max(0, clientX / width));
  return t * 4;
}

const VIEWBOX_DEFAULT = { x: 0, y: 0, w: 200, h: 200 } as const;
const VIEWBOX_SIDEBAR = { x: 0, y: 36, w: 200, h: 146 } as const;

type OrdoStageLogoProps = {
  className?: string;
  size?: number;
  interactive?: boolean;
  variant?: "default" | "sidebar";
};

/** Static wordmark in its own memoized SVG so rAF beam updates never repaint the type. */
const OrdoStageWordmark = memo(function OrdoStageWordmark({
  gradId,
  viewBoxAttr,
}: {
  gradId: string;
  viewBoxAttr: string;
}) {
  return (
    <svg
      viewBox={viewBoxAttr}
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="geometricPrecision"
      className="pointer-events-none absolute inset-0 z-[2] h-full w-full select-none opacity-100 [opacity:1!important]"
      style={{ opacity: 1, isolation: "isolate" }}
      overflow="visible"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ff006e" stopOpacity={1} />
          <stop offset="25%" stopColor="#fb5607" stopOpacity={1} />
          <stop offset="50%" stopColor="#ffbe0b" stopOpacity={1} />
          <stop offset="75%" stopColor="#3a86ff" stopOpacity={1} />
          <stop offset="100%" stopColor="#8338ec" stopOpacity={1} />
        </linearGradient>
      </defs>
      <text
        x="100"
        y="120"
        fontFamily="Arial Black, Helvetica, sans-serif"
        fontSize="48"
        fontWeight="900"
        fill={`url(#${gradId})`}
        fillOpacity={1}
        stroke="#ffffff"
        strokeWidth={1.45}
        strokeOpacity={1}
        strokeLinejoin="round"
        strokeLinecap="round"
        textAnchor="middle"
        textRendering="geometricPrecision"
        style={{
          opacity: 1,
          paintOrder: "stroke fill",
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
        fillOpacity={1}
        stroke="#ffffff"
        strokeWidth={1.05}
        strokeOpacity={1}
        strokeLinejoin="round"
        strokeLinecap="round"
        textAnchor="middle"
        textRendering="geometricPrecision"
        style={{
          opacity: 1,
          paintOrder: "stroke fill",
        }}
      >
        STAGE
      </text>
    </svg>
  );
});

type BeamRigProps = {
  interactive: boolean;
  viewBoxAttr: string;
};

/** Rig + beams only — state updates here do not touch the memoized wordmark. */
function OrdoStageBeamRig({ interactive, viewBoxAttr }: BeamRigProps) {
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
      const alpha = 0.11;
      let next = prev + (tgt - prev) * alpha;
      if (Math.abs(tgt - next) < 0.0005) next = tgt;
      smoothFocusRef.current = next;
      setSmoothFocus(next);
      if (Math.abs(tgt - next) > 0.0012) {
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
    return linearRampStrengths(smoothFocus);
  }, [interactive, smoothFocus]);

  return (
    <svg
      viewBox={viewBoxAttr}
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
      overflow="visible"
    >
      <title>OrdoStage</title>
      <rect width="200" height="200" fill="#111111" />

      <rect x="30" y="50" width="140" height="12" fill="#333" rx="2" />

      {LIGHT_X.map((cx, i) => {
        const s = interactive ? strengths[i] ?? 0 : 0;
        const t = (s - MIN_S) / (1 - MIN_S);
        const glow = 0.58 + Math.max(0, Math.min(1, t)) * 0.42;
        return (
          <circle
            key={cx}
            cx={cx}
            cy="56"
            r="6"
            fill={COLORS[i]}
            style={{
              opacity: glow,
              filter:
                s > MIN_S + 0.02
                  ? `drop-shadow(0 0 ${2 + ((s - MIN_S) / (1 - MIN_S)) * 12}px ${COLORS[i]})`
                  : undefined,
              willChange: "opacity",
            }}
          />
        );
      })}

      {BEAMS.map((beam, i) => {
        const s = interactive ? strengths[i] ?? 0 : 0;
        const opacity = interactive ? s : IDLE_BEAM_OPACITY[i];
        return (
          <path
            key={beam.d}
            d={beam.d}
            fill={beam.fill}
            style={{
              opacity,
              willChange: "opacity",
            }}
          />
        );
      })}
    </svg>
  );
}

export function OrdoStageLogo({
  className,
  size = 48,
  interactive = true,
  variant = "default",
}: OrdoStageLogoProps) {
  const vb = variant === "sidebar" ? VIEWBOX_SIDEBAR : VIEWBOX_DEFAULT;
  const uid = useId();
  const gradId = `${uid}-textGrad`;
  const viewBoxAttr = useMemo(
    () => `${vb.x} ${vb.y} ${vb.w} ${vb.h}`,
    [vb],
  );

  const wrapperStyle: CSSProperties =
    variant === "sidebar"
      ? { aspectRatio: `${vb.w} / ${vb.h}` }
      : { width: size, height: size };

  return (
    <div
      className={cn(
        "relative inline-block max-w-full",
        variant === "sidebar" ? "w-full min-w-0" : "shrink-0",
        interactive && "pointer-events-none",
        className,
      )}
      style={wrapperStyle}
    >
      <OrdoStageBeamRig interactive={interactive} viewBoxAttr={viewBoxAttr} />
      <OrdoStageWordmark gradId={gradId} viewBoxAttr={viewBoxAttr} />
    </div>
  );
}
