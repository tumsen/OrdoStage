import { DateTime } from "luxon";
import type {
  LeaveBalanceSummary,
  OrganizationLeavePolicyData,
  PersonLeaveProfileData,
  ResolvedLeaveNorms,
  VacationYear,
} from "./types";

const DEFAULT_WEEKLY_HOURS = 37;

export function hoursPerWorkDayFromWeekly(weeklyHours: number | null | undefined): number {
  if (weeklyHours != null && weeklyHours > 0) return weeklyHours / 5;
  return DEFAULT_WEEKLY_HOURS / 5;
}

/** Whole-minute duration for one leave day (weekly ÷ 5). Prefer this over hours×60 float. */
export function workDayDurationMinutes(weeklyHours: number | null | undefined): number {
  const weekly = weeklyHours != null && weeklyHours > 0 ? weeklyHours : DEFAULT_WEEKLY_HOURS;
  return Math.round((weekly * 60) / 5);
}

/** Day length in minutes from hours/day (e.g. 7.4 → 444), avoiding float drift. */
export function workDayDurationMinutesFromHoursPerDay(hoursPerDay: number): number {
  if (!(hoursPerDay > 0)) return 0;
  // Classic 37h/5: use integer path when hours match the default fifth.
  const defaultDay = workDayDurationMinutes(DEFAULT_WEEKLY_HOURS);
  if (Math.abs(hoursPerDay * 60 - defaultDay) < 0.5) return defaultDay;
  return Math.round(hoursPerDay * 60);
}

/**
 * Convert leave minutes → days.
 * Exact (or near-exact) full work days stay whole numbers — no 4.03 for 4×7:24.
 * Decimals only when a true partial day remains.
 */
export function minutesToLeaveDaysFromDayMin(minutes: number, dayMin: number): number {
  if (!(dayMin > 0) || !Number.isFinite(minutes)) return 0;
  const sign = minutes < 0 ? -1 : 1;
  const abs = Math.round(Math.abs(minutes));
  if (abs === 0) return 0;

  if (abs % dayMin === 0) return sign * (abs / dayMin);

  const whole = Math.floor(abs / dayMin);
  const rem = abs - whole * dayMin;
  // ≤1 min drift per counted day (ISO/clock rounding) → still whole days
  if (whole > 0 && rem <= whole) return sign * whole;
  if (whole >= 0 && dayMin - rem <= Math.max(1, whole)) return sign * (whole + 1);

  // Near-whole totals (e.g. 4×447 vs 4×444) when clearly not a partial-day registration
  const raw = abs / dayMin;
  const frac = raw - whole;
  if (whole >= 1 && frac < 0.05) return sign * whole;
  if (whole >= 1 && frac > 0.95) return sign * (whole + 1);

  const partial = Math.round((rem / dayMin) * 100) / 100;
  if (partial >= 1) return sign * (whole + 1);
  if (partial <= 0) return sign * whole;
  return sign * (whole + partial);
}

/**
 * Overtime vs prorated contract minutes.
 * When `includeLeaveInNorm` is true (Danish leave module): work + vacation +
 * feriefridage + holidays fulfill the weekly/period norm (e.g. 37h).
 * When false: classic work-only overtime.
 *
 * Returns signed minutes (positive = over norm, negative = under). Callers that
 * mean “overtime pay” should clamp with Math.max(0, …).
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

/** Positive overtime only (hours above the period norm). Under-time is 0. */
export function positiveOvertimeMinutes(
  parts: Parameters<typeof overtimeAgainstContract>[0],
  contractMinutes: number | null | undefined,
  opts?: { includeLeaveInNorm?: boolean }
): number | null {
  const delta = overtimeAgainstContract(parts, contractMinutes, opts);
  if (delta == null) return null;
  return Math.max(0, delta);
}

export function resolveVacationYear(
  date: Date,
  policy: Pick<OrganizationLeavePolicyData, "vacationYearStartMonth" | "vacationYearStartDay">
): VacationYear {
  const month = policy.vacationYearStartMonth;
  const day = policy.vacationYearStartDay;
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const inCurrentYear =
    m > month || (m === month && d >= day);
  const startYear = inCurrentYear ? y : y - 1;
  const endYear = startYear + 1;
  const start = new Date(startYear, month - 1, day);
  const end = new Date(endYear, month - 1, day);
  end.setMilliseconds(end.getMilliseconds() - 1);
  const key = `${startYear}-${endYear}`;
  return { key, start, end };
}

