import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type CurrencyRow = {
  userDailyRateCents: string;
  nextMonthUserDailyRateCents: string;
};
const BASE_CURRENCY = "USD";
const CURRENCY_COUNTRY_LABELS: Record<string, string> = {
  USD: "United States",
  EUR: "Eurozone",
  DKK: "Denmark",
  SEK: "Sweden",
  NOK: "Norway",
  GBP: "United Kingdom",
  CHF: "Switzerland",
  PLN: "Poland",
  CZK: "Czech Republic",
  HUF: "Hungary",
  RON: "Romania",
  BGN: "Bulgaria",
  HRK: "Croatia",
};

function calculateBaseComparison(rows: Record<string, CurrencyRow>, rates: Record<string, number>): Record<string, number | null> {
  const base = Number(rows[BASE_CURRENCY]?.userDailyRateCents ?? "0");
  const calculated: Record<string, number | null> = {};
  if (!Number.isFinite(base) || base <= 0) return calculated;
  for (const currency of Object.keys(rows)) {
    if (currency === BASE_CURRENCY) continue;
    const fx = rates[currency];
    if (!fx || !Number.isFinite(fx)) continue;
    calculated[currency] = Math.max(Math.round(base * fx), 1);
  }
  return calculated;
}


export default function Pricing() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    paymentDueDays: "7",
  });
  const [currencyRows, setCurrencyRows] = useState<Record<string, CurrencyRow>>({});
  const [fxRates, setFxRates] = useState<Record<string, number>>({});
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);
  const [fxUpdatedAt, setFxUpdatedAt] = useState<string | null>(null); // Provider update time
  const [fxRefreshedAt, setFxRefreshedAt] = useState<string | null>(null); // Local fetch time

  const { data, isPending } = useQuery<{
    paymentDueDays: number;
    currencyPrices: Array<{
      currencyCode: string;
      userDailyRateCents: number;
      nextMonthUserDailyRateCents?: number | null;
    }>;
    supportedCurrencies: string[];
  }>({
    queryKey: ["admin", "billing-settings"],
    queryFn: () => api.get("/api/admin/billing/settings"),
  });

  useEffect(() => {
    if (!data) return;
    const rowMap: Record<string, CurrencyRow> = {};
    for (const currency of data.supportedCurrencies) {
      const found = data.currencyPrices.find((p) => p.currencyCode === currency);
      rowMap[currency] = {
        userDailyRateCents: String(found?.userDailyRateCents ?? ""),
        nextMonthUserDailyRateCents: found?.nextMonthUserDailyRateCents != null ? String(found.nextMonthUserDailyRateCents) : "",
      };
    }
    setCurrencyRows(rowMap);
    setForm({
      paymentDueDays: String(data.paymentDueDays),
    });
  }, [data]);

  const fetchUsdRates = useCallback(async () => {
    setFxLoading(true);
    setFxError(null);
    try {
      const data = await api.get<{ base: string; rates: Record<string, number>; updatedAt?: string | null }>(
        `/api/admin/billing/fx-rates?base=USD&t=${Date.now()}`
      );
      if (!data.rates) throw new Error("No rates in response");
      setFxRates(data.rates);
      setFxUpdatedAt(data.updatedAt ?? null);
      setFxRefreshedAt(new Date().toISOString());
      toast({ title: "USD rates refreshed" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to fetch rates.";
      setFxError(msg);
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setFxLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUsdRates().catch(() => {});
  }, [fetchUsdRates]);

  useEffect(() => {
    const id = setInterval(() => {
      fetchUsdRates().catch(() => {});
    }, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchUsdRates]);
  const calculatedRows = calculateBaseComparison(currencyRows, fxRates);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch("/api/admin/billing/settings", {
        paymentDueDays: Number(form.paymentDueDays),
        currencyPrices: Object.entries(currencyRows)
          .filter(([, row]) => row.userDailyRateCents.trim().length > 0)
          .map(([currencyCode, row]) => ({
            currencyCode,
            userDailyRateCents: Number(row.userDailyRateCents),
            nextMonthUserDailyRateCents:
              row.nextMonthUserDailyRateCents.trim().length > 0 ? Number(row.nextMonthUserDailyRateCents) : null,
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
              Manual prices per currency with compact fields. Base currency is <span className="text-white font-medium">{BASE_CURRENCY}</span>.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => fetchUsdRates()} disabled={fxLoading}>
                {fxLoading ? "Loading rates..." : "Refresh USD rates"}
              </Button>
              {fxRefreshedAt ? (
                <span className="text-[11px] text-white/45">Checked: {new Date(fxRefreshedAt).toLocaleString()}</span>
              ) : null}
              {fxUpdatedAt ? <span className="text-[11px] text-white/45">Provider: {fxUpdatedAt}</span> : null}
            </div>
          </div>

          {fxError ? <p className="text-xs text-red-300">Rate lookup failed: {fxError}</p> : null}

          <div className="space-y-2 overflow-x-auto">
            <div className="grid min-w-[760px] grid-cols-12 gap-2 text-xs text-white/45 px-1 whitespace-nowrap">
              <p className="col-span-4">Currency / Country</p>
              <p className="col-span-2">Current</p>
              <p className="col-span-2">Next month</p>
              <p className="col-span-2">Base calculation</p>
            </div>
            {(data?.supportedCurrencies ?? []).map((currency) => {
              const row = currencyRows[currency] ?? {
                userDailyRateCents: "",
                nextMonthUserDailyRateCents: "",
              };
              const calculatedValue =
                currency === BASE_CURRENCY
                  ? row.userDailyRateCents || ""
                  : calculatedRows[currency] != null
                    ? String(calculatedRows[currency])
                    : "";
              const rateLabel =
                currency === BASE_CURRENCY ? "1.000000" : fxRates[currency] != null ? fxRates[currency].toFixed(6) : "-";
              return (
                <div key={currency} className="grid min-w-[760px] grid-cols-12 gap-2 items-center whitespace-nowrap">
                  <div className="col-span-4">
                    <p className="text-xs text-white font-medium">
                      {currency} - {CURRENCY_COUNTRY_LABELS[currency] ?? "Other"}
                    </p>
                  </div>
                  <Input
                    className="col-span-2 h-7 text-xs px-2"
                    value={row.userDailyRateCents}
                    onChange={(e) =>
                      setCurrencyRows((prev) => ({
                        ...prev,
                        [currency]: { ...row, userDailyRateCents: e.target.value },
                      }))
                    }
                  />
                  <Input
                    className="col-span-2 h-7 text-xs px-2"
                    value={row.nextMonthUserDailyRateCents}
                    onChange={(e) =>
                      setCurrencyRows((prev) => ({
                        ...prev,
                        [currency]: { ...row, nextMonthUserDailyRateCents: e.target.value },
                      }))
                    }
                  />
                  <Input
                    className="col-span-2 h-7 text-xs px-2"
                    value={calculatedValue ? rateLabel : "-"}
                    readOnly
                  />
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
