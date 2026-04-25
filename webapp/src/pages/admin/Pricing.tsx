import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Pricing() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    paymentDueDays: "7",
  });
  const [currencyPrices, setCurrencyPrices] = useState<Record<string, string>>({});

  const { data, isPending } = useQuery<{
    paymentDueDays: number;
    currencyPrices: Array<{ currencyCode: string; userDailyRateCents: number }>;
    supportedCurrencies: string[];
  }>({
    queryKey: ["admin", "billing-settings"],
    queryFn: () => api.get("/api/admin/billing/settings"),
  });

  useEffect(() => {
    if (!data) return;
    const priceMap: Record<string, string> = {};
    for (const currency of data.supportedCurrencies) {
      const found = data.currencyPrices.find((p) => p.currencyCode === currency);
      priceMap[currency] = String(found?.userDailyRateCents ?? "");
    }
    setCurrencyPrices(priceMap);
    setForm({
      paymentDueDays: String(data.paymentDueDays),
    });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch("/api/admin/billing/settings", {
        paymentDueDays: Number(form.paymentDueDays),
        currencyPrices: Object.entries(currencyPrices)
          .filter(([, v]) => v.trim().length > 0)
          .map(([currencyCode, value]) => ({
            currencyCode,
            userDailyRateCents: Number(value),
          })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "billing-settings"] });
      toast({ title: "Saved", description: "Default billing settings updated." });
    },
    onError: (err) => {
      const msg = isApiError(err) ? err.message : "Failed to save settings.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const snapshotMutation = useMutation({
    mutationFn: () => api.post("/api/admin/billing/snapshot"),
    onSuccess: () => {
      toast({ title: "Snapshot completed", description: "Daily usage snapshots updated." });
    },
  });

  const invoiceMutation = useMutation({
    mutationFn: () => api.post("/api/admin/billing/generate-invoices"),
    onSuccess: () => {
      toast({ title: "Invoices generated", description: "Monthly invoice generation finished." });
    },
  });

  return (
    <div className="p-6 space-y-4">
      <Card className="bg-gray-900 border border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Global currency pricing</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(data?.supportedCurrencies ?? []).map((currency) => (
            <div key={currency} className="space-y-1">
              <p className="text-xs text-white/50">Daily user rate ({currency}, minor units)</p>
              <Input
                value={currencyPrices[currency] ?? ""}
                onChange={(e) => setCurrencyPrices((prev) => ({ ...prev, [currency]: e.target.value }))}
              />
            </div>
          ))}
          <div className="space-y-1">
            <p className="text-xs text-white/50">Invoice due days</p>
            <Input value={form.paymentDueDays} onChange={(e) => setForm((p) => ({ ...p, paymentDueDays: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || isPending}>
              {saveMutation.isPending ? "Saving..." : "Save settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Billing operations</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => snapshotMutation.mutate()} disabled={snapshotMutation.isPending}>
            {snapshotMutation.isPending ? "Running..." : "Run daily usage snapshot"}
          </Button>
          <Button variant="outline" onClick={() => invoiceMutation.mutate()} disabled={invoiceMutation.isPending}>
            {invoiceMutation.isPending ? "Running..." : "Generate previous month invoices"}
          </Button>
        </CardContent>
      </Card>

      <p className="text-xs text-white/50">
        This is the global postpaid default model. Organizations can still override these defaults on their org detail page.
      </p>
    </div>
  );
}
