import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { formatEuroMajor } from "@/lib/tieredSeatPricing";
import {
  FLEX_FIXED_MIN_SEATS,
  annualInvoiceTotalMajor,
  annualSavingMajor,
  fixedAnnualMonthlyEquivMajor,
  fixedMonthlyEquivMajor,
  fixedVolumeDiscountPercent,
  flexMonthlyTotalMajor,
} from "@/lib/flexFixedPricing";
import {
  DEFAULT_FIXED_PLAN_PRICING,
  type FixedPlanPricingConfig,
} from "@/lib/fixedPlanPricingConfig";

const DEFAULT_SEATS = 10;

function clampSeats(n: number, max: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SEATS;
  return Math.min(max, Math.max(1, Math.round(n)));
}

function Metric({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "violet" | "neutral";
}) {
  const border =
    accent === "violet" ? "border-ordo-violet/35 bg-ordo-violet/5" : "border-white/10 bg-white/[0.03]";
  return (
    <div className={cn("rounded-xl border p-4 space-y-1", border)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-white">{value}</p>
      {sub ? <p className="text-[11px] text-white/50 leading-snug">{sub}</p> : null}
    </div>
  );
}

export function FlexFixedPlanComparison({
  className,
  roundAnnualToTen = true,
  fixedPlanPricing = DEFAULT_FIXED_PLAN_PRICING,
}: {
  className?: string;
  /** When true, annual invoice totals round to nearest €10 (matches checkout). */
  roundAnnualToTen?: boolean;
  fixedPlanPricing?: FixedPlanPricingConfig;
}) {
  const [seats, setSeats] = useState(DEFAULT_SEATS);
  const maxSeats = fixedPlanPricing.selfServeMaxSeats;

  const quote = useMemo(() => {
    const n = clampSeats(seats, maxSeats);
    return {
      n,
      flexMo: flexMonthlyTotalMajor(n),
      fixedMo: fixedMonthlyEquivMajor(n, fixedPlanPricing),
      fixedAnnualMo: fixedAnnualMonthlyEquivMajor(n, fixedPlanPricing),
      annual: annualInvoiceTotalMajor(n, roundAnnualToTen, fixedPlanPricing),
      monthlyDiscount: fixedVolumeDiscountPercent(n, "monthly", fixedPlanPricing),
      annualDiscount: fixedVolumeDiscountPercent(n, "annual", fixedPlanPricing),
      saving: annualSavingMajor(n, roundAnnualToTen, fixedPlanPricing),
    };
  }, [seats, roundAnnualToTen, fixedPlanPricing, maxSeats]);

  return (
    <div className={cn("space-y-6", className)}>
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="plan-seat-slider" className="text-sm text-white/60">
            Seats for comparison
          </Label>
          <span className="text-lg font-semibold tabular-nums text-white">
            {quote.n} <span className="text-sm font-normal text-white/50">seats</span>
          </span>
        </div>
        <input
          id="plan-seat-slider"
          type="range"
          min={FLEX_FIXED_MIN_SEATS}
          max={maxSeats}
          step={1}
          value={quote.n}
          onChange={(e) => setSeats(clampSeats(Number(e.target.value), maxSeats))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-ordo-magenta [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/80 [&::-webkit-slider-thumb]:bg-ordo-magenta"
        />
        <p className="text-[11px] text-white/45">
          Fixed caps at {maxSeats} seats for self-serve checkout; larger venues — contact us.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Flex</h3>
            <p className="text-sm text-white/55 mt-1">
              Monthly postpaid. Pay for billable activity each month along the seat curve — no annual commitment.
            </p>
          </div>
          <Metric label="Monthly total" value={formatEuroMajor(quote.flexMo)} sub="Estimated at this seat count" />
          <ul className="text-xs text-white/55 space-y-1.5 list-disc pl-4 marker:text-white/30">
            <li>€60/mo base (includes 1st billable seat)</li>
            <li>2nd seat +€25; marginals step down to €5 from seat 20+</li>
            <li>Invoice monthly; view-only if unpaid after due date</li>
          </ul>
        </div>

        <div className="rounded-xl border border-ordo-violet/30 bg-ordo-violet/5 p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">Fixed</h3>
            <span className="rounded-md border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-200/95">
              {quote.monthlyDiscount.toFixed(1)}% mo · {quote.annualDiscount.toFixed(1)}% yr
            </span>
          </div>
          <p className="text-sm text-white/55">
            Annual upfront. First seat at €30/mo equivalent; remaining seats at Flex marginals with linear volume
            discount. Extra seats above commitment billed monthly at Flex rates.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Metric
              label="Monthly equivalent"
              value={formatEuroMajor(quote.fixedMo)}
              sub={`${quote.monthlyDiscount.toFixed(1)}% monthly volume discount`}
              accent="violet"
            />
            <Metric
              label="Annual (€/mo equiv.)"
              value={formatEuroMajor(quote.fixedAnnualMo)}
              sub={`${quote.annualDiscount.toFixed(1)}% annual volume discount`}
              accent="violet"
            />
            <Metric
              label="Annual invoice"
              value={formatEuroMajor(quote.annual)}
              sub="Billed yearly via Paddle"
              accent="violet"
            />
          </div>
          <p className="text-sm text-emerald-200/90">
            Save {formatEuroMajor(quote.saving)} per year vs paying Flex monthly for the same seat count.
          </p>
        </div>
      </div>
    </div>
  );
}
