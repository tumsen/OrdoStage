/**
 * OrdoStage Flex (monthly postpaid) vs Fixed (annual commitment) pricing.
 * Amounts in major currency units (EUR). Mirrors `webapp/src/lib/flexFixedPricing.ts`.
 */

import {
  DEFAULT_FIXED_PLAN_PRICING,
  type FixedPlanPricingConfig,
} from "./fixedPlanPricingConfig";

export const FLEX_FIXED_MIN_SEATS = 1;
export const FLEX_FIXED_MAX_SEATS = DEFAULT_FIXED_PLAN_PRICING.selfServeMaxSeats;
export const FLEX_FIXED_DISCOUNT_CAP_SEATS = DEFAULT_FIXED_PLAN_PRICING.discountCapSeats;
export const FLEX_FIXED_MAX_DISCOUNT_PERCENT = DEFAULT_FIXED_PLAN_PRICING.annualVolumeDiscountPercentMax;
export const FIXED_FIRST_SEAT_ANNUAL_MONTHLY_MAJOR = DEFAULT_FIXED_PLAN_PRICING.firstSeatMonthlyMajor;

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

export type FixedVolumeDiscountPeriod = "monthly" | "annual";

/** Linear volume discount on Fixed seats 2+ (min% at 1 seat → max% at cap seats). */
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

/** @deprecated use fixedVolumeDiscountPercent(seats, "annual", config) */
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

/** Fixed plan €/month equivalent using monthly volume discount (comparison / display). */
export function fixedMonthlyEquivMajor(
  seats: number,
  config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING,
): number {
  return fixedEquivMajor(seats, "monthly", config);
}

/** Fixed plan €/month equivalent using annual volume discount (×12 for checkout). */
export function fixedAnnualMonthlyEquivMajor(
  seats: number,
  config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING,
): number {
  return fixedEquivMajor(seats, "annual", config);
}

/** Checkout / annual commitment monthly equivalent (annual discount curve). */
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

export function flexMonthlyTotalCents(seats: number): number {
  return majorToCents(flexMonthlyTotalMajor(seats));
}

export function annualInvoiceTotalCents(
  seats: number,
  roundToNearestTenMajor = false,
  config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING,
): number {
  return majorToCents(annualInvoiceTotalMajor(seats, roundToNearestTenMajor, config));
}

export const INVOICE_KIND = {
  FLEX_MONTHLY: "flex_monthly",
  FIXED_OVERAGE: "fixed_overage",
  FIXED_TOPUP: "fixed_topup",
} as const;

export type InvoiceKind = (typeof INVOICE_KIND)[keyof typeof INVOICE_KIND];

export function requiresEnterpriseContact(seats: number, config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING): boolean {
  return seats > config.selfServeMaxSeats;
}

export function annualMonthlyEquivCents(
  seats: number,
  config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING,
): number {
  return majorToCents(annualMonthlyEquivMajor(seats, config));
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

export function activeTemporarySeatsBoost(
  boost: number | null | undefined,
  expiresAt: Date | null | undefined,
  now = new Date(),
): number {
  if (boost == null || boost < 1 || !expiresAt) return 0;
  if (expiresAt.getTime() <= now.getTime()) return 0;
  return Math.round(boost);
}

/** Committed seats plus an active short-term pass boost (Yearly). */
export function effectiveYearlyCommittedSeats(
  committedSeats: number,
  temporaryBoost: number | null | undefined,
  temporaryBoostExpiresAt: Date | null | undefined,
  now = new Date(),
): number {
  const committed = Math.max(0, Math.round(committedSeats));
  return committed + activeTemporarySeatsBoost(temporaryBoost, temporaryBoostExpiresAt, now);
}

/** One-time charge for extra seats on a Yearly short-term pass. */
export function temporarySeatPassTotalMajor(
  extraSeats: number,
  config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING,
): number {
  if (!config.temporarySeatPassEnabled) return 0;
  const n = Math.max(0, Math.round(extraSeats));
  if (n < 1) return 0;
  return n * Math.max(0, config.temporarySeatPassPricePerSeatMajor);
}

export function temporarySeatPassTotalCents(
  extraSeats: number,
  config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING,
): number {
  return majorToCents(temporarySeatPassTotalMajor(extraSeats, config));
}

/** Prorated top-up when increasing committed seats mid-term (0 if newSeats <= oldSeats). */
export function proratedSeatIncreaseTopUpMajor(
  oldSeats: number,
  newSeats: number,
  termStart: Date,
  renewalAt: Date,
  now = new Date(),
  roundToNearestTenMajor = false,
  config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING,
): number {
  const oldN = clampSeatCount(oldSeats, config);
  const newN = clampSeatCount(newSeats, config);
  if (newN <= oldN) return 0;

  const termMs = Math.max(1, renewalAt.getTime() - termStart.getTime());
  const remainingMs = Math.max(0, renewalAt.getTime() - now.getTime());
  const fraction = Math.min(1, remainingMs / termMs);

  const deltaAnnual =
    annualInvoiceTotalMajor(newN, roundToNearestTenMajor, config) -
    annualInvoiceTotalMajor(oldN, roundToNearestTenMajor, config);
  return Math.max(0, deltaAnnual * fraction);
}

export function proratedSeatIncreaseTopUpCents(
  oldSeats: number,
  newSeats: number,
  termStart: Date,
  renewalAt: Date,
  now = new Date(),
  roundToNearestTenMajor = false,
  config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING,
): number {
  return majorToCents(
    proratedSeatIncreaseTopUpMajor(oldSeats, newSeats, termStart, renewalAt, now, roundToNearestTenMajor, config),
  );
}

function clampSeatCount(seats: number, config: FixedPlanPricingConfig = DEFAULT_FIXED_PLAN_PRICING): number {
  if (!Number.isFinite(seats)) return FLEX_FIXED_MIN_SEATS;
  return Math.min(config.selfServeMaxSeats, Math.max(FLEX_FIXED_MIN_SEATS, Math.round(seats)));
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