/** Next ferieår after `year` (e.g. 2025-2026 → 2026-2027). */
export function resolveNextVacationYear(
  year: VacationYear,
  policy: Pick<OrganizationLeavePolicyData, "vacationYearStartMonth" | "vacationYearStartDay">
): VacationYear {
  return resolveVacationYear(new Date(year.end.getTime() + 1), policy);
}

export function resolveLeaveNorms(
  policy: OrganizationLeavePolicyData,
  profile: PersonLeaveProfileData | null,
  personFallback?: { weeklyContractHours?: number | null; vacationDaysPerYear?: number | null }
): ResolvedLeaveNorms {
  const useOrg = profile?.useOrgDefaults !== false;
  const weekly =
    (!useOrg && profile?.weeklyContractHours != null
      ? profile.weeklyContractHours
      : null) ??
    personFallback?.weeklyContractHours ??
  policy.defaultWeeklyContractHours ??
    DEFAULT_WEEKLY_HOURS;

  const vacationDaysPerYear =
    (!useOrg && profile?.vacationDaysPerYear != null
      ? profile.vacationDaysPerYear
      : null) ??
    personFallback?.vacationDaysPerYear ??
    policy.defaultVacationDaysPerYear;

  const extraVacationDaysPerYear =
    (!useOrg && profile?.extraVacationDaysPerYear != null
      ? profile.extraVacationDaysPerYear
      : null) ?? policy.defaultExtraVacationDays;

  let hoursPerVacationDay: number;
  if (policy.hoursPerVacationDayMode === "fixed" && policy.hoursPerVacationDayFixed != null) {
    hoursPerVacationDay = policy.hoursPerVacationDayFixed;
  } else {
    hoursPerVacationDay = hoursPerWorkDayFromWeekly(weekly);
  }

  const monthlyContractHours =
    !useOrg && profile?.monthlyContractHours != null
      ? profile.monthlyContractHours
      : Math.round((weekly * 52) / 12 * 10) / 10;

  const annualContractHours =
    !useOrg && profile?.annualContractHours != null
      ? profile.annualContractHours
      : weekly * 52;

  return {
    weeklyContractHours: weekly,
    monthlyContractHours,
    annualContractHours,
    vacationDaysPerYear,
    extraVacationDaysPerYear,
    hoursPerVacationDay,
  };
}

/** Statutory rates for 25-day / 5-week entitlement (Ferieloven § 5 / BM samtidighedsferie). */
export const FERIELOVEN_DAYS_PER_MONTH = 2.08;
export const FERIELOVEN_DAYS_PER_CALENDAR_DAY = 0.07;

function vacationMonthlyRate(vacationDaysPerYear: number): number {
  // Ferieloven § 5: 2.08 for the statutory 25 days (5 weeks). Tolerate float from DB.
  if (Math.abs(vacationDaysPerYear - 25) < 0.01) return FERIELOVEN_DAYS_PER_MONTH;
  return Math.round((vacationDaysPerYear / 12) * 100) / 100;
}

function vacationDailyRate(vacationDaysPerYear: number): number {
  if (Math.abs(vacationDaysPerYear - 25) < 0.01) return FERIELOVEN_DAYS_PER_CALENDAR_DAY;
  const monthly = vacationMonthlyRate(vacationDaysPerYear);
  return Math.round((monthly / 30) * 100) / 100;
}

/**
 * Accrue paid vacation per Ferieloven § 5 (samtidighedsferie):
 * 2.08 days for each full month of employment in the ferieår (1 Sep–31 Aug),
 * or 0.07 day per calendar day in a partial month (max one month’s rate).
 * @see https://danskelove.dk/ferieloven/5
 * @see BM faktaark “Ny ferielov – hvad betyder det for mig?”
 */
export function accrueVacationEarnedDays(
  norms: ResolvedLeaveNorms,
  vacationYear: VacationYear,
  asOf: Date = new Date(),
  zone = "UTC"
): number {
  return accrueVacationEarnedDaysBetween(
    norms.vacationDaysPerYear,
    vacationYear.start,
    vacationYear.end,
    asOf,
    zone
  );
}

/**
 * Accrual for employment overlapping [rangeStart, asOf], clipped to rangeEndInclusive.
 * Pass an IANA `zone` so month boundaries match the client calendar (not the server’s).
 */
