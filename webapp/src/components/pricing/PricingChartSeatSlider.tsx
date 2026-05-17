import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const THUMB_SIZE_PX = 16;

export type PricingChartPlotLayout = {
  trackLeft: number;
  trackWidth: number;
  thumbLeft: number;
};

function measurePlotLayout(container: HTMLElement): PricingChartPlotLayout | null {
  const svg = container.querySelector("svg.recharts-surface");
  const refLine = container.querySelector(".recharts-reference-line line");
  const clipRect = container.querySelector("clipPath rect");
  if (!svg || !refLine || !clipRect) return null;

  const lineX = parseFloat(refLine.getAttribute("x1") ?? "");
  const plotX = parseFloat(clipRect.getAttribute("x") ?? "");
  const plotW = parseFloat(clipRect.getAttribute("width") ?? "");
  const plotY = parseFloat(clipRect.getAttribute("y") ?? "");
  const plotH = parseFloat(clipRect.getAttribute("height") ?? "");
  if (![lineX, plotX, plotW, plotY, plotH].every(Number.isFinite)) return null;

  return {
    trackLeft: plotX,
    trackWidth: plotW,
    thumbLeft: lineX - plotX - THUMB_SIZE_PX / 2,
  };
}

function clampSeat(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

type Props = {
  users: number;
  min?: number;
  max: number;
  onChange: (users: number) => void;
  /** Re-run layout measure when chart data or axes change. */
  measureKey: string;
  className?: string;
  children: ReactNode;
};

export function PricingChartSeatSlider({
  users,
  min = 1,
  max,
  onChange,
  measureKey,
  className,
  children,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<PricingChartPlotLayout | null>(null);

  const remeasure = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    setLayout(measurePlotLayout(el));
  }, []);

  useLayoutEffect(() => {
    remeasure();
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(remeasure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [users, min, max, measureKey, remeasure]);

  const pickSeatFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || max <= min) return;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return;
      const t = (clientX - rect.left) / rect.width;
      onChange(clampSeat(min + t * (max - min), min, max));
    },
    [max, min, onChange],
  );

  const onTrackPointerDown = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>) => {
      ev.preventDefault();
      pickSeatFromClientX(ev.clientX);
      const onMove = (e: PointerEvent) => pickSeatFromClientX(e.clientX);
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [pickSeatFromClientX],
  );

  return (
    <div ref={wrapRef} className="w-full">
      <div className={cn("relative w-full", className)}>{children}</div>
      {layout ? (
        <div
          className="relative z-10 mt-2 touch-none"
          style={{
            marginLeft: layout.trackLeft,
            width: layout.trackWidth,
            height: THUMB_SIZE_PX,
          }}
        >
          <div
            ref={trackRef}
            id="seat-slider"
            role="slider"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={users}
            aria-label="Active users"
            tabIndex={0}
            className="relative h-2 w-full cursor-pointer rounded-full bg-white/10"
            onPointerDown={onTrackPointerDown}
            onKeyDown={(ev) => {
              if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") {
                ev.preventDefault();
                onChange(clampSeat(users - 1, min, max));
              } else if (ev.key === "ArrowRight" || ev.key === "ArrowUp") {
                ev.preventDefault();
                onChange(clampSeat(users + 1, min, max));
              }
            }}
          >
            <span
              className="pointer-events-none absolute top-1/2 block h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white/80 bg-ordo-magenta shadow-md"
              style={{ left: layout.thumbLeft }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
