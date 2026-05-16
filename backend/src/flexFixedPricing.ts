/**
 * OrdoStage Flex (monthly postpaid) vs Fixed (annual commitment) pricing.
 * Amounts in major currency units (EUR). Mirrors `webapp/src/lib/flexFixedPricing.ts`.
 */

export const FLEX_FIXED_MIN_SEATS = 1;
export const FLEX_FIXED_MAX_SEATS = 150;
export const FLEX_FIXED_DISCOUNT_CAP_SEATS = 150;
export const FLEX_FIXED_MAX_DISCOUNT_PERCENT = 42;
export const FIXED_FIRST_SEAT_ANNUAL_MONTHLY_MAJOR = 30;

/** Flex marginal €/month for the n-th billable seat (1-based). */
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

/** Linear volume discount for Fixed annual (15% at 1 seat → 42% at 150 seats). */
export function annualDiscountPercent(seats: number): number {
  const n = clampSeatCount(seats);
  const capped = Math.min(n, FLEX_FIXED_DISCOUNT_CAP_SEATS);
  const raw = 15 + (27 / 149) * (capped - 1);
  return Math.min(FLEX_FIXED_MAX_DISCOUNT_PERCENT, raw);
}

/** Fixed plan monthly equivalent (EUR) before ×12 for invoice. */
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

export function flexMonthlyTotalCents(seats: number): number {
  return majorToCents(flexMonthlyTotalMajor(seats));
}

export function annualInvoiceTotalCents(seats: number, roundToNearestTenMajor = false): number {
  return majorToCents(annualInvoiceTotalMajor(seats, roundToNearestTenMajor));
}

export const INVOICE_KIND = {
  FLEX_MONTHLY: "flex_monthly",
  FIXED_OVERAGE: "fixed_overage",
  FIXED_TOPUP: "fixed_topup",
} as const;

export type InvoiceKind = (typeof INVOICE_KIND)[keyof typeof INVOICE_KIND];

export function requiresEnterpriseContact(seats: number): boolean {
  return seats > FLEX_FIXED_MAX_SEATS;
}

export function annualMonthlyEquivCents(seats: number): number {
  return majorToCents(annualMonthlyEquivMajor(seats));
}

/** Marginal €/month for the next seat above committed count (overage billing). */
export function flexOverageMarginalMajor(committedSeats: number): number {
  return flexMarginalCostMajor(Math.max(1, Math.floor(committedSeats)) + 1);
}

/** Monthly overage total when billable count exceeds committed seats (Flex marginals for seats above commitment). */
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

export function fixedOverageMonthlyTotalCents(billableSeats: number, committedSeats: number): number {
  return majorToCents(fixedOverageMonthlyTotalMajor(billableSeats, committedSeats));
}

/** Prorated top-up when increasing committed seats mid-term (0 if newSeats <= oldSeats). */
export function proratedSeatIncreaseTopUpMajor(
  oldSeats: number,
  newSeats: number,
  termStart: Date,
  renewalAt: Date,
  now = new Date(),
  roundToNearestTenMajor = false,
): number {
  const oldN = clampSeatCount(oldSeats);
  const newN = clampSeatCount(newSeats);
  if (newN <= oldN) return 0;

  const termMs = Math.max(1, renewalAt.getTime() - termStart.getTime());
  const remainingMs = Math.max(0, renewalAt.getTime() - now.getTime());
  const fraction = Math.min(1, remainingMs / termMs);

  const deltaAnnual =
    annualInvoiceTotalMajor(newN, roundToNearestTenMajor) - annualInvoiceTotalMajor(oldN, roundToNearestTenMajor);
  return Math.max(0, deltaAnnual * fraction);
}

export function proratedSeatIncreaseTopUpCents(
  oldSeats: number,
  newSeats: number,
  termStart: Date,
  renewalAt: Date,
  now = new Date(),
  roundToNearestTenMajor = false,
): number {
  return majorToCents(
    proratedSeatIncreaseTopUpMajor(oldSeats, newSeats, termStart, renewalAt, now, roundToNearestTenMajor),
  );
}

function clampSeatCount(seats: number): number {
  if (!Number.isFinite(seats)) return FLEX_FIXED_MIN_SEATS;
  return Math.min(FLEX_FIXED_MAX_SEATS, Math.max(FLEX_FIXED_MIN_SEATS, Math.round(seats)));
}

function majorToCents(major: number): number {
  return Math.max(0, Math.round(major * 100));
}

export type BillingPlanId = "flex" | "fixed";

export function parseBillingPlan(value: string | null | undefined): BillingPlanId {
  return value === "fixed" ? "fixed" : "flex";
}

export function organizationUsesFlexPostpaid(plan: string | null | undefined): boolean {
  return parseBillingPlan(plan) === "flex";
}
