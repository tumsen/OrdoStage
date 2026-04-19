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

  return (
    <div className="text-white">
      <div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
        <p className="text-sm text-white/45 max-w-2xl mb-8">
          Deactivating a contact in your organisation uses credits (default{" "}
          <strong className="text-white/70">{defaultDeactivateCredits}</strong> credits; organisation owners can change
          this under Billing). Reactivating a contact is free.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {(packs ?? []).map((pack) => (
            <Card key={pack.packId} className="bg-white/[0.03] border-white/10">
              <CardContent className="p-5">
                <div className="text-sm text-white/50">{pack.label}</div>
                <div className="mt-2 text-3xl font-bold">{pack.days}</div>
                <div className="text-xs text-white/50">credit days</div>
                <div className="mt-4 text-xl font-semibold text-rose-300">
                  EUR {(pack.amountCents / 100).toFixed(2)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
