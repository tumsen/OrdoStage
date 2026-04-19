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

  const defaultDeactivateCredits = siteMeta?.person_deactivate_credit_default ?? "20";
  const signupCredits = siteMeta?.signup_credits?.trim() || "30";

  return (
    <div className="text-white">
      <div className="max-w-6xl mx-auto px-6 py-12 md:py-16 space-y-10">
        <header className="max-w-3xl space-y-5">
          <h1 className="text-2xl md:text-3xl font-bold leading-tight tracking-tight">
            Simple pricing that grows with your team
          </h1>
          <div className="space-y-4 text-white/80 leading-relaxed">
            <p>No subscriptions, no surprises. Just credits — buy a pack and use them as you need.</p>
            <p>
              When you create an account, you get{" "}
              <strong className="text-white font-semibold">{signupCredits} credits</strong> free to test the system.
            </p>
            <p>
              You can also enable <strong className="text-white font-semibold">automatic top-up</strong> under Billing in
              your organisation: choose a credit pack and a balance threshold. When credits fall to that level, we open a
              checkout so you can refill before work stops — a simple way to keep credits on the account without watching
              the balance every day.
            </p>
            <p>
              Every active user costs <strong className="text-white font-semibold">1 credit per day</strong>. Add as many
              people as your project needs, and only pay for who&apos;s actually active.
            </p>
            <p>
              Need to pause someone? Deactivating a user costs{" "}
              <strong className="text-white font-semibold">{defaultDeactivateCredits} credits</strong>. Their info stays
              safe, and bringing them back is completely free.
            </p>
            <p>
              Want to remove someone entirely? Deleting a user is free — though keep in mind it permanently removes them
              and all their data.
            </p>
          </div>
        </header>

        <section className="max-w-3xl rounded-xl border border-white/10 bg-white/[0.02] p-6 md:p-8 space-y-4">
          <h2 className="text-lg font-semibold text-white">A couple of things to keep in mind</h2>
          <ul className="list-disc pl-5 space-y-3 text-white/80 leading-relaxed marker:text-ordo-yellow">
            <li>You&apos;ll need at least one active user to keep your account editable.</li>
            <li>
              If your balance dips to <strong className="text-white font-semibold">−30 credits</strong>, your account
              switches to view-only mode. Top it up within{" "}
              <strong className="text-white font-semibold">30 days</strong> and everything goes back to normal — wait
              longer and the account may be permanently deleted.
            </li>
          </ul>
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