export function accrueVacationEarnedDaysBetween(
  vacationDaysPerYear: number,
  rangeStart: Date,
  rangeEndInclusive: Date,
  asOf: Date = new Date(),
  zone = "UTC"
): number {
  const monthly = vacationMonthlyRate(vacationDaysPerYear);
  const daily = vacationDailyRate(vacationDaysPerYear);

  const start = DateTime.fromJSDate(rangeStart, { zone }).startOf("day");
  const periodEnd = DateTime.fromJSDate(rangeEndInclusive, { zone }).startOf("day");
  let end = DateTime.fromJSDate(asOf, { zone }).startOf("day");
  if (end < start) return 0;
  if (end > periodEnd) end = periodEnd;

  // Exact calendar months in range → N × monthly (avoids timezone day-shift artifacts).
  if (
    start.day === 1 &&
    end.day === (end.daysInMonth ?? 0) &&
    start.hasSame(end, "month") &&
    start.hasSame(end, "year")
  ) {
    return monthly;
  }

  let earned = 0;
  let cursor = start.startOf("month");
  while (cursor <= end) {
    const monthStart = cursor.startOf("day");
    const monthEnd = cursor.endOf("month").startOf("day");
    const segStart = start > monthStart ? start : monthStart;
    const segEnd = end < monthEnd ? end : monthEnd;
    if (segEnd >= segStart) {
      const daysEmployed = Math.floor(segEnd.diff(segStart, "days").days) + 1;
      const daysInMonth = cursor.daysInMonth ?? 30;
      if (daysEmployed >= daysInMonth) {
        earned += monthly;
      } else {
        earned += Math.min(monthly, Math.round(daysEmployed * daily * 100) / 100);
      }
    }
    cursor = cursor.plus({ months: 1 }).startOf("month");
  }

  return Math.min(vacationDaysPerYear, Math.round(earned * 100) / 100);
}

/** Whole months (and partial ends) between two yyyy-MM-dd dates in a zone — for payroll periods. */
export function accrueVacationEarnedForDateRange(
  vacationDaysPerYear: number,
  fromYmd: string,
  toYmd: string,
  zone = "UTC"
): number {
  const start = DateTime.fromFormat(fromYmd, "yyyy-MM-dd", { zone }).startOf("day");
  const end = DateTime.fromFormat(toYmd, "yyyy-MM-dd", { zone }).startOf("day");
  if (!start.isValid || !end.isValid || end < start) return 0;
  return accrueVacationEarnedDaysBetween(
    vacationDaysPerYear,
    start.toJSDate(),
    end.toJSDate(),
    end.toJSDate(),
    zone
  );
}

export function minutesToVacationDays(minutes: number, hoursPerDay: number): number {
  const dayMin = workDayDurationMinutesFromHoursPerDay(hoursPerDay);
  return minutesToLeaveDaysFromDayMin(minutes, dayMin);
}

export function categoryToLeaveBalanceType(
  category: string
): "vacation_used" | "extra_vacation_used" | "comp_time_used" | "sick_days" | null {
  if (category === "vacation") return "vacation_used";
  if (category === "extra_vacation") return "extra_vacation_used";
  if (category === "comp_time") return "comp_time_used";
  if (category === "sick") return "sick_days";
  return null;
}

export function summarizeLeaveBalances(
  vacationYearKey: string,
  norms: ResolvedLeaveNorms,
  earnedDays: number,
  balances: Record<string, number>
): LeaveBalanceSummary {
  const vacationUsedDays = balances.vacation_used ?? 0;
  const extraUsed = balances.extra_vacation_used ?? 0;
  const compEarned = balances.comp_time_earned ?? 0;
  const compUsed = balances.comp_time_used ?? 0;
  const sickDays = balances.sick_days ?? 0;
  // Optjent = Ferieloven monthly accrual (passed in). Ledger vacation_earned is kept in sync.
  const earned = earnedDays;

  return {
    vacationYearKey,
    vacationEarnedDays: earned,
    vacationUsedDays: vacationUsedDays,
    vacationRemainingDays: Math.round((earned - vacationUsedDays) * 100) / 100,
    extraVacationAllowanceDays: norms.extraVacationDaysPerYear,
    extraVacationUsedDays: extraUsed,
    extraVacationRemainingDays:
      Math.round((norms.extraVacationDaysPerYear - extraUsed) * 100) / 100,
    compTimeEarnedMinutes: compEarned,
    compTimeUsedMinutes: compUsed,
    compTimeRemainingMinutes: Math.round((compEarned - compUsed) * 100) / 100,
    sickDays,
  };
}
