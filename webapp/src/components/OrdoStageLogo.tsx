import { memo, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

const LIGHT_X = [50, 75, 100, 125, 150] as const;
const BEAM_FLOOR_Y = 178;
const BEAM_TOP_Y = 62;
const BEAM_CURVE_DEPTH = 12;
const LAMP_RADIUS = 6;

const BEAMS = [
  { topX: 50, leftX: 28, rightX: 72, fill: "#ff006e" },
  { topX: 75, leftX: 53, rightX: 97, fill: "#fb5607" },
  { topX: 100, leftX: 78, rightX: 122, fill: "#ffbe0b" },
  { topX: 125, leftX: 103, rightX: 147, fill: "#3a86ff" },
  { topX: 150, leftX: 128, rightX: 172, fill: "#8338ec" },
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
  showBackdrop?: boolean;
};

/** Static wordmark in its own memoized SVG so rAF beam updates never repaint the type. */
const OrdoStageWordmark = memo(function OrdoStageWordmark({
  viewBoxAttr,
}: {
  viewBoxAttr: string;
}) {
  return (
    <svg
      viewBox={viewBoxAttr}
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="geometricPrecision"
      className="pointer-events-none absolute inset-0 z-[2] h-full w-full select-none"
      overflow="visible"
      aria-hidden
    >
      {/* Stroke-only: letter interiors stay transparent so beams (SVG below) show through. */}
      <text
        x={100}
        y={120}
        fontFamily="Arial Black, Helvetica, sans-serif"
        fontSize={48}
        fontWeight="900"
        fill="none"
        stroke="rgb(255, 255, 255)"
        strokeWidth={2.2}
        strokeOpacity={1}
        strokeLinejoin="round"
        strokeLinecap="round"
        textAnchor="middle"
        textRendering="geometricPrecision"
      >
        ORDO
      </text>
      <text
        x={100}
        y={155}
        fontFamily="Arial Black, Helvetica, sans-serif"
        fontSize={32}
        fontWeight="900"
        fill="none"
        stroke="rgb(255, 255, 255)"
        strokeWidth={1.65}
        strokeOpacity={1}
        strokeLinejoin="round"
        strokeLinecap="round"
        textAnchor="middle"
        textRendering="geometricPrecision"
      >
        STAGE
      </text>
    </svg>
  );
});

type BeamRigProps = {
  interactive: boolean;
  viewBoxAttr: string;
  showBackdrop: boolean;
};

/** Rig + beams only — state updates here do not touch the memoized wordmark. */
function OrdoStageBeamRig({ interactive, viewBoxAttr, showBackdrop }: BeamRigProps) {
  const gradientPrefix = useId().replace(/:/g, "");
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
      {showBackdrop ? <rect width="200" height="200" fill="#111111" /> : null}

      <rect x="30" y="50" width="140" height="12" fill="#333" rx="2" />

      <defs>
        {BEAMS.map((beam, i) => (
          <linearGradient
            key={`${gradientPrefix}-beam-grad-${i}`}
            id={`${gradientPrefix}-beam-grad-${i}`}
            x1={beam.topX}
            y1={BEAM_TOP_Y}
            x2={beam.topX}
            y2={BEAM_FLOOR_Y + BEAM_CURVE_DEPTH}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor={beam.fill} stopOpacity="0.2" />
            <stop offset="58%" stopColor={beam.fill} stopOpacity="0.52" />
            <stop offset="82%" stopColor={beam.fill} stopOpacity="0.74" />
            <stop offset="100%" stopColor={beam.fill} stopOpacity="0.56" />
          </linearGradient>
        ))}
      </defs>

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
        const topLeftX = beam.topX - LAMP_RADIUS;
        const topRightX = beam.topX + LAMP_RADIUS;
        const d = `M ${topLeftX} ${BEAM_TOP_Y} L ${beam.leftX} ${BEAM_FLOOR_Y} Q ${beam.topX} ${BEAM_FLOOR_Y + BEAM_CURVE_DEPTH} ${beam.rightX} ${BEAM_FLOOR_Y} L ${topRightX} ${BEAM_TOP_Y} Z`;
        const floorCurveD = `M ${beam.leftX} ${BEAM_FLOOR_Y} Q ${beam.topX} ${BEAM_FLOOR_Y + BEAM_CURVE_DEPTH} ${beam.rightX} ${BEAM_FLOOR_Y}`;
        const floorShadowOpacity = 0.08 + (interactive ? s * 0.1 : 0);
        return (
          <g key={`${beam.topX}-${beam.leftX}-${beam.rightX}`} style={{ opacity, willChange: "opacity" }}>
            <path d={d} fill={`url(#${gradientPrefix}-beam-grad-${i})`} />
            <path
              d={floorCurveD}
              fill="none"
              stroke={beam.fill}
              strokeWidth={2.2}
              strokeLinecap="round"
              style={{ mixBlendMode: "multiply", opacity: floorShadowOpacity }}
            />
          </g>
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
  showBackdrop = true,
}: OrdoStageLogoProps) {
  const vb = variant === "sidebar" ? VIEWBOX_SIDEBAR : VIEWBOX_DEFAULT;
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
      <OrdoStageBeamRig interactive={interactive} viewBoxAttr={viewBoxAttr} showBackdrop={showBackdrop} />
      <OrdoStageWordmark viewBoxAttr={viewBoxAttr} />
    </div>
  );
}
