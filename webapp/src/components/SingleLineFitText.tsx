import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

function fitFontSizePx(
  el: HTMLElement,
  available: number,
  minPx: number,
  maxPx: number
): number {
  if (available <= 0) return maxPx;
  el.style.fontSize = `${maxPx}px`;
  if (el.scrollWidth <= available) return maxPx;
  el.style.fontSize = `${minPx}px`;
  if (el.scrollWidth > available) return minPx;
  let lo = minPx;
  let hi = maxPx;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    el.style.fontSize = `${mid}px`;
    if (el.scrollWidth <= available) lo = mid;
    else hi = mid;
  }
  return lo;
}

type Props = {
  text: string;
  className?: string;
  minPx?: number;
  maxPx?: number;
};

export function SingleLineFitText({ text, className, minPx = 8, maxPx = 12 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(maxPx);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const el = measureRef.current;
    if (!container || !el) return;

    const run = () => {
      const available = container.clientWidth;
      const px = text.trim() === "" ? maxPx : fitFontSizePx(el, available, minPx, maxPx);
      el.style.removeProperty("font-size");
      setFontSize(px);
    };

    run();
    const ro = new ResizeObserver(run);
    ro.observe(container);
    return () => ro.disconnect();
  }, [text, minPx, maxPx]);

  return (
    <div ref={containerRef} className={cn("min-w-0 w-full overflow-hidden", className)}>
      <span
        ref={measureRef}
        className="inline-block whitespace-nowrap leading-snug"
        style={{ fontSize: `${fontSize}px` }}
      >
        {text}
      </span>
    </div>
  );
}
