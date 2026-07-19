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

/**
 * Overtime vs prorated contract minutes.
 * When `includeLeaveInNorm` is true (DK leave module on): work + vacation +
 * feriefridage + holidays fulfill the weekly/period norm.
 * When false: classic work-only overtime.
 */
export function overtimeAgainstContract(
  parts: {
    workMinutes: number;
    vacationMinutes?: number;
    extraVacationMinutes?: number;
    holidayMinutes?: number;
  },
  contractMinutes: number | null | undefined,
  opts?: { includeLeaveInNorm?: boolean }
): number | null {
  if (contractMinutes == null) return null;
  if (opts?.includeLeaveInNorm) {
    const fulfilling =
      parts.workMinutes +
      (parts.vacationMinutes ?? 0) +
      (parts.extraVacationMinutes ?? 0) +
      (parts.holidayMinutes ?? 0);
    return fulfilling - contractMinutes;
  }
  return parts.workMinutes - contractMinutes;
}

export function formatWorkDayDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** True when a time entry spans a full contract work day (weekly ÷ 5). */
export function isFullWorkDayDuration(
  actualMinutes: number,
  workDayMinutes: number
): boolean {
  if (workDayMinutes <= 0) return false;
  return Math.abs(Math.round(actualMinutes) - workDayMinutes) < 1;
}

/** Clamp leave-day duration to 1 minute … daily norm (weekly ÷ 5). */
export function clampDayOffDurationMinutes(
  minutes: number,
  workDayMinutes: number
): number {
  const max = workDayMinutes > 0 ? workDayMinutes : Math.max(1, Math.round(minutes));
  return Math.min(max, Math.max(1, Math.round(minutes)));
}

export function durationMinutesToHm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function durationHmToMinutes(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}
