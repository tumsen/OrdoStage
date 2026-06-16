/** SKAT meal reductions for tax-free travel allowance (kostgodtgørelse / diæter). */

export const SKAT_MEAL_REDUCTION_PCT = {
  breakfast: 0.15,
  lunch: 0.3,
  dinner: 0.3,
  maxPerDay: 0.75,
} as const;

export const SKAT_TRAVEL_ALLOWANCE_URL =
  "https://skat.dk/borger/fradrag/arbejdsrelaterede-fradrag/rejsefradrag-godtgoerelse-kost-og-logi/skattefri-rejsegodtgoerelse-diaeter";

export type MealFlags = {
  breakfastProvided: boolean;
  lunchProvided: boolean;
  dinnerProvided: boolean;
};

export function foodRateCentsForYear(
  rateYear: number,
  allowanceType: "standard" | "tour_driver_denmark" | "tour_driver_abroad"
): number {
  const year = rateYear === 2025 ? 2025 : 2026;
  if (allowanceType === "tour_driver_denmark") return 7_500;
  if (allowanceType === "tour_driver_abroad") return 15_000;
  return year === 2025 ? 59_700 : 62_500;
}

export function mealReductionCentsForDay(foodRateCents: number, meals: MealFlags): number {
  const reductionPct = Math.min(
    SKAT_MEAL_REDUCTION_PCT.maxPerDay,
    (meals.breakfastProvided ? SKAT_MEAL_REDUCTION_PCT.breakfast : 0) +
      (meals.lunchProvided ? SKAT_MEAL_REDUCTION_PCT.lunch : 0) +
      (meals.dinnerProvided ? SKAT_MEAL_REDUCTION_PCT.dinner : 0)
  );
  return Math.round(foodRateCents * reductionPct);
}

export function mealReductionLabel(meals: MealFlags): string | null {
  const parts: string[] = [];
  if (meals.breakfastProvided) parts.push("breakfast −15%");
  if (meals.lunchProvided) parts.push("lunch −30%");
  if (meals.dinnerProvided) parts.push("dinner −30%");
  return parts.length > 0 ? parts.join(", ") : null;
}
