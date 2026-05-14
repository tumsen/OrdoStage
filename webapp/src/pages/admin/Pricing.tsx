import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TieredSeatPricingCalculator } from "@/components/pricing/TieredSeatPricingCalculator";

type CurrencyRow = {
  userDailyRateCents: string; // major units input (e.g. "5" means 5.00)
  nextMonthUserDailyRateCents: string; // major units input
};
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

function formatEditableMajorFromCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "";
  const major = cents / 100;
  const fixed = major.toFixed(2);
  return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function majorToCents(value: string): number {
  const normalized = value.trim().replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(1, Math.round(parsed * 100));
}

function calculateBaseComparison(
  rows: Record<string, CurrencyRow>,
  rates: Record<string, number>,
  baseCurrency: string
): Record<string, number> {
  const baseMajor = Number((rows[baseCurrency]?.userDailyRateCents ?? "0").replace(",", "."));
  const calculated: Record<string, number> = {};
  if (!Number.isFinite(baseMajor) || baseMajor <= 0) return calculated;
  for (const currency of Object.keys(rows)) {
    if (currency === baseCurrency) continue;
    const fx = rates[currency];
    if (!fx || !Number.isFinite(fx)) continue;
    calculated[currency] = Math.max(baseMajor * fx, 0);
  }
  return calculated;
}


