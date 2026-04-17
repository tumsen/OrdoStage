import { Link } from "react-router-dom";
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

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">OrdoStage Pricing</h1>
          <Link to="/" className="text-white/70 hover:text-white text-sm">Back</Link>
        </div>
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
