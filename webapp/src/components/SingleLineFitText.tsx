import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  className?: string;
  /** Try these bounds; binary search picks the largest size that fits the container. */
  maxPx?: number;
  minPx?: number;
};

/**
 * One line of text that shrinks to fit its container width (the flex column beside the avatar).
 * No parent-supplied width — uses this element’s own layout box.
 */
export function SingleLineFitText({ text, className, minPx = 5, maxPx = 9 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const [fontPx, setFontPx] = useState(maxPx);
  const [zoom, setZoom] = useState(1);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const line = lineRef.current;
    if (!wrap || !line) return;

    const fit = () => {
      const w = wrap.clientWidth;
      if (w < 2) return;

      const cap = w - 0.5;
      if (!text.trim()) {
        setFontPx(maxPx);
        setZoom(1);
        return;
      }

      line.style.fontSize = `${maxPx}px`;
      if (line.scrollWidth <= cap) {
        line.style.removeProperty("font-size");
        setFontPx(maxPx);
        setZoom(1);
        return;
      }

      line.style.fontSize = `${minPx}px`;
      const swAtMin = line.scrollWidth;
      if (swAtMin > cap) {
        line.style.removeProperty("font-size");
        setFontPx(minPx);
        setZoom(cap / Math.max(swAtMin, 1));
        return;
      }

      let lo = minPx;
      let hi = maxPx;
      for (let i = 0; i < 36; i++) {
        const mid = (lo + hi) / 2;
        line.style.fontSize = `${mid}px`;
        if (line.scrollWidth <= cap) lo = mid;
        else hi = mid;
      }

      line.style.fontSize = `${lo}px`;
      let z = 1;
      if (line.scrollWidth > cap) z = cap / line.scrollWidth;
      line.style.removeProperty("font-size");
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
        style={{ fontSize: `${fontPx}px`, zoom }}
      >
        {text}
      </span>
    </div>
  );
}
