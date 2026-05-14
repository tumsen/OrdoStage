/**
 * Shared week-grid helpers used by venue booking (`OutlookTimeGrid`) and time tracking (`TimeTracking`).
 * Keep column hit-testing in one place so horizontal drag behaviour stays consistent app-wide.
 */

/** Minimum pointer movement before a create/move gesture counts as a drag (not a click). */
export const WEEK_GRID_MIN_DRAG_PX = 8;

/** Pixel height per hour in week/day time grids — keep in sync across Schedule and Time. */
export const CALENDAR_PX_PER_HOUR = 36;

/** Space above the midnight grid line (matches `h-6` footer strip under 24:00). */
export const CALENDAR_TIME_GRID_TOP_PAD_PX = 24;

/** Sticky day header: frosted blur over grid content scrolling underneath (Schedule + Time week). */
export const CALENDAR_STICKY_HEADER_CHROME =
  "sticky top-0 z-30 bg-white/[0.07] backdrop-blur-md backdrop-saturate-150";

/**
 * Padded shell around the week/day grid — same panel as `Schedule.tsx` uses around
 * `OutlookTimeGrid` / other calendar views (single design with Time).
 */
export const CALENDAR_PANEL_SHELL_CLASS =
  "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl p-3 md:p-4";

/** Horizontal inset matching the shell’s `p-3 md:p-4` so content outside the shell (e.g. venue info) lines up with the grid border. */
export const CALENDAR_PANEL_SHELL_INSET_X_CLASS = "mx-3 md:mx-4";

/**
 * Fills the shell so the bordered scroller can use `min-h-0 flex-1` (matches schedule week wrapper).
 * Do not use `h-full` here — nested under flex + overflow it often resolves to 0 and hides the grid.
 */
export const CALENDAR_PANEL_FLEX_COLUMN_CLASS = "flex min-h-0 flex-1 flex-col";

/**
 * Bordered week/day scroller — same surface as `OutlookTimeGrid` root (`overflow-auto` + card chrome).
 */
export const CALENDAR_GRID_SCROLLER_CLASS =
  "min-h-0 flex-1 overflow-auto rounded-xl border border-white/10 bg-white/[0.02]";

/**
 * Which day column index contains `clientX` (based on each column’s bounding rect).
 * Falls back to `fallbackIndex` when the pointer is between columns or columns are missing.
 */
export function findColumnIndexAtX(
  columns: ReadonlyArray<HTMLElement | null>,
  clientX: number,
  fallbackIndex: number
): number {
  for (let i = 0; i < columns.length; i += 1) {
    const el = columns[i];
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (clientX >= r.left && clientX < r.right) return i;
  }
  if (columns.length === 0) return fallbackIndex;
  const firstEl = columns[0];
  const lastEl = columns[columns.length - 1];
  if (firstEl) {
    const r0 = firstEl.getBoundingClientRect();
    if (clientX < r0.left) return 0;
  }
  if (lastEl) {
    const rN = lastEl.getBoundingClientRect();
    if (clientX >= rN.right) return columns.length - 1;
  }
  return fallbackIndex;
}
