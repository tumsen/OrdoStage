import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { TieredSeatPricingCalculator } from "@/components/pricing/TieredSeatPricingCalculator";
import { parseSeatCalculatorJson } from "@/lib/seatCalculatorJson";
import { DEFAULT_TIERED_SEAT_MODEL, type TieredSeatModel } from "@/lib/tieredSeatPricing";

/** Matches GET/PATCH `/api/admin/billing/settings` `data` envelope. */
type AdminBillingSettingsData = {
  paymentDueDays: number;
  yearlyDiscountPercent?: number;
  yearlyDiscountEnabled?: boolean;
  baseCurrencyCode?: string;
  defaultSeatCalculatorJson?: string | null;
  billingTrialDays?: number;
  billingGraceDaysAfterDue?: number;
  currencyPrices: Array<{
    currencyCode: string;
    userDailyRateCents: number;
    nextMonthUserDailyRateCents?: number | null;
  }>;
  supportedCurrencies: string[];
};

function mergeGlobalSeatModel(json: string | null | undefined): TieredSeatModel {
  const parsed = parseSeatCalculatorJson(json);
  return {
    ...DEFAULT_TIERED_SEAT_MODEL,
    ...parsed?.model,
  };
}

function initialYearlyFromSettings(d: AdminBillingSettingsData): { percent: number; enabled: boolean } {
  const parsed = parseSeatCalculatorJson(d.defaultSeatCalculatorJson);
  return {
    percent: parsed?.yearlyDiscountPercent ?? d.yearlyDiscountPercent ?? 15,
    enabled: parsed?.yearlyDiscountEnabled ?? d.yearlyDiscountEnabled !== false,
  };
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
    defaultSeatCalculatorJson: d.defaultSeatCalculatorJson ?? null,
    billingTrialDays: d.billingTrialDays ?? 0,
    billingGraceDaysAfterDue: d.billingGraceDaysAfterDue ?? 0,
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
  const [paymentDueDays, setPaymentDueDays] = useState(() => String(initialData.paymentDueDays));
  const [billingTrialDays, setBillingTrialDays] = useState(() => String(initialData.billingTrialDays ?? 0));
  const [billingGraceDaysAfterDue, setBillingGraceDaysAfterDue] = useState(() =>
    String(initialData.billingGraceDaysAfterDue ?? 0)
  );
  const [seatModel, setSeatModel] = useState<TieredSeatModel>(() => mergeGlobalSeatModel(initialData.defaultSeatCalculatorJson));
  const y0 = initialYearlyFromSettings(initialData);
  const [seatYearlyPercent, setSeatYearlyPercent] = useState(y0.percent);
  const [seatYearlyEnabled, setSeatYearlyEnabled] = useState(y0.enabled);

  const yearlyDiscountPercentClamped = Math.min(100, Math.max(0, Math.round(seatYearlyPercent) || 0));

  const saveMutation = useMutation({
    mutationFn: async (): Promise<AdminBillingSettingsData> => {
      const due = Number(paymentDueDays);
      if (!Number.isFinite(due) || due < 1 || due > 30) {
        throw new Error("Invoice due days must be a number between 1 and 30.");
      }
      const trial = Math.round(Number(billingTrialDays.trim()));
      const grace = Math.round(Number(billingGraceDaysAfterDue.trim()));
      if (!Number.isFinite(trial) || trial < 0 || trial > 3650) {
        throw new Error("Trial period must be between 0 and 3650 days (0 = no trial).");
      }
      if (!Number.isFinite(grace) || grace < 0 || grace > 365) {
        throw new Error("Grace period must be between 0 and 365 days.");
      }
      return api.patch<AdminBillingSettingsData>("/api/admin/billing/settings", {
        paymentDueDays: due,
        baseCurrencyCode: "EUR",
        yearlyDiscountPercent: yearlyDiscountPercentClamped,
        yearlyDiscountEnabled: seatYearlyEnabled,
        billingTrialDays: trial,
        billingGraceDaysAfterDue: grace,
        defaultSeatCalculatorJson: JSON.stringify({
          model: seatModel,
          yearlyDiscountPercent: yearlyDiscountPercentClamped,
          yearlyDiscountEnabled: seatYearlyEnabled,
        }),
      });
    },
    onSuccess: async (saved) => {
      queryClient.setQueryData(["admin", "billing-settings"], saved);
      await queryClient.refetchQueries({ queryKey: ["public-pricing-rates"], type: "all" });
      toast({
        title: "Pricing updated",
        description: "Global seat curve and billing defaults are saved. Invoices use this curve for each organization unless they have a flat per-seat override.",
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
      toast({ title: "Snapshot completed", description: "Billing activity snapshots updated." });
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
        <CardHeader className="flex flex-col gap-3 space-y-0 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-white">Global seat pricing</CardTitle>
            <p className="mt-1 text-xs text-white/50">
              Edit the curve and annual discount, then press <span className="text-white/80">Save pricing</span>. This
              is stored as the platform default and drives postpaid totals (with optional per-organization flat
              overrides).
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
        <CardContent className="space-y-6">
          <TieredSeatPricingCalculator
            showModelControls
            yearlyDiscountPercent={yearlyDiscountPercentClamped}
            yearlyDiscountEnabled={seatYearlyEnabled}
            showYearlyDiscountControls
            onYearlyDiscountPercentChange={setSeatYearlyPercent}
            onYearlyDiscountEnabledChange={setSeatYearlyEnabled}
            seatModel={seatModel}
            onSeatModelChange={setSeatModel}
            afterModelControls={
              <>
                <div className="min-w-[8.75rem] flex-1 basis-0 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                  <Label className="text-[11px] font-medium text-white/50">Invoice due days (1–30)</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={paymentDueDays}
                    onChange={(e) => setPaymentDueDays(e.target.value)}
                    className="mt-1.5 h-9 border-white/15 bg-black/30 text-white tabular-nums"
                  />
                </div>
                <div className="min-w-[8.75rem] flex-1 basis-0 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                  <Label className="text-[11px] font-medium text-white/50">Trial period (days)</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={billingTrialDays}
                    onChange={(e) => setBillingTrialDays(e.target.value)}
                    className="mt-1.5 h-9 border-white/15 bg-black/30 text-white tabular-nums"
                  />
                </div>
                <div className="min-w-[8.75rem] flex-1 basis-0 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                  <Label className="text-[11px] font-medium text-white/50">Grace after invoice due (days)</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={billingGraceDaysAfterDue}
                    onChange={(e) => setBillingGraceDaysAfterDue(e.target.value)}
                    className="mt-1.5 h-9 border-white/15 bg-black/30 text-white tabular-nums"
                  />
                </div>
              </>
            }
          />

          <p className="text-[10px] text-white/40 leading-relaxed">
            <span className="text-white/55">Invoice due days</span> — days after issue until due.{" "}
            <span className="text-white/55">Trial period</span> — from org creation; unpaid invoices do not force
            read-only until trial ends (0 = none).{" "}
            <span className="text-white/55">Grace after invoice due</span> — extra days after due before read-only (0 =
            none).
          </p>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Billing operations</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => snapshotMutation.mutate()} disabled={snapshotMutation.isPending}>
            {snapshotMutation.isPending ? "Running..." : "Run billing activity snapshot"}
          </Button>
          <Button variant="outline" onClick={() => invoiceMutation.mutate()} disabled={invoiceMutation.isPending}>
            {invoiceMutation.isPending ? "Running..." : "Generate previous month invoices"}
          </Button>
        </CardContent>
      </Card>

      <p className="text-xs text-white/50">
        The EUR row in the billing database is updated from the first-seat tier total for compatibility with legacy
        summaries. Organizations can still set a fixed per-seat override on their org detail billing tab.
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
