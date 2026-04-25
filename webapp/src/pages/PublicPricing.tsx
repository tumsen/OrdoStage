import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSiteContentLanguage } from "@/hooks/useSiteContentLanguage";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const REGION_TO_CURRENCY: Record<string, string> = {
  DK: "DKK",
  SE: "SEK",
  NO: "NOK",
  GB: "GBP",
  CH: "CHF",
  PL: "PLN",
  CZ: "CZK",
  HU: "HUF",
  RO: "RON",
  BG: "BGN",
  HR: "HRK",
  US: "USD",
};

const TIMEZONE_TO_CURRENCY: Array<{ prefix: string; currency: string }> = [
  { prefix: "Europe/Copenhagen", currency: "DKK" },
  { prefix: "Europe/Stockholm", currency: "SEK" },
  { prefix: "Europe/Oslo", currency: "NOK" },
  { prefix: "Europe/London", currency: "GBP" },
  { prefix: "Europe/Warsaw", currency: "PLN" },
  { prefix: "Europe/Prague", currency: "CZK" },
  { prefix: "Europe/Budapest", currency: "HUF" },
  { prefix: "Europe/Bucharest", currency: "RON" },
  { prefix: "Europe/Sofia", currency: "BGN" },
  { prefix: "Europe/Zagreb", currency: "HRK" },
  { prefix: "Europe/Zurich", currency: "CHF" },
  { prefix: "America/New_York", currency: "USD" },
  { prefix: "America/Chicago", currency: "USD" },
  { prefix: "America/Denver", currency: "USD" },
  { prefix: "America/Los_Angeles", currency: "USD" },
];

function detectUserCurrency(supported: string[], fallback: string): string {
  if (typeof Intl !== "undefined") {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const fromTz = TIMEZONE_TO_CURRENCY.find((row) => tz?.startsWith(row.prefix))?.currency;
      if (fromTz && supported.includes(fromTz)) return fromTz;
    } catch {
      // Ignore and continue with locale fallback.
    }
  }
  if (typeof navigator !== "undefined") {
    const locales = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
    for (const locale of locales) {
      const region = locale.split("-")[1]?.toUpperCase();
      if (region && REGION_TO_CURRENCY[region] && supported.includes(REGION_TO_CURRENCY[region])) {
        return REGION_TO_CURRENCY[region];
      }
    }
    for (const locale of locales) {
      const currencyFromLocale =
        locale.includes("en-US") ? "USD" : locale.includes("da-") ? "DKK" : locale.includes("sv-") ? "SEK" : locale.includes("nb-") || locale.includes("nn-") ? "NOK" : locale.includes("en-GB") ? "GBP" : "EUR";
      if (supported.includes(currencyFromLocale)) return currencyFromLocale;
    }
  }
  return supported.includes(fallback) ? fallback : supported[0] || "USD";
}

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
    prices: Array<{ currencyCode: string; userDailyRateCents: number }>;
  }>({
    queryKey: ["public-pricing-rates"],
    queryFn: () => api.get("/api/public/pricing"),
  });

  const supportedCurrencies = (publicPricing?.prices ?? []).map((p) => p.currencyCode);
  const userCurrency = detectUserCurrency(supportedCurrencies, publicPricing?.baseCurrencyCode || "USD");
  const selectedPriceCents =
    publicPricing?.prices.find((p) => p.currencyCode === userCurrency)?.userDailyRateCents ??
    publicPricing?.prices.find((p) => p.currencyCode === publicPricing?.baseCurrencyCode)?.userDailyRateCents ??
    0;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const perUserMonthlyCents = selectedPriceCents * daysInMonth;

  return (
    <div className="text-white">
      <article className="w-full px-6 py-14 md:py-20 space-y-10 md:space-y-12">

        {/* Hero */}
        <header className="space-y-6">
          <div className="space-y-1">
            <p className="text-sm uppercase tracking-wide text-white/60">Price per user</p>
            <p className="text-3xl md:text-4xl font-bold text-white">
              {userCurrency} {formatMajorFromCents(selectedPriceCents)} / day
            </p>
            <p className="text-lg md:text-xl text-white/80">
              {userCurrency} {formatMajorFromCents(perUserMonthlyCents)} / month
            </p>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold leading-tight tracking-tight">
            {pricingTitle}
          </h1>
          <p className="text-lg md:text-xl text-white/75 leading-relaxed">
            Monthly postpaid billing based on real usage days.
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

        {/* How billing works */}
        <section className="space-y-4">
          <h2 className="text-xl md:text-2xl font-semibold text-white">How postpaid billing works</h2>
          <p className="text-white/75 leading-relaxed">
            Every active user contributes usage days. We total those usage days for the month and bill
            based on your actual usage.
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
            <li>Detailed invoice breakdowns can include per-user consumed days.</li>
          </ul>
          <p className="text-lg md:text-xl font-semibold leading-snug bg-gradient-to-r from-ordo-magenta via-ordo-yellow to-ordo-violet bg-clip-text text-transparent">
            Pay for what you use. Stop when you don't.
          </p>
        </section>

      </article>
    </div>
  );
}
