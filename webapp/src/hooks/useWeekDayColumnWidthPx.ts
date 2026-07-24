import { useEffect, useState } from "react";
import {
  WEEK_GRID_DAY_COL_AT_MIN_PX,
  WEEK_GRID_MIN_CONTENT_WIDTH_PX,
  WEEK_GRID_TIME_GUTTER_PX,
} from "@/lib/weekGridColumns";

/** Sidebar width (`16rem`) — matches `SIDEBAR_WIDTH` in `sidebar.tsx`. */
const SIDEBAR_WIDTH_PX = 256;
/** Rough chrome around the week grid (page padding + calendar panel inset). */
const WEEK_GRID_CHROME_PX = 96;

function estimateWeekDayColumnWidthPx(): number {
  if (typeof window === "undefined") return WEEK_GRID_DAY_COL_AT_MIN_PX;
  const content = Math.max(
    WEEK_GRID_MIN_CONTENT_WIDTH_PX,
    window.innerWidth - SIDEBAR_WIDTH_PX - WEEK_GRID_CHROME_PX
  );
  return Math.max(
    WEEK_GRID_DAY_COL_AT_MIN_PX,
    Math.floor((content - WEEK_GRID_TIME_GUTTER_PX) / 7)
  );
}

function readLiveWeekDayColumnWidthPx(): number | null {
  const el = document.querySelector<HTMLElement>("[data-day-col]");
  if (!el) return null;
  const w = el.getBoundingClientRect().width;
  return w >= 40 ? Math.round(w) : null;
}

/**
 * Width of one week-view day column. Prefers a live `[data-day-col]` measurement;
 * otherwise uses the same `(content − gutter) / 7` split as the week grid.
 */
export function useWeekDayColumnWidthPx(active = true): number {
  const [widthPx, setWidthPx] = useState(estimateWeekDayColumnWidthPx);

  useEffect(() => {
    if (!active) return;

    const sync = () => {
      setWidthPx(readLiveWeekDayColumnWidthPx() ?? estimateWeekDayColumnWidthPx());
    };

    sync();
    window.addEventListener("resize", sync);

    const col = document.querySelector<HTMLElement>("[data-day-col]");
    const ro = col ? new ResizeObserver(sync) : null;
    if (col && ro) ro.observe(col);

    // Re-check shortly after open — week columns may appear after mode/layout settles.
    const t1 = window.setTimeout(sync, 50);
    const t2 = window.setTimeout(sync, 250);

    return () => {
      window.removeEventListener("resize", sync);
      ro?.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [active]);

  return widthPx;
}
