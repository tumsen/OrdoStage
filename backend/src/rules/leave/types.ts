export const LEAVE_BALANCE_TYPES = [
  "vacation_earned",
  "vacation_used",
  "extra_vacation_used",
  "comp_time_earned",
  "comp_time_used",
  "sick_days",
] as const;

export type LeaveBalanceType = (typeof LEAVE_BALANCE_TYPES)[number];

export const LEAVE_TRANSACTION_SOURCES = [
  "time_entry",
  "overtime_accrual",
  "manual_adjustment",
  "opening_balance",
  "reversal",
] as const;

export type LeaveTransactionSource = (typeof LEAVE_TRANSACTION_SOURCES)[number];

export type OrganizationLeavePolicyData = {
  countryCode: string;
  vacationYearStartMonth: number;
  vacationYearStartDay: number;
  defaultVacationDaysPerYear: number;
  defaultExtraVacationDays: number;
  defaultWeeklyContractHours: number;
  hoursPerVacationDayMode: string;
  hoursPerVacationDayFixed: number | null;
  compTimeFromOvertimeEnabled: boolean;
};

export type PersonLeaveProfileData = {
  leaveCountryCode: string;
  useOrgDefaults: boolean;
  weeklyContractHours: number | null;
  monthlyContractHours: number | null;
  annualContractHours: number | null;
  vacationDaysPerYear: number | null;
  extraVacationDaysPerYear: number | null;
  sickLeaveStatus: string;
  sickLeaveNote: string | null;
};

export type ResolvedLeaveNorms = {
  weeklyContractHours: number;
  monthlyContractHours: number | null;
  annualContractHours: number | null;
  vacationDaysPerYear: number;
  extraVacationDaysPerYear: number;
  hoursPerVacationDay: number;
};

export type VacationYear = {
  key: string;
  start: Date;
  end: Date;
};

export type LeaveBalanceSummary = {
  vacationYearKey: string;
  vacationEarnedDays: number;
  vacationUsedDays: number;
  vacationRemainingDays: number;
  extraVacationAllowanceDays: number;
  extraVacationUsedDays: number;
  extraVacationRemainingDays: number;
  compTimeEarnedMinutes: number;
  compTimeUsedMinutes: number;
  compTimeRemainingMinutes: number;
  sickDays: number;
};
