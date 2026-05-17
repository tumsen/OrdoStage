import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { formatEuroMajor, DEFAULT_TIERED_SEAT_MODEL, type TieredSeatModel } from "@/lib/tieredSeatPricing";
import {
  FLEX_FIXED_MIN_SEATS,
  annualInvoiceTotalMajor,
  annualSavingMajor,
  fixedAnnualMonthlyEquivMajor,
  fixedVolumeDiscountPercent,
  flexMonthlyTotalMajor,
} from "@/lib/flexFixedPricing";
import {
  DEFAULT_FIXED_PLAN_PRICING,
  type FixedPlanPricingConfig,
} from "@/lib/fixedPlanPricingConfig";
import { planAccentStyles } from "@/lib/ordoBrandColors";
import { pricingSeatRangeClass } from "@/components/pricing/pricingSeatRangeClass";

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
  accent?: "flex" | "yearly" | "neutral";
}) {
  const border =
    accent === "flex"
      ? planAccentStyles.flex.cardBorder
      : accent === "yearly"
        ? planAccentStyles.yearly.cardBorder
        : "border-white/10 bg-white/[0.03]";
  const labelClass =
    accent === "flex"
      ? planAccentStyles.flex.label
      : accent === "yearly"
        ? planAccentStyles.yearly.label
        : "text-white/45";
  return (
    <div className={cn("rounded-xl border p-4 space-y-1", border)}>
      <p className={cn("text-[11px] font-medium uppercase tracking-wide", labelClass)}>{label}</p>
      <p className="text-xl font-semibold tabular-nums text-white">{value}</p>
      {sub ? <p className="text-[11px] text-white/50 leading-snug">{sub}</p> : null}
    </div>
  );
}

export function FlexFixedPlanComparison({
  className,
  roundAnnualToTen = true,
  fixedPlanPricing = DEFAULT_FIXED_PLAN_PRICING,
  seatModel = DEFAULT_TIERED_SEAT_MODEL,
}: {
  className?: string;
  roundAnnualToTen?: boolean;
  fixedPlanPricing?: FixedPlanPricingConfig;
  seatModel?: TieredSeatModel;
}) {
  const [seats, setSeats] = useState(DEFAULT_SEATS);
  const maxSeats = fixedPlanPricing.selfServeMaxSeats;
  const floorAt = Math.max(3, Math.floor(seatModel.floorAt));

  const quote = useMemo(() => {
    const n = clampSeats(seats, maxSeats);
    return {
      n,
      flexMo: flexMonthlyTotalMajor(n),
      yearlyMo: fixedAnnualMonthlyEquivMajor(n, fixedPlanPricing),
      annual: annualInvoiceTotalMajor(n, roundAnnualToTen, fixedPlanPricing),
      annualDiscount: fixedVolumeDiscountPercent(n, "annual", fixedPlanPricing),
      saving: annualSavingMajor(n, roundAnnualToTen, fixedPlanPricing),
    };
  }, [seats, roundAnnualToTen, fixedPlanPricing, maxSeats]);

  const flex = planAccentStyles.flex;
  const yearly = planAccentStyles.yearly;

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
          className={pricingSeatRangeClass}
        />
        <p className="text-[11px] text-white/45">
          Yearly self-serve up to {maxSeats} seats; larger venues — contact us.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={cn("rounded-xl border p-5 space-y-4", flex.sectionBorder, flex.sectionBg)}>
          <div>
            <h3 className="text-lg font-semibold text-white">Flex</h3>
            <p className="text-sm text-white/55 mt-1">
              Monthly postpaid for billable activity — no seat commitment. Stop paying when you stop using the product.
            </p>
          </div>
          <Metric
            label="Monthly total"
            value={formatEuroMajor(quote.flexMo)}
            sub="Estimated at this seat count"
            accent="flex"
          />
          <ul className="text-xs text-white/55 space-y-1.5 list-disc pl-4 marker:text-ordo-magenta/60">
            <li>
              €{seatModel.base}/mo base (includes 1st billable seat); 2nd +€{seatModel.start}; down to €{seatModel.floor}
              /seat from seat {floorAt}+
            </li>
            <li>Invoice monthly; view-only if unpaid after due date</li>
          </ul>
        </div>

        <div className={cn("rounded-xl border p-5 space-y-4", yearly.sectionBorder, yearly.sectionBg)}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">Yearly</h3>
            <span className="rounded-md border border-ordo-yellow/35 bg-ordo-yellow/15 px-2 py-0.5 text-[11px] font-medium text-ordo-yellow/95">
              {quote.annualDiscount.toFixed(1)}% volume discount
            </span>
          </div>
          <p className="text-sm text-white/55">
            Pay annually upfront for committed seats. First seat at €{fixedPlanPricing.firstSeatMonthlyMajor}/mo
            equivalent; seats 2+ at Flex marginals with annual volume discount.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Metric
              label="Annual invoice"
              value={formatEuroMajor(quote.annual)}
              sub="Billed yearly via Paddle"
              accent="yearly"
            />
            <Metric
              label="€/mo equivalent"
              value={formatEuroMajor(quote.yearlyMo)}
              sub={`${quote.annualDiscount.toFixed(1)}% annual discount`}
              accent="yearly"
            />
          </div>
          <p className="text-sm text-ordo-yellow/90">
            Save {formatEuroMajor(quote.saving)} per year vs paying Flex monthly for the same seat count.
          </p>
        </div>
      </div>
    </div>
  );
}
