import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Small slack so rounded widths do not clip the last pixel. */
const WIDTH_EPS = 0.5;

/** Measure at this size, then scale down with font-size = REF_PX * min(1, available / width). */
const REF_PX = 12;

type Props = {
  text: string;
  className?: string;
  minPx?: number;
  maxPx?: number;
  /**
   * Width of the text column in px (e.g. sidebar row minus avatar), from a parent ResizeObserver.
   * When set, fitting uses this value instead of the inner container’s width.
   */
  fitWidth?: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Scales font size to fit `available` width: starts from REF_PX, applies linear scale, then clamps.
 */
function fitFontSizeToWidth(
  el: HTMLElement,
  available: number,
  minPx: number,
  maxPx: number,
  text: string
): number {
  if (text.trim() === "") return maxPx;
  const cap = Math.max(0, available - WIDTH_EPS);
  if (cap <= 0) return minPx;

  el.style.fontSize = `${REF_PX}px`;
  const textWidth = el.scrollWidth;
  if (textWidth <= 0) return maxPx;

  const scale = Math.min(1, cap / textWidth);
  let px = clamp(REF_PX * scale, minPx, maxPx);
  el.style.fontSize = `${px}px`;
  while (el.scrollWidth > cap && px > minPx + 0.01) {
    px = Math.max(minPx, px - 0.35);
    el.style.fontSize = `${px}px`;
  }
  return px;
}

export function SingleLineFitText({
  text,
  className,
  minPx = 3,
  maxPx = 6,
  fitWidth,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(minPx);
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
        if (rafAttemptsRef.current < 20) {
          rafAttemptsRef.current += 1;
          requestAnimationFrame(() => {
            requestAnimationFrame(run);
          });
        } else {
          rafAttemptsRef.current = 0;
          setFontSize(minPx);
        }
        return;
      }
      rafAttemptsRef.current = 0;

      const px = fitFontSizeToWidth(el, available, minPx, maxPx, text);
      el.style.removeProperty("font-size");
      setFontSize(px);
    };

    run();
    const ro = new ResizeObserver(() => run());
    ro.observe(container);
    const onFonts = () => run();
    void document.fonts?.ready?.then(onFonts);
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
        style={{ fontSize: `${fontSize}px`, lineHeight: 1.15 }}
      >
        {text}
      </span>
    </div>
  );
}
