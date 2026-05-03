import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  className?: string;
  minPx?: number;
  maxPx?: number;
};

/**
 * One line: pick the largest font in [minPx, maxPx] that fits; if the engine
 * still won’t shrink enough (min font, etc.), apply CSS zoom to fit the slot.
 * Container must be in a flex child with `min-w-0` so width is real.
 */
export function SidebarOneLineText({
  text,
  className,
  minPx = 3,
  maxPx = 12,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const [fontPx, setFontPx] = useState(maxPx);
  const [zoom, setZoom] = useState(1);
  const rafTries = useRef(0);

  useLayoutEffect(() => {
    rafTries.current = 0;
    const wrap = wrapRef.current;
    const el = lineRef.current;
    if (!wrap || !el) return;

    const fit = () => {
      const cap = wrap.clientWidth - 0.5;
      if (cap < 2) {
        if (rafTries.current < 24) {
          rafTries.current += 1;
          requestAnimationFrame(() => requestAnimationFrame(fit));
        }
        return;
      }
      rafTries.current = 0;

      if (!text.trim()) {
        setFontPx(maxPx);
        setZoom(1);
        return;
      }

      el.style.fontSize = `${maxPx}px`;
      if (el.scrollWidth <= cap) {
        el.style.removeProperty("font-size");
        setFontPx(maxPx);
        setZoom(1);
        return;
      }

      el.style.fontSize = `${minPx}px`;
      const atMin = el.scrollWidth;
      if (atMin > cap) {
        el.style.removeProperty("font-size");
        setFontPx(minPx);
        setZoom(cap / Math.max(atMin, 1));
        return;
      }

      let lo = minPx;
      let hi = maxPx;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        el.style.fontSize = `${mid}px`;
        if (el.scrollWidth <= cap) lo = mid;
        else hi = mid;
      }
      el.style.fontSize = `${lo}px`;
      const sw = el.scrollWidth;
      const z = sw > cap ? cap / sw : 1;
      el.style.removeProperty("font-size");
      setFontPx(lo);
      setZoom(z);
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    void document.fonts?.ready?.then(fit);
    return () => ro.disconnect();
  }, [text, minPx, maxPx]);

  return (
    <div ref={wrapRef} className="min-w-0 w-full overflow-hidden">
      <span
        ref={lineRef}
        className={cn("inline-block max-w-none whitespace-nowrap leading-tight", className)}
        style={{ fontSize: `${fontPx}px`, lineHeight: 1.2, zoom }}
      >
        {text}
      </span>
    </div>
  );
}
