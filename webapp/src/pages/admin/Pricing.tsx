import { useCallback, useEffect, useState } from "react";
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
  const [fxRates, setFxRates] = useState<Record<string, number>>({});
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);
  const [fxUpdatedAt, setFxUpdatedAt] = useState<string | null>(null);

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

  const fetchUsdRates = useCallback(async () => {
    setFxLoading(true);
    setFxError(null);
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { rates?: Record<string, number>; time_last_update_utc?: string };
      if (!json.rates) throw new Error("No rates in response");
      setFxRates(json.rates);
      setFxUpdatedAt(json.time_last_update_utc ?? null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to fetch rates.";
      setFxError(msg);
    } finally {
      setFxLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsdRates().catch(() => {});
  }, [fetchUsdRates]);

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
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-white/60">
              Standard currency: <span className="text-white font-medium">USD</span>. One row per currency.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => fetchUsdRates()} disabled={fxLoading}>
                {fxLoading ? "Loading rates..." : "Refresh USD rates"}
              </Button>
              {fxUpdatedAt ? <span className="text-[11px] text-white/45">Updated: {fxUpdatedAt}</span> : null}
            </div>
          </div>

          {fxError ? <p className="text-xs text-red-300">Rate lookup failed: {fxError}</p> : null}

          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-3 text-xs text-white/45 px-1">
              <p className="col-span-2">Currency</p>
              <p className="col-span-4">Daily user rate (minor units)</p>
              <p className="col-span-3">FX rate (1 USD {"->"} currency)</p>
              <p className="col-span-3">Converted from USD rate</p>
            </div>
            {(data?.supportedCurrencies ?? []).map((currency) => {
              const usdRateCents = Number(currencyPrices.USD || "0");
              const fxRate = currency === "USD" ? 1 : fxRates[currency];
              const converted = Number.isFinite(usdRateCents) && fxRate ? Math.round(usdRateCents * fxRate) : null;
              return (
                <div key={currency} className="grid grid-cols-12 gap-3 items-center">
                  <p className="col-span-2 text-sm text-white font-medium">{currency}</p>
                  <Input
                    className="col-span-4"
                    value={currencyPrices[currency] ?? ""}
                    onChange={(e) => setCurrencyPrices((prev) => ({ ...prev, [currency]: e.target.value }))}
                  />
                  <Input className="col-span-3" value={fxRate ? fxRate.toFixed(6) : ""} readOnly />
                  <Input className="col-span-3" value={converted != null ? String(converted) : ""} readOnly />
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="space-y-1">
              <p className="text-xs text-white/50">Invoice due days</p>
              <Input value={form.paymentDueDays} onChange={(e) => setForm((p) => ({ ...p, paymentDueDays: e.target.value }))} />
            </div>
            <div className="flex items-end">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || isPending}>
                {saveMutation.isPending ? "Saving..." : "Save settings"}
              </Button>
            </div>
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
