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

  const totalFoodGross = foodAllowanceGrossCents(totalHours, foodRate, params.foodCoveredByReceipts);

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

/** Gross kostgodtgørelse before meal reductions (SKAT: commenced hours ÷ 24 × døgnsats). */
export function foodAllowanceGrossCents(
  hours: number,
  foodRateCents: number,
  foodCoveredByReceipts: boolean
): number {
  if (hours < 24) return 0;
  const gross = Math.round((foodRateCents * hours) / 24);
  return foodCoveredByReceipts ? Math.round(gross * 0.25) : gross;
}

/** SKAT-style breakdown: 40 t → 1 døgnsats + 16/24 døgnsats. */
export function skatFoodAllowanceFormula(hours: number): {
  fullDayUnits: number;
  extraHours: number;
  label: string;
} {
  if (hours < 24) {
    return { fullDayUnits: 0, extraHours: hours, label: "ingen kostgodtgørelse" };
  }
  const fullDayUnits = Math.floor(hours / 24);
  const extraHours = hours % 24;
  if (fullDayUnits === 0) {
    return { fullDayUnits: 0, extraHours: hours, label: `${hours}/24 døgnsats` };
  }
  const dayWord = fullDayUnits === 1 ? "døgnsats" : "døgnsatser";
  if (extraHours === 0) {
    return {
      fullDayUnits,
      extraHours: 0,
      label: fullDayUnits === 1 ? "1 døgnsats" : `${fullDayUnits} ${dayWord}`,
    };
  }
  return {
    fullDayUnits,
    extraHours,
    label: `${fullDayUnits} ${dayWord} + ${extraHours}/24 døgnsats`,
  };
}

export function describeSkatKostgodtgorelse(params: {
  hours: number;
  foodRateCents: number;
  foodCoveredByReceipts: boolean;
}): string {
  const { hours, foodRateCents, foodCoveredByReceipts } = params;
  if (hours < 24) {
    return "Rejsen skal vare mindst 24 timer, før skattefri kostgodtgørelse kan udbetales.";
  }
  const formula = skatFoodAllowanceFormula(hours);
  const gross = foodAllowanceGrossCents(hours, foodRateCents, foodCoveredByReceipts);
  const rateLabel = formatMoneyDkk(foodRateCents);
  if (foodCoveredByReceipts) {
    return `${hours} påbegyndte timer → ${formula.label} × 25% (kost efter regning) = ${formatMoneyDkk(gross)}`;
  }
  return `${hours} påbegyndte timer → ${formula.label} × ${rateLabel} = ${formatMoneyDkk(gross)}`;
}

export const SKAT_KOSTGODTGORELSE_SUMMARY = [
  "Kostgodtgørelsen dækker udokumenterede udgifter til måltider og småfornødenheder på rejsen.",
  "Udbetaling sker pr. døgn: efter 24 timer udbetales døgnsatsen, derefter pr. påbegyndt rejsetime (fx 40 t = 1 døgnsats + 16/24).",
  "Kost dækket som udlæg efter regning giver op til 25% af kostsatsen for hele rejsen.",
  "B-indkomst giver ikke ret til skattefri kostgodtgørelse.",
] as const;

export const SKAT_LOGIGODTGORELSE_SUMMARY = [
  "Logigodtgørelse dækker udokumenterede logiudgifter, når du selv betaler (hotel, camping, privat indlogering).",
  "Sats 268 kr. pr. fulde døgn i 2026 — udbetales når rejsen har varet mindst 24 timer, derefter pr. fuldt døgn.",
  "Ingen logigodtgørelse ved frit logi eller når logi dækkes som udlæg efter regning (kvittering).",
  "Betaler du selv uden kvitteringsudlæg, er det logigodtgørelse — ikke «udlæg efter regning».",
] as const;

export function describeSkatLogigodtgorelse(params: {
  startsAt: Date;
  endsAt: Date;
  dayLines: TravelDayLineInput[];
  lodgingAllowance: boolean;
  lodgingByReceipt: boolean;
  transportsPeopleOrGoods: boolean;
  rateYear?: number;
}): string | null {
  if (!params.lodgingAllowance || params.lodgingByReceipt || params.transportsPeopleOrGoods) return null;
  const hours = travelDurationHours(params.startsAt.getTime(), params.endsAt.getTime());
  if (hours < 24) return null;
  const lodgingRate = lodgingRateCentsForYear(params.rateYear ?? 2026);
  const fullDays = travelFullOvernightDays(params.startsAt.getTime(), params.endsAt.getTime());
  if (fullDays <= 0) return null;
  const eligibleNights = params.dayLines
    .slice(0, fullDays)
    .filter((line) => !line.lodgingCovered && !line.lodgingByReceipt).length;
  if (eligibleNights <= 0) {
    return "Ingen logigodtgørelse — frit logi eller udlæg efter regning er markeret på alle overnatningsdage.";
  }
  const total = eligibleNights * lodgingRate;
  return `${eligibleNights} fuldt døgn × ${formatMoneyDkk(lodgingRate)} = ${formatMoneyDkk(total)}`;
}
