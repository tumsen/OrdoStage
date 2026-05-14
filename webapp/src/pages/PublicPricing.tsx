import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSiteContentLanguage } from "@/hooks/useSiteContentLanguage";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { TieredSeatPricingCalculator } from "@/components/pricing/TieredSeatPricingCalculator";
import { parseSeatCalculatorJson } from "@/lib/seatCalculatorJson";
import { DEFAULT_TIERED_SEAT_MODEL, type TieredSeatModel } from "@/lib/tieredSeatPricing";

function formatMajorFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

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

  return (
    <div className="text-white">
      <article className="w-full px-6 py-14 md:py-20 space-y-10 md:space-y-12">

        {/* Hero */}
        <header className="space-y-6">
          <div className="space-y-1">
            <p className="text-sm uppercase tracking-wide text-white/60">Starting platform fee (1 billable seat)</p>
            <p className="text-3xl md:text-4xl font-bold text-white">
              EUR {formatMajorFromCents(eurPerUserMonthCents)} / month
            </p>
            <p className="text-lg md:text-xl text-white/80">
              Total invoice scales with the number of billable members using the published seat curve (see calculator
              below).
            </p>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold leading-tight tracking-tight">
            {pricingTitle}
          </h1>
          <p className="text-lg md:text-xl text-white/75 leading-relaxed">
            Monthly postpaid billing in euros: only members with billable activity in a month are charged for that month.
          </p>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 md:p-6 space-y-3 text-white/80 leading-relaxed">
            <h2 className="text-lg font-semibold text-white">Only pay for what you use</h2>
            <p>
              Your invoice is driven by <strong className="text-white/90 font-medium">real activity</strong>, not how
              many accounts you have on paper. Someone only becomes a billable seat when they contribute in that
              calendar month—through show jobs, staffing, event team work, or logged work time. If a teammate is away
              for a month and does nothing billable, you do not pay for their seat that month.
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
              Move the seat slider to estimate your monthly total. When Ordo Stage has published a global curve, it
              matches what postpaid invoicing uses (unless your workspace has a custom curve or flat override).
            </p>
          </div>
          <TieredSeatPricingCalculator
            seatModel={publicSeatModel}
            yearlyDiscountPercent={publicPricing?.yearlyDiscountPercent ?? 15}
            yearlyDiscountEnabled={publicPricing?.yearlyDiscountEnabled ?? true}
          />
        </section>

        {/* How billing works */}
        <section className="space-y-4">
          <h2 className="text-xl md:text-2xl font-semibold text-white">How postpaid billing works</h2>
          <p className="text-white/75 leading-relaxed">
            Each billable member in a calendar month counts toward your seat total for that month. Someone is billable
            if they had assigned show jobs, show staffing, event team activity (notes or documents they created), or
            work time entries in that month. Invoices use the tier total for that seat count unless your organization
            has a fixed per-seat override from Ordo Stage.
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
