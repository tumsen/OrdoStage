import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const WIDTH_EPS = 0.75;

/** Extra zoom so short lines are not stuck at maxPx (still respects column width). */
const VISUAL_SHRINK = 0.78;

type Props = {
  text: string;
  className?: string;
  /** Largest font size (px) when the line is short. */
  maxPx?: number;
  /** Smallest font size (px) to try before applying zoom squeeze. */
  minPx?: number;
  fitWidth?: number;
};

/**
 * Find largest font size in [minPx, maxPx] such that scrollWidth <= cap (binary search).
 */
function fitFontBinary(
  el: HTMLElement,
  cap: number,
  minPx: number,
  maxPx: number
): number {
  el.style.fontSize = `${maxPx}px`;
  if (el.scrollWidth <= cap) return maxPx;
  el.style.fontSize = `${minPx}px`;
  if (el.scrollWidth > cap) return minPx;
  let lo = minPx;
  let hi = maxPx;
  for (let i = 0; i < 36; i++) {
    const mid = (lo + hi) / 2;
    el.style.fontSize = `${mid}px`;
    if (el.scrollWidth <= cap) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function SingleLineFitText({
  text,
  className,
  minPx = 1.5,
  maxPx = 4,
  fitWidth,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(maxPx);
  const [zoomSqueeze, setZoomSqueeze] = useState(1);
  const rafAttemptsRef = useRef(0);

  useLayoutEffect(() => {
    rafAttemptsRef.current = 0;
    const container = containerRef.current;
    const el = measureRef.current;
    if (!container || !el) return;

    const readLocalWidth = () => {
      const cw = container.clientWidth;
      if (cw > 1) return cw;
      const rw = container.getBoundingClientRect().width;
      return rw > 1 ? rw : 0;
    };

    const run = () => {
      const fromParent =
        fitWidth != null && Number.isFinite(fitWidth) && fitWidth > 1 ? fitWidth : 0;
      const available = fromParent > 0 ? fromParent : readLocalWidth();

      if (available <= 1) {
        if (rafAttemptsRef.current < 24) {
          rafAttemptsRef.current += 1;
          requestAnimationFrame(() => requestAnimationFrame(run));
        } else {
          rafAttemptsRef.current = 0;
          setFontSize(minPx);
          setZoomSqueeze(1);
        }
        return;
      }
      rafAttemptsRef.current = 0;

      const cap = Math.max(0, available - WIDTH_EPS);

      if (text.trim() === "") {
        el.style.removeProperty("font-size");
        setFontSize(maxPx);
        setZoomSqueeze(1);
        return;
      }

      const px = fitFontBinary(el, cap, minPx, maxPx);
      el.style.fontSize = `${px}px`;

      const sw = Math.max(el.scrollWidth, 1);
      let z = 1;
      if (sw > cap && cap > 0) {
        z = cap / sw;
      }
      // Always apply a modest zoom so “fits at maxPx” lines are not visually huge.
      z = Math.min(z * VISUAL_SHRINK, cap / sw);
      el.style.removeProperty("font-size");

      setFontSize(px);
      setZoomSqueeze(z);
    };

    run();
    const ro = new ResizeObserver(() => run());
    ro.observe(container);
    void document.fonts?.ready?.then(run);
    return () => ro.disconnect();
  }, [text, minPx, maxPx, fitWidth]);

  return (
    <div
      ref={containerRef}
      className={cn("min-w-0 w-full max-w-full overflow-hidden box-border", className)}
    >
      <span
        ref={measureRef}
        className="inline-block max-w-none whitespace-nowrap leading-none tracking-tight"
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: 1.15,
          // Second pass when browser minimum font-size prevents shrinking far enough:
          zoom: zoomSqueeze,
        }}
      >
        {text}
      </span>
    </div>
  );
}
