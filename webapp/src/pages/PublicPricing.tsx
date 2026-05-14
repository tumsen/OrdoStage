import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSiteContentLanguage } from "@/hooks/useSiteContentLanguage";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { TieredSeatPricingCalculator } from "@/components/pricing/TieredSeatPricingCalculator";

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

  /** API field name is legacy; value is per-user monthly price in cents. */
  const eurPerUserMonthCents =
    publicPricing?.prices.find((p) => p.currencyCode === "EUR")?.userDailyRateCents ?? 0;

  return (
    <div className="text-white">
      <article className="w-full px-6 py-14 md:py-20 space-y-10 md:space-y-12">

        {/* Hero */}
        <header className="space-y-6">
          <div className="space-y-1">
            <p className="text-sm uppercase tracking-wide text-white/60">Price per billable user</p>
            <p className="text-3xl md:text-4xl font-bold text-white">
              EUR {formatMajorFromCents(eurPerUserMonthCents)} / month
            </p>
            <p className="text-lg md:text-xl text-white/80">
              Full month when someone has jobs, event work, or logged work time in that month.
            </p>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold leading-tight tracking-tight">
            {pricingTitle}
          </h1>
          <p className="text-lg md:text-xl text-white/75 leading-relaxed">
            Monthly postpaid billing in euros: only members with billable activity in a month are charged for that month.
          </p>
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
              Estimates use an illustrative tiered EUR model. Real invoices use the flat per-seat monthly rate for each
              member who had assigned jobs, show staffing, event edits, or work time entries in that calendar month.
            </p>
          </div>
          <TieredSeatPricingCalculator
            yearlyDiscountPercent={publicPricing?.yearlyDiscountPercent ?? 15}
            yearlyDiscountEnabled={publicPricing?.yearlyDiscountEnabled ?? true}
          />
        </section>

        {/* How billing works */}
        <section className="space-y-4">
          <h2 className="text-xl md:text-2xl font-semibold text-white">How postpaid billing works</h2>
          <p className="text-white/75 leading-relaxed">
            Each billable member in a calendar month is charged one full seat for that month. Someone is billable if they
            had assigned show jobs, show staffing, event team activity (notes or documents they created), or work time
            entries in that month.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-white/80 leading-relaxed marker:text-ordo-yellow">
            <li>Invoice generated on the 1st for the previous month</li>
            <li>Payment is due within 7 days (automatic payment can be enabled)</li>
            <li>No credit card is required to start</li>
            <li>If you do not want to continue, simply stop paying</li>
            <li>If a negative balance remains unpaid for 30 days, the account may be permanently deleted</li>
            <li>If unpaid after due date, organization switches to view-only</li>
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
