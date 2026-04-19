import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";

interface BillingPack {
  id: string;
  packId: string;
  days: number;
  label: string;
  amountCents: number;
  active: boolean;
}

export default function PublicPricing() {
  const { data: packs } = useQuery({
    queryKey: ["public-pricing", "packs"],
    queryFn: () => api.get<BillingPack[]>("/api/billing/packs"),
  });

  const { data: siteMeta } = useQuery({
    queryKey: ["site-content-public"],
    queryFn: () => api.get<Record<string, string>>("/api/site-content"),
  });

  const signupCredits = siteMeta?.signup_credits?.trim() || "30";
  const pricingTitle = siteMeta?.pricing_page_title?.trim() || "Simple pricing that grows with your team";
  const pricingIntro =
    siteMeta?.pricing_intro?.trim() ||
    [
      "No subscriptions, no surprises. Just credits — buy a pack and use them as you need.",
      `When you create an account, you get ${signupCredits} credits free to test the system.`,
      "You can also enable automatic top-up under Billing in your organisation: choose a credit pack and a balance threshold. When credits fall to that level, we open a checkout so you can refill before work stops — a simple way to keep credits on the account without watching the balance every day.",
    ].join("\n\n");
  const pricingNotes =
    siteMeta?.pricing_notes?.trim() ||
    [
      "You'll need at least one active user to keep your account editable.",
      "If your balance dips to −30 credits, your account switches to view-only mode. Top it up within 30 days and everything goes back to normal — wait longer and the account may be permanently deleted.",
    ].join("\n");

  return (
    <div className="text-white">
      <div className="max-w-6xl mx-auto px-6 py-12 md:py-16 space-y-10">
        <header className="max-w-3xl space-y-5">
          <h1 className="text-2xl md:text-3xl font-bold leading-tight tracking-tight">{pricingTitle}</h1>
          <div className="space-y-4 text-white/80 leading-relaxed whitespace-pre-wrap">{pricingIntro}</div>
        </header>

        <section className="max-w-3xl rounded-xl border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-4">
          <h2 className="text-lg font-semibold text-white">A couple of things to keep in mind</h2>
          <div className="text-white/80 leading-relaxed whitespace-pre-wrap">{pricingNotes}</div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Credit packs</h2>
          <p className="text-sm text-white/50">
            Choose a pack below. Prices shown when packs are available from your organisation&apos;s billing setup.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {(packs ?? []).map((pack) => (
              <Card key={pack.packId} className="bg-white/[0.03] border-white/10">
                <CardContent className="p-5">
                  <div className="text-sm text-white/50">{pack.label}</div>
                  <div className="mt-2 text-3xl font-bold">{pack.days}</div>
                  <div className="text-xs text-white/50">credit days</div>
                  <div className="mt-4 text-xl font-semibold text-ordo-yellow">
                    EUR {(pack.amountCents / 100).toFixed(2)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
