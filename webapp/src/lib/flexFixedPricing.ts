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
export const FLEX_FIXED_MAX_DISCOUNT_PERCENT = DEFAULT_FIXED_PLAN_PRICING.discountPercentMax;
export const FIXED_FIRST_SEAT_ANNUAL_MONTHLY_MAJOR =
  DEFAULT_FIXED_PLAN_PRICING.firstSeatAnnualMonthlyMajor;

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

export function annualDiscountPercent(seats: number, config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING): number {
  const n = clampSeatCount(seats, config);
  const cap = config.discountCapSeats;
  const capped = Math.min(n, cap);
  const span = Math.max(1, cap - 1);
  const min = config.discountPercentMin;
  const max = config.discountPercentMax;
  const raw = min + ((max - min) / span) * (capped - 1);
  return Math.min(max, raw);
}

export function annualMonthlyEquivMajor(
  seats: number,
  config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING,
): number {
  const n = clampSeatCount(seats, config);
  const first = config.firstSeatAnnualMonthlyMajor;
  if (n === 1) return first;
  let restTotal = 0;
  for (let i = 2; i <= n; i++) {
    restTotal += flexMarginalCostMajor(i);
  }
  const discount = annualDiscountPercent(n, config) / 100;
  return first + restTotal * (1 - discount);
}

export function annualInvoiceTotalMajor(
  seats: number,
  roundToNearestTenMajor = false,
  config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING,
): number {
  let annual = annualMonthlyEquivMajor(seats, config) * 12;
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

export function requiresEnterpriseContact(seats: number, config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING): boolean {
  return seats > config.selfServeMaxSeats;
}

export type BillingPlanId = "flex" | "fixed";

function clampSeatCount(seats: number, config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING): number {
  if (!Number.isFinite(seats)) return FLEX_FIXED_MIN_SEATS;
  return Math.min(config.selfServeMaxSeats, Math.max(FLEX_FIXED_MIN_SEATS, Math.round(seats)));
}
