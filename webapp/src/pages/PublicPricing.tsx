import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useSiteContentLanguage } from "@/hooks/useSiteContentLanguage";

interface BillingPack {
  id: string;
  packId: string;
  days: number;
  label: string;
  amountCents: number;
  active: boolean;
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
  const { data: packs } = useQuery({
    queryKey: ["public-pricing", "packs"],
    queryFn: () => api.get<BillingPack[]>("/api/billing/packs"),
  });

  const { data: siteMeta } = useQuery({
    queryKey: ["site-content-public", siteLang],
    queryFn: () => api.get<Record<string, string>>(`/api/site-content?language=${encodeURIComponent(siteLang)}`),
  });

  const signupCredits = siteMeta?.signup_credits?.trim() || "30";
  const pricingTitle =
    siteMeta?.pricing_page_title?.trim() || "Simple pricing that grows with your team";

  return (
    <div className="text-white">
      <article className="max-w-4xl mx-auto px-6 py-14 md:py-20 space-y-10 md:space-y-12">

        {/* Hero */}
        <header className="space-y-6">
          <h1 className="text-3xl md:text-4xl font-bold leading-tight tracking-tight">
            {pricingTitle}
          </h1>
          <p className="text-lg md:text-xl text-white/75 leading-relaxed">
            No subscriptions, no surprises. Just credits — buy a pack and use them as you need.
          </p>
          <p className="rounded-xl border border-ordo-yellow/35 bg-gradient-to-br from-ordo-magenta/[0.12] to-ordo-violet/[0.08] px-4 py-4 text-[15px] leading-relaxed text-white/90 md:text-base">
            <span className="font-semibold text-ordo-yellow">{signupCredits} free credits</span> when
            you create your organisation — enough to try the full platform before buying a pack.
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

        {/* How credits work */}
        <section className="space-y-4">
          <h2 className="text-xl md:text-2xl font-semibold text-white">How credits work</h2>
          <p className="text-white/75 leading-relaxed">
            Credits are the currency of Ordo Stage. Every active user in your organisation costs{" "}
            <strong className="text-white/90">1 credit per day</strong>. Add as many people as your
            project needs — you only pay for who's actually active.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-white/80 leading-relaxed marker:text-ordo-yellow">
            <li>Buy a pack once — credits don't expire until you use them</li>
            <li>Deactivate someone when they're between productions</li>
            <li>Reactivate for free whenever they're needed again</li>
            <li>No monthly fee, no per-seat subscriptions</li>
          </ul>
        </section>

        <SectionDivider />

        {/* Credit packs */}
        <section className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl md:text-2xl font-semibold text-white">Credit packs</h2>
            <p className="text-white/60 leading-relaxed">
              Pick the pack that fits your production size. Bigger packs work out cheaper per day.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {(packs ?? []).map((pack) => {
              const euros = (pack.amountCents / 100).toFixed(2);
              const perDay = pack.days > 0
                ? (pack.amountCents / 100 / pack.days).toFixed(3)
                : null;
              return (
                <div
                  key={pack.packId}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-6 space-y-3 hover:border-ordo-yellow/30 hover:bg-white/[0.05] transition-colors"
                >
                  <div className="text-sm font-medium text-white/50 uppercase tracking-wide">
                    {pack.label}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">{pack.days}</span>
                    <span className="text-sm text-white/45">days</span>
                  </div>
                  <div className="pt-1 border-t border-white/8 flex items-baseline justify-between">
                    <span className="text-xl font-semibold text-ordo-yellow">€{euros}</span>
                    {perDay ? (
                      <span className="text-xs text-white/35">€{perDay}/day</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          {(!packs || packs.length === 0) && (
            <p className="text-white/30 text-sm">
              Pricing packs are configured by your administrator.
            </p>
          )}
        </section>

        <SectionDivider />

        {/* Auto top-up */}
        <section className="space-y-4">
          <h2 className="text-xl md:text-2xl font-semibold text-white">Automatic top-up</h2>
          <p className="text-white/75 leading-relaxed">
            Set a threshold under Billing in your organisation. When your balance drops to that
            level, Ordo Stage opens a checkout so you can refill before work stops — a simple way
            to keep productions running without watching the balance every day.
          </p>
        </section>

        <SectionDivider />

        {/* Good to know */}
        <section className="space-y-5 rounded-xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
          <h2 className="text-xl md:text-2xl font-semibold text-white">Good to know</h2>
          <ul className="list-disc pl-5 space-y-3 text-white/80 leading-relaxed marker:text-ordo-magenta">
            <li>You need at least one active user to keep your account editable.</li>
            <li>
              If your balance reaches{" "}
              <strong className="text-white/90">−30 credits</strong>, your account switches to
              view-only mode. Top up within <strong className="text-white/90">30 days</strong> and
              everything goes back to normal — wait longer and the account may be permanently deleted.
            </li>
            <li>Credits are non-refundable once purchased (see Terms of Service for details).</li>
          </ul>
          <p className="text-lg md:text-xl font-semibold leading-snug bg-gradient-to-r from-ordo-magenta via-ordo-yellow to-ordo-violet bg-clip-text text-transparent">
            Pay for what you use. Stop when you don't.
          </p>
        </section>

      </article>
    </div>
  );
}
