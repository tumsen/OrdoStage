import type { TimeCategory } from "@/contracts/backendTypes";

/** Keys under `time.*` for `useI18n` (avoids wrong keys for `travel_allowance`). */
const TIME_CATEGORY_MSG: Record<TimeCategory, string> = {
  work: "categoryWork",
  vacation: "categoryVacation",
  extra_vacation: "categoryExtraVacation",
  comp_time: "categoryCompTime",
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
  "comp_time",
] as const satisfies readonly TimeCategory[];

export function isLeaveAutoProjectCategory(cat: string): cat is TimeCategory {
  return (LEAVE_AUTO_PROJECT_CATEGORIES as readonly string[]).includes(cat);
}

export function isDayOffCategory(cat: string): cat is TimeCategory {
  return (DAY_OFF_CATEGORIES as string[]).includes(cat);
}

export function timeCategoryMessageId(cat: TimeCategory): `time.${string}` {
  return `time.${TIME_CATEGORY_MSG[cat]}`;
}