export default function Pricing() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    paymentDueDays: "7",
    baseCurrencyCode: "USD",
    yearlyDiscountPercent: "15",
    yearlyDiscountEnabled: true,
  });
  const [currencyRows, setCurrencyRows] = useState<Record<string, CurrencyRow>>({});
  const [fxRates, setFxRates] = useState<Record<string, number>>({});
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);
  const [fxUpdatedAt, setFxUpdatedAt] = useState<string | null>(null); // Provider update time
  const [fxRefreshedAt, setFxRefreshedAt] = useState<string | null>(null); // Local fetch time
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);

  const { data, isPending } = useQuery<{
    paymentDueDays: number;
    yearlyDiscountPercent?: number;
    yearlyDiscountEnabled?: boolean;
    baseCurrencyCode?: string;
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
        userDailyRateCents: formatEditableMajorFromCents(found?.userDailyRateCents),
        nextMonthUserDailyRateCents: formatEditableMajorFromCents(found?.nextMonthUserDailyRateCents),
      };
    }
    setCurrencyRows(rowMap);
    setForm({
      paymentDueDays: String(data.paymentDueDays),
      baseCurrencyCode: data.baseCurrencyCode || "USD",
      yearlyDiscountPercent: String(data.yearlyDiscountPercent ?? 15),
      yearlyDiscountEnabled: data.yearlyDiscountEnabled !== false,
    });
  }, [data]);

  const fetchBaseRates = useCallback(async () => {
    setFxLoading(true);
    setFxError(null);
    try {
      const base = (form.baseCurrencyCode || "USD").toUpperCase();
      const data = await api.get<{ base: string; rates: Record<string, number>; updatedAt?: string | null }>(
        `/api/admin/billing/fx-rates?base=${encodeURIComponent(base)}&t=${Date.now()}`
      );
      if (!data.rates) throw new Error("No rates in response");
      setFxRates(data.rates);
      setFxUpdatedAt(data.updatedAt ?? null);
      setFxRefreshedAt(new Date().toISOString());
      toast({ title: `${base} rates refreshed` });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to fetch rates.";
      setFxError(msg);
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setFxLoading(false);
    }
  }, [toast, form.baseCurrencyCode]);

  useEffect(() => {
    fetchBaseRates().catch(() => {});
  }, [fetchBaseRates]);

  useEffect(() => {
    const id = setInterval(() => {
      fetchBaseRates().catch(() => {});
    }, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchBaseRates]);
  const calculatedRows = calculateBaseComparison(currencyRows, fxRates, form.baseCurrencyCode || "USD");

  const yearlyDiscountPercentClamped = Math.min(100, Math.max(0, Math.round(Number(form.yearlyDiscountPercent)) || 0));

  const saveSummaryLines = useMemo(() => {
    const lines: string[] = [];
    lines.push(`Base currency: ${(form.baseCurrencyCode || "USD").toUpperCase()}`);
    lines.push(`Invoice payment due: ${form.paymentDueDays} day(s) after issue`);
    lines.push(
      `Public pricing calculator — annual discount: ${yearlyDiscountPercentClamped}% (${form.yearlyDiscountEnabled ? "applied when annual billing is on" : "disabled"})`,
    );
    const priceLines = Object.entries(currencyRows)
      .filter(([, row]) => row.userDailyRateCents.trim().length > 0)
      .map(([code, row]) => {
        const currentMajor = row.userDailyRateCents.trim();
        const next =
          row.nextMonthUserDailyRateCents.trim().length > 0
            ? ` → next month ${row.nextMonthUserDailyRateCents.trim()}`
            : "";
        return `${code}: ${currentMajor} / day${next}`;
      });
    if (priceLines.length === 0) lines.push("No currency daily rates filled in (existing server values may be unchanged).");
    else {
      lines.push("Per-user daily rates to save:");
      for (const p of priceLines) lines.push(`  · ${p}`);
    }
    return lines;
  }, [currencyRows, form.baseCurrencyCode, form.paymentDueDays, form.yearlyDiscountEnabled, yearlyDiscountPercentClamped]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch("/api/admin/billing/settings", {
        paymentDueDays: Number(form.paymentDueDays),
        baseCurrencyCode: form.baseCurrencyCode,
        yearlyDiscountPercent: yearlyDiscountPercentClamped,
        yearlyDiscountEnabled: form.yearlyDiscountEnabled,
        currencyPrices: Object.entries(currencyRows)
          .filter(([, row]) => row.userDailyRateCents.trim().length > 0)
          .map(([currencyCode, row]) => ({
            currencyCode,
            userDailyRateCents: majorToCents(row.userDailyRateCents),
            nextMonthUserDailyRateCents:
              row.nextMonthUserDailyRateCents.trim().length > 0 ? majorToCents(row.nextMonthUserDailyRateCents) : null,
          })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "billing-settings"] });
      queryClient.invalidateQueries({ queryKey: ["public-pricing-rates"] });
      setSaveConfirmOpen(false);
      toast({
        title: "Pricing updated",
        description: "Global billing defaults are saved. The public pricing page will show new rates on the next load or tab focus.",
      });
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
          <CardTitle className="text-white">Seat curve calculator</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-white/55">
            Illustrative tiered model for projections. Adjust inputs to explore scenarios; global postpaid currency
            rates below remain the source of truth for invoicing.
          </p>
          <TieredSeatPricingCalculator
            showModelControls
            yearlyDiscountPercent={yearlyDiscountPercentClamped}
            yearlyDiscountEnabled={form.yearlyDiscountEnabled}
            showYearlyDiscountControls
            onYearlyDiscountPercentChange={(p) => setForm((f) => ({ ...f, yearlyDiscountPercent: String(p) }))}
            onYearlyDiscountEnabledChange={(enabled) => setForm((f) => ({ ...f, yearlyDiscountEnabled: enabled }))}
          />
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Global currency pricing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-white/60">
              Manual prices per currency with compact fields. Base currency is{" "}
              <span className="text-white font-medium">{form.baseCurrencyCode || "USD"}</span>.
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => fetchBaseRates()} disabled={fxLoading}>
                {fxLoading ? "Loading rates..." : "Refresh base rates"}
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
              <p className="col-span-4">Base / Currency</p>
              <p className="col-span-2">Current</p>
              <p className="col-span-2">Next month</p>
              <p className="col-span-2">Base calculation</p>
            </div>
            {[...(data?.supportedCurrencies ?? [])]
              .sort((a, b) => {
                if (a === form.baseCurrencyCode) return -1;
                if (b === form.baseCurrencyCode) return 1;
                return a.localeCompare(b);
              })
              .map((currency) => {
              const row = currencyRows[currency] ?? {
                userDailyRateCents: "",
                nextMonthUserDailyRateCents: "",
              };
              const calculatedValue =
                currency === form.baseCurrencyCode
                  ? row.userDailyRateCents || ""
                  : calculatedRows[currency] != null
                    ? String(calculatedRows[currency].toFixed(2))
                    : "";
              return (
                <div
                  key={currency}
                  className={`grid min-w-[760px] grid-cols-12 gap-2 items-center whitespace-nowrap rounded px-1 py-1 ${
                    currency === form.baseCurrencyCode ? "bg-emerald-950/30 border border-emerald-700/40" : ""
                  }`}
                >
                  <div className="col-span-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={currency === form.baseCurrencyCode}
                        onCheckedChange={(checked) => {
                          if (!checked) return;
                          setForm((prev) => ({ ...prev, baseCurrencyCode: currency }));
                        }}
                      />
                      <p className="text-xs text-white font-medium">
                        {currency} - {CURRENCY_COUNTRY_LABELS[currency] ?? "Other"}
                      </p>
                    </div>
                  </div>
                  <div className="col-span-2 flex items-center gap-1">
                    <Input
                      className="h-7 text-xs px-2"
                      value={row.userDailyRateCents}
                      onChange={(e) =>
                        setCurrencyRows((prev) => ({
                          ...prev,
                          [currency]: { ...row, userDailyRateCents: e.target.value },
                        }))
                      }
                    />
                    <span className="text-[10px] text-white/45">{currency}</span>
                  </div>
                  <div className="col-span-2 flex items-center gap-1">
                    <Input
                      className="h-7 text-xs px-2"
                      value={row.nextMonthUserDailyRateCents}
                      onChange={(e) =>
                        setCurrencyRows((prev) => ({
                          ...prev,
                          [currency]: { ...row, nextMonthUserDailyRateCents: e.target.value },
                        }))
                      }
                    />
                    <span className="text-[10px] text-white/45">{currency}</span>
                  </div>
                  <Input
                    className="col-span-2 h-7 text-xs px-2"
                    value={calculatedValue || "-"}
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
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Button
                type="button"
                className="bg-rose-700 hover:bg-rose-600"
                onClick={() => setSaveConfirmOpen(true)}
                disabled={saveMutation.isPending || isPending}
              >
                Save new pricing
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={saveConfirmOpen} onOpenChange={setSaveConfirmOpen}>
        <AlertDialogContent className="max-h-[85vh] overflow-y-auto border-white/10 bg-gray-900 text-white sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Save new global pricing?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-white/70" asChild>
              <div>
                <p>
                  This updates default billing for all organisations that use the global table, and updates the public
                  pricing page (per-user / day and annual discount defaults).
                </p>
                <ul className="list-disc space-y-1 pl-4 text-left text-sm text-white/80">
                  {saveSummaryLines.map((line, i) => (
                    <li key={`${i}-${line.slice(0, 80)}`}>{line}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="border-white/20 bg-transparent text-white hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              className="bg-rose-700 hover:bg-rose-600"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "Saving…" : "Confirm and save"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
