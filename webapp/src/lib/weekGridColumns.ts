/**
 * Shared week-grid helpers used by venue booking (`OutlookTimeGrid`) and time tracking (`TimeTracking`).
 * Keep column hit-testing in one place so horizontal drag behaviour stays consistent app-wide.
 */

/** Minimum pointer movement before a create/move gesture counts as a drag (not a click). */
export const WEEK_GRID_MIN_DRAG_PX = 8;

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
