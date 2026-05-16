/**
 * OrdoStage Flex vs Fixed pricing (EUR major units). Keep in sync with `backend/src/flexFixedPricing.ts`.
 */

export const FLEX_FIXED_MIN_SEATS = 1;
export const FLEX_FIXED_MAX_SEATS = 150;
export const FLEX_FIXED_DISCOUNT_CAP_SEATS = 150;
export const FLEX_FIXED_MAX_DISCOUNT_PERCENT = 42;
export const FIXED_FIRST_SEAT_ANNUAL_MONTHLY_MAJOR = 30;

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

export function annualDiscountPercent(seats: number): number {
  const n = clampSeatCount(seats);
  const capped = Math.min(n, FLEX_FIXED_DISCOUNT_CAP_SEATS);
  const raw = 15 + (27 / 149) * (capped - 1);
  return Math.min(FLEX_FIXED_MAX_DISCOUNT_PERCENT, raw);
}

export function annualMonthlyEquivMajor(seats: number): number {
  const n = clampSeatCount(seats);
  if (n === 1) return FIXED_FIRST_SEAT_ANNUAL_MONTHLY_MAJOR;
  let restTotal = 0;
  for (let i = 2; i <= n; i++) {
    restTotal += flexMarginalCostMajor(i);
  }
  const discount = annualDiscountPercent(n) / 100;
  return FIXED_FIRST_SEAT_ANNUAL_MONTHLY_MAJOR + restTotal * (1 - discount);
}

export function annualInvoiceTotalMajor(seats: number, roundToNearestTenMajor = false): number {
  let annual = annualMonthlyEquivMajor(seats) * 12;
  if (roundToNearestTenMajor) {
    annual = Math.round(annual / 10) * 10;
  }
  return annual;
}

export function annualSavingMajor(seats: number, roundToNearestTenMajor = false): number {
  const flexYear = flexMonthlyTotalMajor(seats) * 12;
  return Math.max(0, flexYear - annualInvoiceTotalMajor(seats, roundToNearestTenMajor));
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

export function requiresEnterpriseContact(seats: number): boolean {
  return seats > FLEX_FIXED_MAX_SEATS;
}

export type BillingPlanId = "flex" | "fixed";

function clampSeatCount(seats: number): number {
  if (!Number.isFinite(seats)) return FLEX_FIXED_MIN_SEATS;
  return Math.min(FLEX_FIXED_MAX_SEATS, Math.max(FLEX_FIXED_MIN_SEATS, Math.round(seats)));
}
