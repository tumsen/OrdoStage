import type { TimeCategory } from "@/contracts/backendTypes";

/** Keys under `time.*` for `useI18n` (avoids wrong keys for `travel_allowance`). */
const TIME_CATEGORY_MSG: Record<TimeCategory, string> = {
  work: "categoryWork",
  vacation: "categoryVacation",
  sick: "categorySick",
  holiday: "categoryHoliday",
  travel_allowance: "categoryTravelAllowance",
};

export function timeCategoryMessageId(cat: TimeCategory): `time.${string}` {
  return `time.${TIME_CATEGORY_MSG[cat]}`;
}
