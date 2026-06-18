export type CountryRuleSetId = "DK";

export type TravelAllowanceType = "standard" | "tour_driver_denmark" | "tour_driver_abroad";

export type TravelClaimDayLine = {
  date: string;
  city?: string;
  hotel?: string;
  lodgingPlaceId?: string;
  lodgingLabel?: string;
  breakfastProvided?: boolean;
  lunchProvided?: boolean;
  dinnerProvided?: boolean;
  lodgingCovered?: boolean;
  lodgingByReceipt?: boolean;
  timeProjectId?: string | null;
};

export type TravelAllowanceInput = {
  startsAt: Date;
  endsAt: Date;
  allowanceType: TravelAllowanceType;
  rateYear?: number;
  breakfastProvided?: boolean;
  lunchProvided?: boolean;
  dinnerProvided?: boolean;
  lodgingAllowance?: boolean;
  lodgingCovered?: boolean;
  foodCoveredByReceipts?: boolean;
  isTemporaryWorkplace?: boolean;
  hasUsualResidence?: boolean;
  overnightAwayFromHome?: boolean;
  cannotReturnHome?: boolean;
  twelveMonthRuleOk?: boolean;
  salaryReductionAgreement?: boolean;
  receivesBIncome?: boolean;
  excludedWorkerType?: boolean;
  transportsPeopleOrGoods?: boolean;
  lodgingByReceipt?: boolean;
  dayLines?: TravelClaimDayLine[];
};

export type TravelAllowanceResult = {
  rateYear: number;
  foodRateCents: number;
  lodgingRateCents: number;
  foodAmountCents: number;
  lodgingAmountCents: number;
  totalAmountCents: number;
};

export type MileageVehicleType = "car" | "bicycle";

export type MileageAllowanceInput = {
  vehicleType: MileageVehicleType;
  distanceKm: number;
  rateYear?: number;
  /** Car km already driven this calendar year (same employer), excluding the current claim. */
  carKmYtdBeforeTrip?: number;
  salaryReductionAgreement?: boolean;
  receivesBIncome?: boolean;
};

export type MileageAllowanceResult = {
  rateYear: number;
  rateCentsPerKmHigh: number;
  rateCentsPerKmLow: number;
  bicycleRateCentsPerKm: number;
  highRateKm: number;
  lowRateKm: number;
  totalAmountCents: number;
};

const CAR_KM_YEAR_LIMIT = 20_000;

export type CountryRuleSet = {
  id: CountryRuleSetId;
  countryCode: string;
  label: string;
  travel: {
    supportedAllowanceTypes: TravelAllowanceType[];
    calculateAllowance: (input: TravelAllowanceInput) => TravelAllowanceResult;
  };
  mileage: {
    supportedVehicleTypes: MileageVehicleType[];
    calculateAllowance: (input: MileageAllowanceInput) => MileageAllowanceResult;
  };
  vacation: {
    label: string;
    status: "planned";
  };
};

function ratesForDanishTravelClaim(rateYear: number, allowanceType: TravelAllowanceType) {
  const year = rateYear === 2025 ? 2025 : 2026;
  const lodgingRateCents = year === 2025 ? 25_600 : 26_800;
  if (allowanceType === "tour_driver_denmark") {
    return { rateYear: year, foodRateCents: 7_500, lodgingRateCents };
  }
  if (allowanceType === "tour_driver_abroad") {
    return { rateYear: year, foodRateCents: 15_000, lodgingRateCents };
  }
  return {
    rateYear: year,
    foodRateCents: year === 2025 ? 59_700 : 62_500,
    lodgingRateCents,
  };
}

