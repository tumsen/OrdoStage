import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSiteContentLanguage } from "@/hooks/useSiteContentLanguage";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { TieredSeatPricingCalculator } from "@/components/pricing/TieredSeatPricingCalculator";
import { SeatTierIntroBlurb } from "@/components/pricing/SeatTierIntroBlurb";
import { DEFAULT_FIXED_PLAN_PRICING, type FixedPlanPricingConfig } from "@/lib/fixedPlanPricingConfig";
import { parseSeatCalculatorJson } from "@/lib/seatCalculatorJson";
import {
  DEFAULT_TIERED_SEAT_MODEL,
  formatEuroMajor,
  marginalSeatMajorForIndex1Based,
  ordinalEn,
  type TieredSeatModel,
} from "@/lib/tieredSeatPricing";

function SectionDivider() {
  return (
    <div className="my-14 md:my-16 flex items-center gap-4" aria-hidden>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-ordo-magenta/50 to-transparent" />
      <div className="h-px w-16 bg-gradient-to-r from-ordo-yellow/60 to-ordo-violet/60 opacity-90" />
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-ordo-violet/50 to-transparent" />
    </div>
  );
}

export default function PublicPricing() {
  const siteLang = useSiteContentLanguage();
  const { data: siteMeta } = useQuery({
    queryKey: ["site-content-public", siteLang],
    queryFn: () => api.get<Record<string, string>>(`/api/site-content?language=${encodeURIComponent(siteLang)}`),
  });

  const pricingTitle =
    siteMeta?.pricing_page_title?.trim() || "Flex or Yearly — pricing that scales with your team";
  const { data: publicPricing } = useQuery<{
    baseCurrencyCode: string;
    yearlyDiscountPercent?: number;
    yearlyDiscountEnabled?: boolean;
    defaultSeatCalculatorJson?: string | null;
    billingTrialDays?: number;
    billingGraceDaysAfterDue?: number;
    fixedAnnualRoundToTen?: boolean;
    fixedPlanPricing?: FixedPlanPricingConfig;
    prices: Array<{ currencyCode: string; userDailyRateCents: number }>;
  }>({
    queryKey: ["public-pricing-rates"],
    queryFn: ({ signal }) =>
      api.get(`/api/public/pricing?t=${Date.now()}`, { cache: "no-store", signal }),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const publicSeatModel: TieredSeatModel = (() => {
    const parsed = parseSeatCalculatorJson(publicPricing?.defaultSeatCalculatorJson);
    return { ...DEFAULT_TIERED_SEAT_MODEL, ...parsed?.model };
  })();

  const firstSeatLabel = formatEuroMajor(marginalSeatMajorForIndex1Based(1, publicSeatModel));
  const safeFloorAt = Math.max(3, Math.floor(publicSeatModel.floorAt));
  const secondSeatMajor = formatEuroMajor(marginalSeatMajorForIndex1Based(2, publicSeatModel));
  const floorMajor = formatEuroMajor(publicSeatModel.floor);
  const seatCurveDeclines =
    publicSeatModel.start > publicSeatModel.floor + 1e-9 && safeFloorAt > 2;

  const fixedPlan = publicPricing?.fixedPlanPricing ?? DEFAULT_FIXED_PLAN_PRICING;
  const roundAnnualToTen = publicPricing?.fixedAnnualRoundToTen !== false;
  const fixedFirstSeat = formatEuroMajor(fixedPlan.firstSeatMonthlyMajor);

  return (
    <div className="text-white">
      <article className="w-full px-6 py-14 md:py-20 space-y-10 md:space-y-12">

        <header className="space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold leading-tight tracking-tight">{pricingTitle}</h1>
          <p className="text-lg text-white/75 leading-relaxed max-w-3xl">
            Two plans: <strong className="text-ordo-magenta/95">Flex</strong> (monthly postpaid, no commitment) and{" "}
            <strong className="text-ordo-violet/95">Yearly</strong> (committed seats, pay once for 12 months). Use the
            calculator below, then read how each plan fits your season.
          </p>
        </header>

        <section
          id="pricing-calculator"
          className="space-y-4 rounded-xl border-2 border-ordo-magenta/35 bg-gradient-to-b from-ordo-magenta/10 via-transparent to-ordo-violet/10 p-6 md:p-8 scroll-mt-8"
        >
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-ordo-yellow/90">Two plans</p>
            <h2 className="text-2xl md:text-3xl font-semibold text-white">Flex vs Yearly</h2>
            <p className="text-sm text-white/60 leading-relaxed max-w-3xl">
              Move the slider to compare Flex postpaid with Yearly prepay at the same seat count. Yearly locks seats for
              12 months — first seat at {fixedFirstSeat}/mo equivalent, volume discount on seats 2+.{" "}
              <SeatTierIntroBlurb model={publicSeatModel} compact className="inline text-sm text-white/60" />
            </p>
          </div>
          <TieredSeatPricingCalculator
            compareFlexFixedPlans
            seatModel={publicSeatModel}
            fixedPlanPricing={fixedPlan}
            fixedAnnualRoundToTen={roundAnnualToTen}
            yearlyDiscountPercent={publicPricing?.yearlyDiscountPercent ?? 15}
            yearlyDiscountEnabled={publicPricing?.yearlyDiscountEnabled !== false}
          />
        </section>

        <SectionDivider />

        <section id="flex" className="space-y-6 scroll-mt-8 rounded-xl border border-ordo-magenta/30 bg-ordo-magenta/5 p-6 md:p-8">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-ordo-magenta/90">Flex</p>
            <h2 className="text-2xl md:text-3xl font-semibold text-white">Pay for real activity each month</h2>
            <p className="text-base text-white/75 leading-relaxed max-w-3xl">
              Pay for real activity each month—or pay nothing when the team is quiet. No annual lock-in.
            </p>
          </div>
          <div className="space-y-3">
            <p className="text-sm uppercase tracking-wide text-white/60">First billable seat (monthly, EUR)</p>
            <p className="text-3xl md:text-4xl font-bold text-white">{firstSeatLabel} / month</p>
            <div className="max-w-3xl rounded-xl border border-ordo-violet/30 bg-white/[0.06] p-4 md:p-5 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ordo-yellow/90">
                Published EUR structure (per billable month)
              </p>
              <p className="text-base md:text-lg text-white/85 leading-relaxed">
                The base charge is <strong className="text-white">{firstSeatLabel}</strong> per month, which{" "}
                <strong className="text-white">includes the first billable user</strong>.
                {seatCurveDeclines ? (
                  <>
                    {" "}
                    The <strong className="text-white">second</strong> billable user adds{" "}
                    <strong className="text-white">{secondSeatMajor}</strong>. Each further billable user then pays a{" "}
                    <strong className="text-white">lower marginal amount</strong> on the curve until the per-seat
                    marginal reaches <strong className="text-white">{floorMajor}</strong> from the{" "}
                    <strong className="text-white">{ordinalEn(safeFloorAt)} billable user</strong> onward.
                  </>
                ) : (
                  <>
                    {" "}
                    Each billable user from the <strong className="text-white">second</strong> onward adds{" "}
                    <strong className="text-white">{secondSeatMajor}</strong> per month on the published curve.
                  </>
                )}{" "}
                Your invoice total is the <strong className="text-white">sum</strong> of those marginal amounts for
                everyone who was billable that month (see the calculator below for any seat count).
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 md:p-6 space-y-3 text-white/80 leading-relaxed">
            <h2 className="text-lg font-semibold text-white">Flex: only pay for what you use</h2>
            <p>
              Your invoice is driven by <strong className="text-white/90 font-medium">real activity</strong>, not how
              many accounts you have on paper. Someone only becomes a billable seat when they contribute in that
              calendar month—through show jobs, staffing, event team work, or logged work time. If a teammate is away
              for a month and does nothing billable, you do not pay for their seat that month. The amount for each
              billable person follows the <strong className="text-white/90 font-medium">published seat curve</strong>{" "}
              (see the calculator below for totals at different seat counts).
            </p>
            <p>
              That means costs rise when your season is busy and taper when things go quiet, without you having to
              remove users or downgrade plans by hand. You stay in control: use the product when you need it, and your
              bill reflects actual usage.
            </p>
            {(publicPricing?.billingTrialDays ?? 0) > 0 || (publicPricing?.billingGraceDaysAfterDue ?? 0) > 0 ? (
              <p className="text-sm text-white/55">
                {(publicPricing?.billingTrialDays ?? 0) > 0 ? (
                  <>
                    New workspaces may include a trial window from signup where unpaid invoices do not lock the
                    account.{" "}
                  </>
                ) : null}
                {(publicPricing?.billingGraceDaysAfterDue ?? 0) > 0 ? (
                  <>After an invoice due date, a short grace period may apply before read-only mode.</>
                ) : null}
              </p>
            ) : null}
          </div>
          <section className="space-y-4">
            <h3 className="text-xl md:text-2xl font-semibold text-white">How postpaid billing works</h3>
            <p className="text-white/75 leading-relaxed">
              Each billable member in a calendar month counts toward your seat total. Someone is billable if they had
              show jobs, staffing, event team activity, or work time that month. Your invoice uses the tier total on the
              published curve.
            </p>
            <ul className="list-disc pl-5 space-y-2 text-white/80 leading-relaxed marker:text-ordo-yellow">
              <li>Invoice generated on the 1st for the previous month</li>
              <li>Payment due within 7 days (automatic payment can be enabled)</li>
              <li>No credit card required to start; stop paying to stop using the product</li>
              <li>
                Unpaid after due date
                {(publicPricing?.billingGraceDaysAfterDue ?? 0) > 0
                  ? ` (plus ${publicPricing?.billingGraceDaysAfterDue}-day grace when configured)`
                  : ""}
                : account becomes view-only until paid
              </li>
            </ul>
          </section>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              asChild
              className="bg-gradient-to-r from-ordo-magenta via-ordo-orange to-ordo-violet text-white shadow-sm hover:opacity-95 border-0"
            >
              <Link to="/login">Get started free</Link>
            </Button>
            <Button asChild variant="outline" className="border-white/20 text-white bg-transparent hover:bg-white/5">
              <Link to="/">Learn more</Link>
            </Button>
          </div>
        </section>

        <SectionDivider />

        <section
          id="yearly"
          className="space-y-5 scroll-mt-8 rounded-xl border border-ordo-violet/30 bg-ordo-violet/5 p-6 md:p-8"
        >
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-ordo-violet/90">Yearly</p>
            <h2 className="text-2xl md:text-3xl font-semibold text-white">Commit once, get the deepest discount</h2>
            <p className="text-base text-white/75 leading-relaxed max-w-3xl">
              Commit to your seat count, pay once for the year, and get the deepest volume discount. Best when your
              roster is stable all season—contrast with Flex when headcount swings month to month.
            </p>
          </div>
          <ul className="list-disc pl-5 space-y-2 text-white/80 leading-relaxed marker:text-ordo-violet">
            <li>One annual invoice for committed seats (checkout in the app via Paddle)</li>
            <li>First seat at {fixedFirstSeat}/mo equivalent; seats 2+ at Flex marginals with volume discount</li>
            <li>Self-serve checkout up to {fixedPlan.selfServeMaxSeats} committed seats</li>
            <li>No free trial on Yearly—commit and pay at checkout</li>
          </ul>
          <Button
            asChild
            className="bg-gradient-to-r from-ordo-violet via-ordo-orange to-ordo-magenta text-white shadow-sm hover:opacity-95 border-0"
          >
            <Link to="/login">Sign in to choose Yearly</Link>
          </Button>
        </section>

        <SectionDivider />

        <section className="space-y-5 rounded-xl border border-ordo-yellow/25 bg-ordo-yellow/5 p-6 md:p-8">
          <h2 className="text-xl md:text-2xl font-semibold text-white">More seats than you committed?</h2>
          <p className="text-white/75 leading-relaxed max-w-3xl">
            Yearly plans cover committed seats for 12 months. When billable activity goes above that number:
          </p>
          <ul className="list-disc pl-5 space-y-3 text-white/80 leading-relaxed marker:text-ordo-yellow">
            <li>
              <strong className="text-white">Busy month:</strong> seats above commitment are invoiced monthly at Flex
              marginal rates for that month only.
            </li>
            <li>
              <strong className="text-white">Growing team:</strong> increase committed seats in billing with a prorated
              top-up for the rest of the term—you cannot reduce seats during the annual term.
            </li>
            <li>
              <strong className="text-white">150+ seats:</strong> contact Ordo Stage for enterprise pricing.
            </li>
          </ul>
        </section>

        <SectionDivider />

        {/* Good to know */}
        <section className="space-y-5 rounded-xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
          <h2 className="text-xl md:text-2xl font-semibold text-white">Good to know</h2>
          <ul className="list-disc pl-5 space-y-3 text-white/80 leading-relaxed marker:text-ordo-magenta">
            <li>You need at least one active user to keep your account editable.</li>
            <li>
              If an invoice is overdue after the grace period, your account switches to view-only mode
              until payment is completed.
            </li>
            <li>Invoice PDFs list each billed member for that month (one seat per billable member).</li>
          </ul>
          <p className="text-lg md:text-xl font-semibold leading-snug bg-gradient-to-r from-ordo-magenta via-ordo-yellow to-ordo-violet bg-clip-text text-transparent">
            Pay for what you use. Stop when you don't.
          </p>
        </section>

      </article>
    </div>
  );
}
