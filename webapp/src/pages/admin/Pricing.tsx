import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  InputWithUnitSuffix,
  TieredSeatPricingCalculator,
} from "@/components/pricing/TieredSeatPricingCalculator";
import { parseSeatCalculatorJson } from "@/lib/seatCalculatorJson";
import {
  DEFAULT_FIXED_PLAN_PRICING,
  type FixedPlanPricingConfig,
} from "@/lib/fixedPlanPricingConfig";
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
  fixedAnnualRoundToTen?: boolean;
  fixedPlanPricing?: FixedPlanPricingConfig;
  currencyPrices: Array<{
    currencyCode: string;
    userDailyRateCents: number;
    nextMonthUserDailyRateCents?: number | null;
  }>;
  supportedCurrencies: string[];
};

function mergeFixedPlan(partial?: FixedPlanPricingConfig): FixedPlanPricingConfig {
  return { ...DEFAULT_FIXED_PLAN_PRICING, ...partial };
}

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
    fixedAnnualRoundToTen: d.fixedAnnualRoundToTen ?? true,
    fixedPlanPricing: d.fixedPlanPricing ?? DEFAULT_FIXED_PLAN_PRICING,
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
  const [fixedAnnualRoundToTen, setFixedAnnualRoundToTen] = useState(
    () => initialData.fixedAnnualRoundToTen !== false,
  );
  const [seatModel, setSeatModel] = useState<TieredSeatModel>(() => mergeGlobalSeatModel(initialData.defaultSeatCalculatorJson));
  const [fixedPlan, setFixedPlan] = useState<FixedPlanPricingConfig>(() =>
    mergeFixedPlan(initialData.fixedPlanPricing),
  );
  const [fixedFirstSeatDraft, setFixedFirstSeatDraft] = useState(() =>
    String(mergeFixedPlan(initialData.fixedPlanPricing).firstSeatAnnualMonthlyMajor),
  );
  const [fixedDiscMinDraft, setFixedDiscMinDraft] = useState(() =>
    String(mergeFixedPlan(initialData.fixedPlanPricing).discountPercentMin),
  );
  const [fixedDiscMaxDraft, setFixedDiscMaxDraft] = useState(() =>
    String(mergeFixedPlan(initialData.fixedPlanPricing).discountPercentMax),
  );
  const [fixedDiscCapDraft, setFixedDiscCapDraft] = useState(() =>
    String(mergeFixedPlan(initialData.fixedPlanPricing).discountCapSeats),
  );
  const [fixedMaxSeatsDraft, setFixedMaxSeatsDraft] = useState(() =>
    String(mergeFixedPlan(initialData.fixedPlanPricing).selfServeMaxSeats),
  );
  const y0 = initialYearlyFromSettings(initialData);
  const [seatYearlyPercent, setSeatYearlyPercent] = useState(y0.percent);
  const [seatYearlyEnabled, setSeatYearlyEnabled] = useState(y0.enabled);

  const yearlyDiscountPercentClamped = Math.min(100, Math.max(0, Math.round(seatYearlyPercent) || 0));

  function commitFixedPlanFromDrafts(): FixedPlanPricingConfig {
    const first = parseFloat(fixedFirstSeatDraft.replace(",", "."));
    const dMin = parseInt(fixedDiscMinDraft, 10);
    const dMax = parseInt(fixedDiscMaxDraft, 10);
    const cap = parseInt(fixedDiscCapDraft, 10);
    const maxSeats = parseInt(fixedMaxSeatsDraft, 10);
    const merged = mergeFixedPlan({
      firstSeatAnnualMonthlyMajor: Number.isFinite(first) ? Math.max(0, first) : fixedPlan.firstSeatAnnualMonthlyMajor,
      discountPercentMin: Number.isFinite(dMin) ? Math.min(100, Math.max(0, dMin)) : fixedPlan.discountPercentMin,
      discountPercentMax: Number.isFinite(dMax) ? Math.min(100, Math.max(0, dMax)) : fixedPlan.discountPercentMax,
      discountCapSeats: Number.isFinite(cap) ? Math.min(500, Math.max(1, cap)) : fixedPlan.discountCapSeats,
      selfServeMaxSeats: Number.isFinite(maxSeats) ? Math.min(500, Math.max(1, maxSeats)) : fixedPlan.selfServeMaxSeats,
    });
    if (merged.discountPercentMax < merged.discountPercentMin) {
      merged.discountPercentMax = merged.discountPercentMin;
    }
    setFixedPlan(merged);
    setFixedFirstSeatDraft(String(merged.firstSeatAnnualMonthlyMajor));
    setFixedDiscMinDraft(String(merged.discountPercentMin));
    setFixedDiscMaxDraft(String(merged.discountPercentMax));
    setFixedDiscCapDraft(String(merged.discountCapSeats));
    setFixedMaxSeatsDraft(String(merged.selfServeMaxSeats));
    return merged;
  }

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
        fixedAnnualRoundToTen,
        fixedPlanPricing: commitFixedPlanFromDrafts(),
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
        description: "Flex curve, Fixed plan settings, and billing defaults are saved.",
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
            <CardTitle className="text-white">Flex &amp; Fixed pricing</CardTitle>
            <p className="mt-1 text-xs text-white/50">
              Flex postpaid curve, Fixed annual formula, trial/grace, and invoice timing. Press{" "}
              <span className="text-white/80">Save pricing</span> to persist. Chart compares both plans on one graph.
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
            compareFlexFixedPlans
            fixedPlanPricing={fixedPlan}
            fixedAnnualRoundToTen={fixedAnnualRoundToTen}
            yearlyDiscountPercent={yearlyDiscountPercentClamped}
            yearlyDiscountEnabled={seatYearlyEnabled}
            showYearlyDiscountControls
            onYearlyDiscountPercentChange={setSeatYearlyPercent}
            onYearlyDiscountEnabledChange={setSeatYearlyEnabled}
            seatModel={seatModel}
            onSeatModelChange={setSeatModel}
            afterModelControls={
              <>
                <div className="flex min-h-[11.5rem] min-w-0 flex-col rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                  <Label
                    htmlFor="admin-invoice-due-days"
                    className="min-h-[2.5rem] shrink-0 text-[11px] font-medium leading-snug text-white/50 line-clamp-3"
                  >
                    Invoice payment due
                  </Label>
                  <p id="admin-invoice-due-days-hint" className="mt-1 shrink-0 text-[10px] leading-snug text-white/45 line-clamp-4">
                    Calendar days after an invoice is issued until it is due (1–30). Stored as whole <strong className="text-white/55">Days</strong>; affects
                    reminder timing and when read-only can apply.
                  </p>
                  <div className="min-h-0 flex-1" aria-hidden />
                  <InputWithUnitSuffix
                    id="admin-invoice-due-days"
                    inputMode="numeric"
                    suffix="Days"
                    value={paymentDueDays}
                    onChange={setPaymentDueDays}
                    aria-describedby="admin-invoice-due-days-hint"
                  />
                </div>
                <div className="flex min-h-[11.5rem] min-w-0 flex-col rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                  <Label
                    htmlFor="admin-billing-trial-days"
                    className="min-h-[2.5rem] shrink-0 text-[11px] font-medium leading-snug text-white/50 line-clamp-3"
                  >
                    Free trial length
                  </Label>
                  <p id="admin-billing-trial-days-hint" className="mt-1 shrink-0 text-[10px] leading-snug text-white/45 line-clamp-4">
                    Days from organisation creation before post-trial rules apply strongly. Use <strong className="text-white/55">0 Days</strong> for no trial.
                    Unpaid invoices still respect this window before forcing read-only.
                  </p>
                  <div className="min-h-0 flex-1" aria-hidden />
                  <InputWithUnitSuffix
                    id="admin-billing-trial-days"
                    inputMode="numeric"
                    suffix="Days"
                    value={billingTrialDays}
                    onChange={setBillingTrialDays}
                    aria-describedby="admin-billing-trial-days-hint"
                  />
                </div>
                <div className="flex min-h-[11.5rem] min-w-0 flex-col rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                  <Label
                    htmlFor="admin-billing-grace-days"
                    className="min-h-[2.5rem] shrink-0 text-[11px] font-medium leading-snug text-white/50 line-clamp-3"
                  >
                    Grace after due date
                  </Label>
                  <p id="admin-billing-grace-days-hint" className="mt-1 shrink-0 text-[10px] leading-snug text-white/45 line-clamp-4">
                    Extra <strong className="text-white/55">Days</strong> after the invoice due date before the organisation becomes view-only (0 = none). Helps
                    teams who pay a few days late.
                  </p>
                  <div className="min-h-0 flex-1" aria-hidden />
                  <InputWithUnitSuffix
                    id="admin-billing-grace-days"
                    inputMode="numeric"
                    suffix="Days"
                    value={billingGraceDaysAfterDue}
                    onChange={setBillingGraceDaysAfterDue}
                    aria-describedby="admin-billing-grace-days-hint"
                  />
                </div>
                <div className="flex min-h-[11.5rem] min-w-0 flex-col rounded-lg border border-ordo-violet/30 bg-ordo-violet/5 px-3 py-2.5">
                  <Label htmlFor="admin-fixed-first-seat" className="text-[11px] font-medium text-white/50">
                    Fixed · 1st seat (€/mo equiv.)
                  </Label>
                  <p className="mt-1 text-[10px] leading-snug text-white/45">
                    Monthly equivalent for the first committed seat on the Fixed annual plan.
                  </p>
                  <div className="mt-auto pt-2">
                    <InputWithUnitSuffix
                      id="admin-fixed-first-seat"
                      suffix="EUR"
                      value={fixedFirstSeatDraft}
                      onChange={setFixedFirstSeatDraft}
                      onBlur={commitFixedPlanFromDrafts}
                    />
                  </div>
                </div>
                <div className="flex min-h-[11.5rem] min-w-0 flex-col rounded-lg border border-ordo-violet/30 bg-ordo-violet/5 px-3 py-2.5">
                  <Label htmlFor="admin-fixed-disc-min" className="text-[11px] font-medium text-white/50">
                    Fixed · min volume discount
                  </Label>
                  <p className="mt-1 text-[10px] leading-snug text-white/45">At 1 seat (seats 2+ discounted).</p>
                  <div className="mt-auto pt-2">
                    <InputWithUnitSuffix
                      id="admin-fixed-disc-min"
                      suffix="%"
                      inputMode="numeric"
                      value={fixedDiscMinDraft}
                      onChange={setFixedDiscMinDraft}
                      onBlur={commitFixedPlanFromDrafts}
                    />
                  </div>
                </div>
                <div className="flex min-h-[11.5rem] min-w-0 flex-col rounded-lg border border-ordo-violet/30 bg-ordo-violet/5 px-3 py-2.5">
                  <Label htmlFor="admin-fixed-disc-max" className="text-[11px] font-medium text-white/50">
                    Fixed · max volume discount
                  </Label>
                  <p className="mt-1 text-[10px] leading-snug text-white/45">At discount cap seat count.</p>
                  <div className="mt-auto pt-2">
                    <InputWithUnitSuffix
                      id="admin-fixed-disc-max"
                      suffix="%"
                      inputMode="numeric"
                      value={fixedDiscMaxDraft}
                      onChange={setFixedDiscMaxDraft}
                      onBlur={commitFixedPlanFromDrafts}
                    />
                  </div>
                </div>
                <div className="flex min-h-[11.5rem] min-w-0 flex-col rounded-lg border border-ordo-violet/30 bg-ordo-violet/5 px-3 py-2.5">
                  <Label htmlFor="admin-fixed-disc-cap" className="text-[11px] font-medium text-white/50">
                    Fixed · discount cap seats
                  </Label>
                  <p className="mt-1 text-[10px] leading-snug text-white/45">Seat count where max discount applies.</p>
                  <div className="mt-auto pt-2">
                    <InputWithUnitSuffix
                      id="admin-fixed-disc-cap"
                      suffix="Users"
                      inputMode="numeric"
                      value={fixedDiscCapDraft}
                      onChange={setFixedDiscCapDraft}
                      onBlur={commitFixedPlanFromDrafts}
                    />
                  </div>
                </div>
                <div className="flex min-h-[11.5rem] min-w-0 flex-col rounded-lg border border-ordo-violet/30 bg-ordo-violet/5 px-3 py-2.5">
                  <Label htmlFor="admin-fixed-max-seats" className="text-[11px] font-medium text-white/50">
                    Self-serve max seats
                  </Label>
                  <p className="mt-1 text-[10px] leading-snug text-white/45">Above this → enterprise contact.</p>
                  <div className="mt-auto pt-2">
                    <InputWithUnitSuffix
                      id="admin-fixed-max-seats"
                      suffix="Users"
                      inputMode="numeric"
                      value={fixedMaxSeatsDraft}
                      onChange={setFixedMaxSeatsDraft}
                      onBlur={commitFixedPlanFromDrafts}
                    />
                  </div>
                </div>
                <div className="flex min-h-[11.5rem] min-w-0 flex-col rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                  <Label htmlFor="admin-fixed-round-ten" className="text-[11px] font-medium text-white/50">
                    Fixed annual rounding
                  </Label>
                  <p className="mt-1 text-[10px] leading-snug text-white/45">
                    Round Fixed plan annual checkout totals to the nearest €10 for cleaner Paddle invoices.
                  </p>
                  <div className="mt-auto flex items-center gap-2 pt-2">
                    <Checkbox
                      id="admin-fixed-round-ten"
                      checked={fixedAnnualRoundToTen}
                      onCheckedChange={(v) => setFixedAnnualRoundToTen(v === true)}
                    />
                    <Label htmlFor="admin-fixed-round-ten" className="text-xs text-white/60 cursor-pointer">
                      Round to €10
                    </Label>
                  </div>
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
