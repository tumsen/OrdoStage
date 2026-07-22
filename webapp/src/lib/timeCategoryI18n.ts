import type { TimeCategory } from "@/contracts/backendTypes";

/** Calendar blocks that do not count toward hour totals or leave saldo. */
export function isNonAccountingTimeCategory(cat: string): boolean {
  return (
    cat === "comp_time" ||
    cat === "comp_settlement_earned" ||
    cat === "comp_settlement_used"
  );
}

/** Week-approval settlement blocks (ledger already updated; display-only). */
export function isCompSettlementCategory(cat: string): cat is TimeCategory {
  return cat === "comp_settlement_earned" || cat === "comp_settlement_used";
}

/** Keys under `time.*` for `useI18n` (avoids wrong keys for `travel_allowance`). */
const TIME_CATEGORY_MSG: Record<TimeCategory, string> = {
  work: "categoryWork",
  vacation: "categoryVacation",
  extra_vacation: "categoryExtraVacation",
  comp_time: "categoryUnavailable",
  comp_settlement_earned: "categoryUnavailable",
  comp_settlement_used: "categoryUnavailable",
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

const LEAVE_SYSTEM_KEY_TO_CATEGORY: Record<string, TimeCategory> = {
  leave_vacation: "vacation",
  leave_extra_vacation: "extra_vacation",
  leave_sick: "sick",
  leave_holiday: "holiday",
  leave_comp_time: "comp_time",
};

/** Map Fravær system project (Ferie / Sygdom / …) → time category. */
export function leaveCategoryFromSystemKey(
  systemKey: string | null | undefined
): TimeCategory | null {
  if (!systemKey) return null;
  return LEAVE_SYSTEM_KEY_TO_CATEGORY[systemKey] ?? null;
}

export function timeCategoryMessageId(cat: TimeCategory): `time.${string}` {
  return `time.${TIME_CATEGORY_MSG[cat]}`;
}
