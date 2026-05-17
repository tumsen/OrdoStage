import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TieredSeatPricingCalculator } from "@/components/pricing/TieredSeatPricingCalculator";
import { DEFAULT_FIXED_PLAN_PRICING, type FixedPlanPricingConfig } from "@/lib/fixedPlanPricingConfig";
import { parseSeatCalculatorJson } from "@/lib/seatCalculatorJson";
import { DEFAULT_TIERED_SEAT_MODEL } from "@/lib/tieredSeatPricing";

export function HomePricingCalculator() {
  const { data: publicPricing } = useQuery<{
    defaultSeatCalculatorJson?: string | null;
    yearlyDiscountPercent?: number;
    yearlyDiscountEnabled?: boolean;
    fixedAnnualRoundToTen?: boolean;
    fixedPlanPricing?: FixedPlanPricingConfig;
  }>({
    queryKey: ["public-pricing-rates"],
    queryFn: ({ signal }) =>
      api.get(`/api/public/pricing?t=${Date.now()}`, { cache: "no-store", signal }),
    staleTime: 60_000,
  });

  const seatModel = (() => {
    const parsed = parseSeatCalculatorJson(publicPricing?.defaultSeatCalculatorJson);
    return { ...DEFAULT_TIERED_SEAT_MODEL, ...parsed?.model };
  })();

  return (
    <section
      id="pricing-preview"
      className="w-full scroll-mt-6 rounded-2xl border border-ordo-magenta/30 bg-black/25 p-5 text-left backdrop-blur-sm md:p-8 space-y-5"
    >
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-ordo-yellow/90">Pricing</p>
        <h2 className="text-xl md:text-2xl font-semibold text-white">Flex vs Yearly — try the seat slider</h2>
        <p className="text-sm text-white/65 leading-relaxed max-w-3xl">
          Compare monthly Flex postpaid with Yearly prepay on one chart.{" "}
          <Link to="/pricing" className="text-ordo-yellow hover:underline">
            Full pricing details
          </Link>
        </p>
      </div>
      <TieredSeatPricingCalculator
        compareFlexFixedPlans
        seatModel={seatModel}
        fixedPlanPricing={publicPricing?.fixedPlanPricing ?? DEFAULT_FIXED_PLAN_PRICING}
        fixedAnnualRoundToTen={publicPricing?.fixedAnnualRoundToTen !== false}
        yearlyDiscountPercent={publicPricing?.yearlyDiscountPercent ?? 15}
        yearlyDiscountEnabled={publicPricing?.yearlyDiscountEnabled !== false}
      />
      <div className="flex justify-center pt-2">
        <Button asChild variant="outline" className="border-white/20 text-white bg-transparent hover:bg-white/5">
          <Link to="/pricing">See all pricing options</Link>
        </Button>
      </div>
    </section>
  );
}
