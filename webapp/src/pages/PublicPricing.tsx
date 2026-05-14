import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSiteContentLanguage } from "@/hooks/useSiteContentLanguage";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { TieredSeatPricingCalculator } from "@/components/pricing/TieredSeatPricingCalculator";
import { SeatTierIntroBlurb } from "@/components/pricing/SeatTierIntroBlurb";
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
    siteMeta?.pricing_page_title?.trim() || "Postpaid pricing that scales with usage";

  const { data: publicPricing } = useQuery<{
    baseCurrencyCode: string;
    yearlyDiscountPercent?: number;
    yearlyDiscountEnabled?: boolean;
    defaultSeatCalculatorJson?: string | null;
    billingTrialDays?: number;
    billingGraceDaysAfterDue?: number;
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

  /** API field name is legacy; value is updated from the first-seat tier when a global curve is saved. */
  const eurPerUserMonthCents =
    publicPricing?.prices.find((p) => p.currencyCode === "EUR")?.userDailyRateCents ?? 0;

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

  return (
    <div className="text-white">
      <article className="w-full px-6 py-14 md:py-20 space-y-10 md:space-y-12">

        {/* Hero */}
        <header className="space-y-6">
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
            <p className="text-sm text-white/50 max-w-3xl leading-relaxed">
              The large figure above is the first-seat portion only. The published EUR row in billing (
              {formatEuroMajor((eurPerUserMonthCents || 0) / 100)}) tracks that first-seat rate for legacy summaries.
            </p>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold leading-tight tracking-tight">
            {pricingTitle}
          </h1>
          <p className="text-lg md:text-xl text-white/75 leading-relaxed">
            Monthly postpaid billing in euros: only members with billable activity in a month are charged for that
            month, and <strong className="text-white/90 font-medium">your invoice total is the sum of marginal seat prices
            along the published curve</strong> for however many billable people you had—not a single per-user flat rate.
          </p>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 md:p-6 space-y-3 text-white/80 leading-relaxed">
            <h2 className="text-lg font-semibold text-white">Only pay for what you use</h2>
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
        </header>

        {/* Illustrative seat curve — matches OrdoStage marketing styling */}
        <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
          <div className="space-y-1">
            <h2 className="text-xl md:text-2xl font-semibold text-white">Pricing calculator</h2>
            <p className="text-sm text-white/60 leading-relaxed">
              Move the seat slider to estimate the <strong className="text-white/75 font-medium">monthly invoice total
              </strong> the same tier structure would produce—the curve below is what billing uses (unless your
              organization has a fixed per-seat override).{" "}
              <SeatTierIntroBlurb model={publicSeatModel} compact className="inline text-sm text-white/60" />
            </p>
          </div>
          <TieredSeatPricingCalculator
            seatModel={publicSeatModel}
            yearlyDiscountPercent={publicPricing?.yearlyDiscountPercent ?? 15}
            yearlyDiscountEnabled={publicPricing?.yearlyDiscountEnabled !== false}
          />
        </section>

        {/* How billing works */}
        <section className="space-y-4">
          <h2 className="text-xl md:text-2xl font-semibold text-white">How postpaid billing works</h2>
          <p className="text-white/75 leading-relaxed">
            Each billable member in a calendar month counts toward your seat total for that month. Someone is billable
            if they had assigned show jobs, show staffing, event team activity (notes or documents they created), or
            work time entries in that month. Your invoice uses the <strong className="text-white/90 font-medium">tier
            total for that seat count on the published curve</strong>—the sum of 1st-seat, 2nd-seat, and further marginal
            amounts—unless your organization has a fixed per-seat override from Ordo Stage.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-white/80 leading-relaxed marker:text-ordo-yellow">
            <li>Invoice generated on the 1st for the previous month</li>
            <li>Payment is due within 7 days (automatic payment can be enabled)</li>
            <li>No credit card is required to start</li>
            <li>If you do not want to continue, simply stop paying</li>
            <li>If a negative balance remains unpaid for 30 days, the account may be permanently deleted</li>
            <li>
              If unpaid after the due date
              {(publicPricing?.billingGraceDaysAfterDue ?? 0) > 0
                ? ` (plus a ${publicPricing?.billingGraceDaysAfterDue}-day grace period when configured)`
                : ""}
              , the organization switches to view-only
            </li>
            <li>Full access is restored automatically after payment</li>
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
