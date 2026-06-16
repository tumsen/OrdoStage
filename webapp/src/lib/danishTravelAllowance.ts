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

/** Whole commenced hours of travel (matches backend calculation). */
export function travelDurationHours(startMs: number, endMs: number): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.ceil((endMs - startMs) / 3_600_000);
}

/** Diæt is prorated per 24 h; 26 h → 26/24 day units, not 2 full days. */
export function travelAllowanceDayUnits(hours: number): number {
  if (hours < 24) return 0;
  return hours / 24;
}

export function formatAllowanceDayUnits(units: number): string {
  return units.toLocaleString("da-DK", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function lodgingRateCentsForYear(rateYear: number): number {
  return rateYear === 2025 ? 25_600 : 26_800;
}

export function travelFullOvernightDays(startMs: number, endMs: number): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.floor((endMs - startMs) / 86_400_000);
}

function msOnCalendarDay(dayYmd: string, startsAt: Date, endsAt: Date): number {
  const [y, m, d] = dayYmd.split("-").map(Number);
  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
  const dayEnd = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  const start = Math.max(startsAt.getTime(), dayStart.getTime());
  const end = Math.min(endsAt.getTime(), dayEnd.getTime());
  return Math.max(0, end - start);
}

export type TravelDayLineInput = {
  date: string;
  breakfastProvided: boolean;
  lunchProvided: boolean;
  dinnerProvided: boolean;
  lodgingCovered: boolean;
  lodgingByReceipt: boolean;
};

export type TravelLinePayout = {
  date: string;
  hoursOnDay: number;
  foodGrossCents: number;
  mealReductionCents: number;
  foodNetCents: number;
  lodgingCents: number;
  payoutCents: number;
};

export function computeTravelLinePayouts(params: {
  startsAt: Date;
  endsAt: Date;
  dayLines: TravelDayLineInput[];
  allowanceType: "standard" | "tour_driver_denmark" | "tour_driver_abroad";
  rateYear?: number;
  foodCoveredByReceipts: boolean;
  lodgingAllowance: boolean;
  lodgingByReceipt: boolean;
  transportsPeopleOrGoods: boolean;
}): TravelLinePayout[] {
  const year = params.rateYear ?? 2026;
  const foodRate = foodRateCentsForYear(year, params.allowanceType);
  const lodgingRate = lodgingRateCentsForYear(year);
  const startMs = params.startsAt.getTime();
  const endMs = params.endsAt.getTime();
  const totalMs = endMs - startMs;
  const totalHours = travelDurationHours(startMs, endMs);

  if (totalHours < 24 || totalMs <= 0) {
    return params.dayLines.map((line) => ({
      date: line.date,
      hoursOnDay: 0,
      foodGrossCents: 0,
      mealReductionCents: 0,
      foodNetCents: 0,
      lodgingCents: 0,
      payoutCents: 0,
    }));
  }

  const totalFoodGross = params.foodCoveredByReceipts
    ? Math.round(((foodRate * totalHours) / 24) * 0.25)
    : Math.round((foodRate * totalHours) / 24);

  const segments = params.dayLines.map((line) => ({
    line,
    ms: msOnCalendarDay(line.date, params.startsAt, params.endsAt),
  }));

  const fullDays = travelFullOvernightDays(startMs, endMs);
  const lodgingEligible =
    params.allowanceType === "standard" &&
    !params.transportsPeopleOrGoods &&
    !params.lodgingByReceipt &&
    params.lodgingAllowance;
  const showMealReductions = params.allowanceType === "standard" && !params.foodCoveredByReceipts;

  let allocatedFood = 0;
  return segments.map(({ line, ms }, index) => {
    const hoursOnDay = ms > 0 ? Math.ceil(ms / 3_600_000) : 0;
    const foodGrossCents =
      index === segments.length - 1
        ? totalFoodGross - allocatedFood
        : Math.round((ms / totalMs) * totalFoodGross);
    allocatedFood += foodGrossCents;

    const mealReductionCents = showMealReductions ? mealReductionCentsForDay(foodRate, line) : 0;
    const foodNetCents = Math.max(0, foodGrossCents - mealReductionCents);
    const lodgingCents =
      lodgingEligible && index < fullDays && !line.lodgingCovered && !line.lodgingByReceipt
        ? lodgingRate
        : 0;

    return {
      date: line.date,
      hoursOnDay,
      foodGrossCents,
      mealReductionCents,
      foodNetCents,
      lodgingCents,
      payoutCents: foodNetCents + lodgingCents,
    };
  });
}

export function formatMoneyDkk(cents: number): string {
  return `${(cents / 100).toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.`;
}
