import type {
  LeaveBalanceSummary,
  OrganizationLeavePolicyData,
  PersonLeaveProfileData,
  ResolvedLeaveNorms,
  VacationYear,
} from "./types";

const DEFAULT_WEEKLY_HOURS = 37;

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
    hoursPerVacationDay = weekly / 5;
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

/** Pro-rate annual vacation allowance over months in the vacation year (≈2.08 days/month for 25 days). */
export function accrueVacationEarnedDays(
  norms: ResolvedLeaveNorms,
  vacationYear: VacationYear,
  asOf: Date = new Date()
): number {
  const totalMs = vacationYear.end.getTime() - vacationYear.start.getTime();
  const elapsedMs = Math.min(
    Math.max(asOf.getTime() - vacationYear.start.getTime(), 0),
    totalMs
  );
  const fraction = totalMs > 0 ? elapsedMs / totalMs : 0;
  return Math.round(norms.vacationDaysPerYear * fraction * 100) / 100;
}

export function minutesToVacationDays(minutes: number, hoursPerDay: number): number {
  if (hoursPerDay <= 0) return 0;
  return Math.round((minutes / 60 / hoursPerDay) * 100) / 100;
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
  const earned = balances.vacation_earned ?? earnedDays;

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
