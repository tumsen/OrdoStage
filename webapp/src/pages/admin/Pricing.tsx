import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TieredSeatPricingCalculator } from "@/components/pricing/TieredSeatPricingCalculator";

/** Matches GET/PATCH `/api/admin/billing/settings` `data` envelope. */
type AdminBillingSettingsData = {
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

/** Stable across referential churn so keyed remounts only track real server changes. */
function stableBillingFingerprint(d: AdminBillingSettingsData | undefined): string {
  if (!d) return "";
  const prices = [...d.currencyPrices]
    .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode))
    .map((p) => ({
      currencyCode: p.currencyCode,
      userDailyRateCents: p.userDailyRateCents,
      nextMonthUserDailyRateCents: p.nextMonthUserDailyRateCents ?? null,
    }));
  return JSON.stringify({
    paymentDueDays: d.paymentDueDays,
    yearlyDiscountPercent: d.yearlyDiscountPercent ?? null,
    yearlyDiscountEnabled: d.yearlyDiscountEnabled ?? null,
    baseCurrencyCode: d.baseCurrencyCode ?? null,
    currencyPrices: prices,
  });
}

type BillingEditorProps = {
  initialData: AdminBillingSettingsData;
  queryClient: ReturnType<typeof useQueryClient>;
};

/**
 * Mounted with `key={stableBillingFingerprint(data)}` so we hydrate from the server only
 * on real data changes (initial load / after save), never from a sync effect while typing.
 */
function AdminBillingPricingEditor({ initialData, queryClient }: BillingEditorProps) {
  const { toast } = useToast();
  const eurServer = initialData.currencyPrices.find((p) => p.currencyCode === "EUR");
  const [eurCurrent, setEurCurrent] = useState(() => formatEditableMajorFromCents(eurServer?.userDailyRateCents));
  const [eurNext, setEurNext] = useState(() => formatEditableMajorFromCents(eurServer?.nextMonthUserDailyRateCents));
  const [paymentDueDays, setPaymentDueDays] = useState(() => String(initialData.paymentDueDays));
  const [form, setForm] = useState({
    yearlyDiscountPercent: String(initialData.yearlyDiscountPercent ?? 15),
    yearlyDiscountEnabled: initialData.yearlyDiscountEnabled !== false,
  });

  const yearlyDiscountPercentClamped = Math.min(100, Math.max(0, Math.round(Number(form.yearlyDiscountPercent)) || 0));

  const saveMutation = useMutation({
    mutationFn: async (): Promise<AdminBillingSettingsData> => {
      const due = Number(paymentDueDays);
      if (!Number.isFinite(due) || due < 1 || due > 30) {
        throw new Error("Invoice due days must be a number between 1 and 30.");
      }
      const currentTrim = eurCurrent.trim();
      if (!currentTrim) {
        throw new Error("Enter the current EUR daily rate.");
      }
      const nextTrim = eurNext.trim();
      const currencyPrices = [
        {
          currencyCode: "EUR",
          userDailyRateCents: majorToCents(currentTrim),
          nextMonthUserDailyRateCents: nextTrim.length > 0 ? majorToCents(nextTrim) : null,
        },
      ];
      return api.patch<AdminBillingSettingsData>("/api/admin/billing/settings", {
        paymentDueDays: due,
        baseCurrencyCode: "EUR",
        yearlyDiscountPercent: yearlyDiscountPercentClamped,
        yearlyDiscountEnabled: form.yearlyDiscountEnabled,
        currencyPrices,
      });
    },
    onSuccess: async (saved) => {
      queryClient.setQueryData(["admin", "billing-settings"], saved);
      await queryClient.refetchQueries({ queryKey: ["public-pricing-rates"], type: "all" });
      toast({
        title: "Pricing updated",
        description: "Global billing defaults are saved. The public pricing page will refetch the latest rates.",
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
            Illustrative tiered model for projections. Adjust inputs to explore scenarios; the EUR postpaid daily rates
            below remain the source of truth for invoicing.
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
        <CardHeader className="flex flex-col gap-3 space-y-0 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-white">EUR billing rates</CardTitle>
            <p className="mt-1 text-xs text-white/50">
              Edit amounts below, then press <span className="text-white/80">Save pricing</span>. All billing is in
              euros.
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            className="h-11 w-full shrink-0 bg-rose-600 px-8 text-base font-semibold hover:bg-rose-500 sm:w-auto"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving…" : "Save pricing"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
            <div className="space-y-1">
              <p className="text-xs text-white/50">Current daily rate (EUR)</p>
              <Input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="h-9 text-sm"
                value={eurCurrent}
                onChange={(e) => setEurCurrent(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-white/50">Next month daily rate (EUR, optional)</p>
              <Input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="h-9 text-sm"
                value={eurNext}
                onChange={(e) => setEurNext(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <p className="text-xs text-white/50">Invoice due days</p>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                className="max-w-[120px]"
                value={paymentDueDays}
                onChange={(e) => setPaymentDueDays(e.target.value)}
              />
            </div>
            <Button
              type="button"
              size="lg"
              className="h-11 w-full shrink-0 bg-rose-600 px-8 text-base font-semibold hover:bg-rose-500 sm:w-auto"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : "Save pricing"}
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
        This is the global postpaid default model. Organizations can still override these defaults on their org detail
        page.
      </p>
    </div>
  );
}

export default function Pricing() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, error } = useQuery<AdminBillingSettingsData>({
    queryKey: ["admin", "billing-settings"],
    queryFn: () => api.get("/api/admin/billing/settings"),
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const billingDataFingerprint = useMemo(() => stableBillingFingerprint(data), [data]);

  if (isPending) {
    return <div className="p-6 text-sm text-white/60">Loading billing settings…</div>;
  }

  if (isError) {
    return (
      <div className="p-6 text-sm text-red-300">
        {error instanceof Error ? error.message : "Failed to load billing settings."}
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-sm text-white/60">No billing settings loaded.</div>;
  }

  return (
    <AdminBillingPricingEditor key={billingDataFingerprint} initialData={data} queryClient={queryClient} />
  );
}