function calculateDanishTravelAllowance(input: TravelAllowanceInput): TravelAllowanceResult {
  const rates = ratesForDanishTravelClaim(input.rateYear ?? 2026, input.allowanceType);
  const durationMs = input.endsAt.getTime() - input.startsAt.getTime();
  const startedHours = Math.ceil(durationMs / 3_600_000);
  const fullDays = Math.floor(durationMs / 86_400_000);
  const baseEligible =
    durationMs >= 86_400_000 &&
    input.isTemporaryWorkplace === true &&
    input.hasUsualResidence === true &&
    input.overnightAwayFromHome === true &&
    input.cannotReturnHome === true &&
    input.twelveMonthRuleOk !== false &&
    input.salaryReductionAgreement !== true &&
    input.receivesBIncome !== true &&
    input.excludedWorkerType !== true;
  const eligibleFoodHours = baseEligible ? startedHours : 0;

  const dayLines = input.dayLines?.length
    ? input.dayLines
    : Array.from({ length: Math.max(1, Math.ceil(eligibleFoodHours / 24)) }, (_, idx) => ({
      date: new Date(input.startsAt.getTime() + idx * 86_400_000).toISOString().slice(0, 10),
      breakfastProvided: input.breakfastProvided,
      lunchProvided: input.lunchProvided,
      dinnerProvided: input.dinnerProvided,
      lodgingCovered: input.lodgingCovered,
      lodgingByReceipt: input.lodgingByReceipt,
    }));
  let foodAmountCents = eligibleFoodHours > 0
    ? Math.round((rates.foodRateCents * eligibleFoodHours) / 24)
    : 0;
  if (input.foodCoveredByReceipts) {
    foodAmountCents = Math.round(foodAmountCents * 0.25);
  } else if (input.allowanceType === "standard") {
    const mealReductionCents = dayLines.reduce((sum, line) => {
      const reductionPct =
        (line.breakfastProvided ? 0.15 : 0) +
        (line.lunchProvided ? 0.30 : 0) +
        (line.dinnerProvided ? 0.30 : 0);
      return sum + Math.round(rates.foodRateCents * Math.min(0.75, reductionPct));
    }, 0);
    foodAmountCents = Math.max(0, foodAmountCents - mealReductionCents);
  }

  const lodgingEligible =
    baseEligible &&
    input.allowanceType === "standard" &&
    input.transportsPeopleOrGoods !== true &&
    input.lodgingByReceipt !== true;
  const lodgingAmountCents =
    lodgingEligible && input.lodgingAllowance && fullDays > 0
      ? dayLines
        .slice(0, fullDays)
        .filter((line) => !line.lodgingCovered && !line.lodgingByReceipt)
        .length * rates.lodgingRateCents
      : 0;

  return {
    ...rates,
    foodAmountCents,
    lodgingAmountCents,
    totalAmountCents: foodAmountCents + lodgingAmountCents,
  };
}

function ratesForDanishMileage(rateYear: number) {
  const year = rateYear === 2025 ? 2025 : 2026;
  if (year === 2025) {
    return {
      rateYear: year,
      rateCentsPerKmHigh: 381,
      rateCentsPerKmLow: 223,
      bicycleRateCentsPerKm: 63,
    };
  }
  return {
    rateYear: year,
    rateCentsPerKmHigh: 394,
    rateCentsPerKmLow: 228,
    bicycleRateCentsPerKm: 64,
  };
}

function calculateDanishMileageAllowance(input: MileageAllowanceInput): MileageAllowanceResult {
  const rates = ratesForDanishMileage(input.rateYear ?? 2026);
  const eligible = input.salaryReductionAgreement !== true && input.receivesBIncome !== true;
  const distanceKm = Number.isFinite(input.distanceKm) ? Math.max(0, input.distanceKm) : 0;

  if (!eligible || distanceKm <= 0) {
    return {
      ...rates,
      highRateKm: 0,
      lowRateKm: 0,
      totalAmountCents: 0,
    };
  }

  if (input.vehicleType === "bicycle") {
    return {
      ...rates,
      highRateKm: 0,
      lowRateKm: 0,
      totalAmountCents: Math.round(distanceKm * rates.bicycleRateCentsPerKm),
    };
  }

  const ytd = Math.max(0, input.carKmYtdBeforeTrip ?? 0);
  const highRemaining = Math.max(0, CAR_KM_YEAR_LIMIT - ytd);
  const highRateKm = Math.min(distanceKm, highRemaining);
  const lowRateKm = distanceKm - highRateKm;
  const totalAmountCents = Math.round(
    highRateKm * rates.rateCentsPerKmHigh + lowRateKm * rates.rateCentsPerKmLow
  );

  return {
    ...rates,
    highRateKm,
    lowRateKm,
    totalAmountCents,
  };
}

export const danishRuleSet: CountryRuleSet = {
  id: "DK",
  countryCode: "DK",
  label: "Denmark",
  travel: {
    supportedAllowanceTypes: ["standard", "tour_driver_denmark", "tour_driver_abroad"],
    calculateAllowance: calculateDanishTravelAllowance,
  },
  mileage: {
    supportedVehicleTypes: ["car", "bicycle"],
    calculateAllowance: calculateDanishMileageAllowance,
  },
  vacation: {
    label: "Danish vacation rules",
    status: "planned",
  },
};

const COUNTRY_RULE_SETS: Record<CountryRuleSetId, CountryRuleSet> = {
  DK: danishRuleSet,
};

export function normalizeCountryRuleSetId(country: string | null | undefined): CountryRuleSetId | null {
  const normalized = (country || "DK").trim().toUpperCase();
  return normalized === "DK" ? "DK" : null;
}

export function getCountryRuleSet(country: string | null | undefined): CountryRuleSet | null {
  const id = normalizeCountryRuleSetId(country);
  return id ? COUNTRY_RULE_SETS[id] : null;
}
