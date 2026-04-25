import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSiteContentLanguage } from "@/hooks/useSiteContentLanguage";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

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

  return (
    <div className="text-white">
      <article className="w-full px-6 py-14 md:py-20 space-y-10 md:space-y-12">

        {/* Hero */}
        <header className="space-y-6">
          <h1 className="text-3xl md:text-4xl font-bold leading-tight tracking-tight">
            {pricingTitle}
          </h1>
          <p className="text-lg md:text-xl text-white/75 leading-relaxed">
            Monthly postpaid billing based on real usage days.
          </p>
          <p className="rounded-xl border border-ordo-yellow/35 bg-gradient-to-br from-ordo-magenta/[0.12] to-ordo-violet/[0.08] px-4 py-4 text-[15px] leading-relaxed text-white/90 md:text-base">
            Invoices are issued on the first day of each month for previous-month usage, with a 7-day payment window.
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
            according to your plan and any agreed discount or flat-rate terms.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-white/80 leading-relaxed marker:text-ordo-yellow">
            <li>Invoice generated on the 1st for the previous month</li>
            <li>Payment due within 7 days</li>
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
