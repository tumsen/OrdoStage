import type { TimeCategory } from "@/contracts/backendTypes";

/** Week-approval settlement blocks (ledger already updated; display-only). */
export function isCompSettlementCategory(cat: string): cat is TimeCategory {
  return cat === "comp_settlement_earned" || cat === "comp_settlement_used";
}

/** Keys under `time.*` for `useI18n` (avoids wrong keys for `travel_allowance`). */
const TIME_CATEGORY_MSG: Record<TimeCategory, string> = {
  work: "categoryWork",
  vacation: "categoryVacation",
  extra_vacation: "categoryExtraVacation",
  comp_time: "categoryCompTime",
  comp_settlement_earned: "categoryCompTime",
  comp_settlement_used: "categoryCompTime",
  sick: "categorySick",
  holiday: "categoryHoliday",
  travel_allowance: "categoryTravelAllowance",
};

export const DAY_OFF_CATEGORIES: TimeCategory[] = [
  "vacation",
  "extra_vacation",
  "comp_time",
  "sick",
  "holiday",
];

/** Leave types that always map to a system time project (not user-selectable). */
export const LEAVE_AUTO_PROJECT_CATEGORIES = [
  "vacation",
  "extra_vacation",
  "sick",
  "holiday",
  "comp_time",
] as const satisfies readonly TimeCategory[];

/** Vacation entries: no tags in the UI; project is the system leave_vacation project. */
export function isVacationNoteOnlyCategory(cat: string): boolean {
  return cat === "vacation";
}

export function isLeaveAutoProjectCategory(cat: string): cat is TimeCategory {
  return (LEAVE_AUTO_PROJECT_CATEGORIES as readonly string[]).includes(cat);
}

export function isDayOffCategory(cat: string): cat is TimeCategory {
  return (DAY_OFF_CATEGORIES as string[]).includes(cat);
}

/** Leave types shown as days in Tid totals (work/comp stay as hours). */
export const LEAVE_DAY_DISPLAY_CATEGORIES = [
  "vacation",
  "extra_vacation",
  "sick",
  "holiday",
] as const satisfies readonly TimeCategory[];

export function isLeaveDayDisplayCategory(cat: string): boolean {
  return (LEAVE_DAY_DISPLAY_CATEGORIES as readonly string[]).includes(cat);
}

export function timeCategoryMessageId(cat: TimeCategory): `time.${string}` {
  return `time.${TIME_CATEGORY_MSG[cat]}`;
}
