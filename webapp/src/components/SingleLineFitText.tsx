import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Small slack avoids subpixel overflow when rounded widths barely exceed the box. */
const WIDTH_EPS = 1;

function fitFontSizePx(
  el: HTMLElement,
  available: number,
  minPx: number,
  maxPx: number
): number {
  const cap = Math.max(0, available - WIDTH_EPS);
  el.style.fontSize = `${maxPx}px`;
  if (el.scrollWidth <= cap) {
    return maxPx;
  }
  el.style.fontSize = `${minPx}px`;
  if (el.scrollWidth > cap) {
    el.style.fontSize = `${minPx}px`;
    return minPx;
  }
  let lo = minPx;
  let hi = maxPx;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    el.style.fontSize = `${mid}px`;
    if (el.scrollWidth <= cap) lo = mid;
    else hi = mid;
  }
  el.style.fontSize = `${lo}px`;
  return lo;
}

type Props = {
  text: string;
  className?: string;
  minPx?: number;
  maxPx?: number;
};

export function SingleLineFitText({ text, className, minPx = 6, maxPx = 10 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(minPx);
  const rafAttemptsRef = useRef(0);

  useLayoutEffect(() => {
    rafAttemptsRef.current = 0;
    const container = containerRef.current;
    const el = measureRef.current;
    if (!container || !el) return;

    const readAvailableWidth = () => {
      const cw = container.clientWidth;
      if (cw > 1) return cw;
      const rw = container.getBoundingClientRect().width;
      return rw > 1 ? rw : 0;
    };

    const run = () => {
      const available = readAvailableWidth();
      if (available <= 1) {
        if (rafAttemptsRef.current < 12) {
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

      const px =
        text.trim() === "" ? maxPx : fitFontSizePx(el, available, minPx, maxPx);
      el.style.removeProperty("font-size");
      setFontSize(px);
    };

    run();
    const ro = new ResizeObserver(() => run());
    ro.observe(container);
    const onFonts = () => run();
    void document.fonts?.ready?.then(onFonts);
    return () => ro.disconnect();
  }, [text, minPx, maxPx]);

  return (
    <div
      ref={containerRef}
      className={cn("min-w-0 w-full max-w-full overflow-hidden box-border", className)}
    >
      <span
        ref={measureRef}
        className="inline-block max-w-none whitespace-nowrap leading-snug"
        style={{ fontSize: `${fontSize}px` }}
      >
        {text}
      </span>
    </div>
  );
}
