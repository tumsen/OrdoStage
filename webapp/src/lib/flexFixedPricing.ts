/**
 * OrdoStage Flex vs Fixed pricing (EUR major units). Keep in sync with `backend/src/flexFixedPricing.ts`.
 */

import {
  DEFAULT_FIXED_PLAN_PRICING,
  type FixedPlanPricingConfig,
} from "@/lib/fixedPlanPricingConfig";

export const FLEX_FIXED_MIN_SEATS = 1;
export const FLEX_FIXED_MAX_SEATS = DEFAULT_FIXED_PLAN_PRICING.selfServeMaxSeats;
export const FLEX_FIXED_DISCOUNT_CAP_SEATS = DEFAULT_FIXED_PLAN_PRICING.discountCapSeats;
export const FLEX_FIXED_MAX_DISCOUNT_PERCENT = DEFAULT_FIXED_PLAN_PRICING.annualVolumeDiscountPercentMax;
export const FIXED_FIRST_SEAT_ANNUAL_MONTHLY_MAJOR = DEFAULT_FIXED_PLAN_PRICING.firstSeatMonthlyMajor;

export function flexMarginalCostMajor(seatIndex: number): number {
  if (seatIndex < 1 || !Number.isFinite(seatIndex)) return 0;
  if (seatIndex === 1) return 60;
  if (seatIndex === 2) return 25;
  if (seatIndex >= 20) return 5;
  return 25 + (seatIndex - 2) * (-20 / 18);
}

export function flexMonthlyTotalMajor(seats: number): number {
  const n = clampSeatCount(seats);
  let total = 0;
  for (let i = 1; i <= n; i++) {
    total += flexMarginalCostMajor(i);
  }
  return total;
}

export type FixedVolumeDiscountPeriod = "monthly" | "annual";

export function fixedVolumeDiscountPercent(
  seats: number,
  period: FixedVolumeDiscountPeriod,
  config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING,
): number {
  const n = clampSeatCount(seats, config);
  const cap = config.discountCapSeats;
  const capped = Math.min(n, cap);
  const span = Math.max(1, cap - 1);
  const min =
    period === "monthly"
      ? config.monthlyVolumeDiscountPercentMin
      : config.annualVolumeDiscountPercentMin;
  const max =
    period === "monthly"
      ? config.monthlyVolumeDiscountPercentMax
      : config.annualVolumeDiscountPercentMax;
  const raw = min + ((max - min) / span) * (capped - 1);
  return Math.min(max, raw);
}

export function annualDiscountPercent(
  seats: number,
  config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING,
): number {
  return fixedVolumeDiscountPercent(seats, "annual", config);
}

function fixedEquivMajor(
  seats: number,
  period: FixedVolumeDiscountPeriod,
  config: FixedPlanPricingConfig,
): number {
  const n = clampSeatCount(seats, config);
  const first = config.firstSeatMonthlyMajor;
  if (n === 1) return first;
  let restTotal = 0;
  for (let i = 2; i <= n; i++) {
    restTotal += flexMarginalCostMajor(i);
  }
  const discount = fixedVolumeDiscountPercent(n, period, config) / 100;
  return first + restTotal * (1 - discount);
}

export function fixedMonthlyEquivMajor(
  seats: number,
  config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING,
): number {
  return fixedEquivMajor(seats, "monthly", config);
}

export function fixedAnnualMonthlyEquivMajor(
  seats: number,
  config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING,
): number {
  return fixedEquivMajor(seats, "annual", config);
}

export function annualMonthlyEquivMajor(
  seats: number,
  config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING,
): number {
  return fixedAnnualMonthlyEquivMajor(seats, config);
}

export function annualInvoiceTotalMajor(
  seats: number,
  roundToNearestTenMajor = false,
  config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING,
): number {
  let annual = fixedAnnualMonthlyEquivMajor(seats, config) * 12;
  if (roundToNearestTenMajor) {
    annual = Math.round(annual / 10) * 10;
  }
  return annual;
}

export function annualSavingMajor(
  seats: number,
  roundToNearestTenMajor = false,
  config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING,
): number {
  const flexYear = flexMonthlyTotalMajor(seats) * 12;
  return Math.max(0, flexYear - annualInvoiceTotalMajor(seats, roundToNearestTenMajor, config));
}

export function flexOverageMonthlyTotalMajor(billableSeats: number, committedSeats: number): number {
  const billable = Math.max(0, Math.round(billableSeats));
  const committed = Math.max(0, Math.round(committedSeats));
  if (billable <= committed) return 0;
  let total = 0;
  for (let i = committed + 1; i <= billable; i++) {
    total += flexMarginalCostMajor(i);
  }
  return total;
}

export function fixedOverageMonthlyTotalMajor(billableSeats: number, committedSeats: number): number {
  const billable = Math.max(0, Math.round(billableSeats));
  const committed = Math.max(0, Math.round(committedSeats));
  if (billable <= committed) return 0;
  let total = 0;
  for (let i = committed + 1; i <= billable; i++) {
    total += flexMarginalCostMajor(i);
  }
  return total;
}

export function activeTemporarySeatsBoost(
  boost: number | null | undefined,
  expiresAtIso: string | null | undefined,
  now = new Date(),
): number {
  if (boost == null || boost < 1 || !expiresAtIso) return 0;
  const expiresAt = new Date(expiresAtIso);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) return 0;
  return Math.round(boost);
}

export function effectiveYearlyCommittedSeats(
  committedSeats: number,
  temporaryBoost: number | null | undefined,
  temporaryBoostExpiresAtIso: string | null | undefined,
  now = new Date(),
): number {
  const committed = Math.max(0, Math.round(committedSeats));
  return committed + activeTemporarySeatsBoost(temporaryBoost, temporaryBoostExpiresAtIso, now);
}

export function temporarySeatPassTotalMajor(
  extraSeats: number,
  config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING,
): number {
  if (!config.temporarySeatPassEnabled) return 0;
  const n = Math.max(0, Math.round(extraSeats));
  if (n < 1) return 0;
  return n * Math.max(0, config.temporarySeatPassPricePerSeatMajor);
}

export function requiresEnterpriseContact(
  seats: number,
  config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING,
): boolean {
  return seats > config.selfServeMaxSeats;
}

export type BillingPlanId = "flex" | "fixed";

function clampSeatCount(seats: number, config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING): number {
  if (!Number.isFinite(seats)) return FLEX_FIXED_MIN_SEATS;
  return Math.min(config.selfServeMaxSeats, Math.max(FLEX_FIXED_MIN_SEATS, Math.round(seats)));
}
