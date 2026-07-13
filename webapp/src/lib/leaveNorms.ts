/** Danish default full-time week (37h → 7.4h / 7h 24m per vacation or sick day). */
export const DEFAULT_WEEKLY_CONTRACT_HOURS = 37;

/** Hours per vacation/sick day = weekly contract ÷ 5 (e.g. 37 → 7.4, 30 → 6). */
export function hoursPerWorkDayFromWeekly(weeklyHours: number | null | undefined): number {
  if (weeklyHours != null && weeklyHours > 0) return weeklyHours / 5;
  return DEFAULT_WEEKLY_CONTRACT_HOURS / 5;
}

/** Whole-minute duration for one vacation/sick day (avoids float drift in ISO timestamps). */
export function workDayDurationMinutes(weeklyHours: number | null | undefined): number {
  const weekly =
    weeklyHours != null && weeklyHours > 0 ? weeklyHours : DEFAULT_WEEKLY_CONTRACT_HOURS;
  return Math.round((weekly * 60) / 5);
}

export function formatWorkDayDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
