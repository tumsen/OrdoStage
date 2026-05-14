import { cn } from "@/lib/utils";
import type { TieredSeatModel } from "@/lib/tieredSeatPricing";
import {
  formatEuroMajor,
  marginalSeatMajorForIndex1Based,
  ordinalEn,
} from "@/lib/tieredSeatPricing";

type Props = {
  model: TieredSeatModel;
  className?: string;
  /** Slightly tighter copy for secondary placement. */
  compact?: boolean;
};

/**
 * Human-readable marginal tier summary (EUR major units). Stays in sync with the seat curve model.
 */
export function SeatTierIntroBlurb({ model, className, compact }: Props) {
  const safeFloorAt = Math.max(3, Math.floor(model.floorAt));
  const first = formatEuroMajor(marginalSeatMajorForIndex1Based(1, model));
  const second = formatEuroMajor(marginalSeatMajorForIndex1Based(2, model));
  const floorAmt = formatEuroMajor(model.floor);
  const declines = model.start > model.floor + 1e-9 && safeFloorAt > 2;

  return (
    <p className={cn(compact ? "text-sm text-white/65 leading-relaxed" : "text-base md:text-lg text-white/75 leading-relaxed", className)}>
      The published curve charges <strong className="text-white/90">{first}</strong> for the{" "}
      <strong className="text-white/90">1st</strong> billable seat in a month,{" "}
      <strong className="text-white/90">{second}</strong> for the <strong className="text-white/90">2nd</strong>
      {declines ? (
        <>
          , then a lower marginal amount for each additional seat until it reaches{" "}
          <strong className="text-white/90">{floorAmt}</strong> per seat from the{" "}
          <strong className="text-white/90">{ordinalEn(safeFloorAt)}</strong> seat onward
        </>
      ) : (
        <>
          , then <strong className="text-white/90">{floorAmt}</strong> per additional seat from the{" "}
          <strong className="text-white/90">{ordinalEn(safeFloorAt)}</strong> seat onward
        </>
      )}
      . Your monthly invoice total is the sum of these marginal amounts for every billable member that month.
    </p>
  );
}
