import { useMemo, useState } from "react";
import { ConfirmPricingSaveDialog } from "@/components/admin/ConfirmPricingSaveDialog";
import { formatEuroMajor } from "@/lib/tieredSeatPricing";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TieredSeatPricingCalculator } from "@/components/pricing/TieredSeatPricingCalculator";
import {
  BillingOpsRow,
  FixedPlanSettingsRow,
  FlexSeatModelRow,
} from "@/components/pricing/AdminPlanSettingsFields";
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
  const [confirmOpen, setConfirmOpen] = useState(false);
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
  const initialFixed = mergeFixedPlan(initialData.fixedPlanPricing);
  const [fixedDrafts, setFixedDrafts] = useState(() => ({
    firstSeat: String(initialFixed.firstSeatMonthlyMajor),
    monthlyDiscMin: String(initialFixed.monthlyVolumeDiscountPercentMin),
    monthlyDiscMax: String(initialFixed.monthlyVolumeDiscountPercentMax),
    annualDiscMin: String(initialFixed.annualVolumeDiscountPercentMin),
    annualDiscMax: String(initialFixed.annualVolumeDiscountPercentMax),
    discCap: String(initialFixed.discountCapSeats),
    maxSeats: String(initialFixed.selfServeMaxSeats),
    passEnabled: initialFixed.temporarySeatPassEnabled,
    passDays: String(initialFixed.temporarySeatPassDays),
    passPricePerSeat: String(initialFixed.temporarySeatPassPricePerSeatMajor),
  }));

  function commitFixedPlanFromDrafts(): FixedPlanPricingConfig {
    const first = parseFloat(fixedDrafts.firstSeat.replace(",", "."));
    const monthlyMin = parseInt(fixedDrafts.monthlyDiscMin, 10);
    const monthlyMax = parseInt(fixedDrafts.monthlyDiscMax, 10);
    const annualMin = parseInt(fixedDrafts.annualDiscMin, 10);
    const annualMax = parseInt(fixedDrafts.annualDiscMax, 10);
    const cap = parseInt(fixedDrafts.discCap, 10);
    const maxSeats = parseInt(fixedDrafts.maxSeats, 10);
    const passDays = parseInt(fixedDrafts.passDays, 10);
    const passPrice = parseFloat(fixedDrafts.passPricePerSeat.replace(",", "."));
    const merged = mergeFixedPlan({
      firstSeatMonthlyMajor: Number.isFinite(first) ? Math.max(0, first) : fixedPlan.firstSeatMonthlyMajor,
      monthlyVolumeDiscountPercentMin: Number.isFinite(monthlyMin)
        ? Math.min(100, Math.max(0, monthlyMin))
        : fixedPlan.monthlyVolumeDiscountPercentMin,
      monthlyVolumeDiscountPercentMax: Number.isFinite(monthlyMax)
        ? Math.min(100, Math.max(0, monthlyMax))
        : fixedPlan.monthlyVolumeDiscountPercentMax,
      annualVolumeDiscountPercentMin: Number.isFinite(annualMin)
        ? Math.min(100, Math.max(0, annualMin))
        : fixedPlan.annualVolumeDiscountPercentMin,
      annualVolumeDiscountPercentMax: Number.isFinite(annualMax)
        ? Math.min(100, Math.max(0, annualMax))
        : fixedPlan.annualVolumeDiscountPercentMax,
      discountCapSeats: Number.isFinite(cap) ? Math.min(500, Math.max(1, cap)) : fixedPlan.discountCapSeats,
      selfServeMaxSeats: Number.isFinite(maxSeats) ? Math.min(500, Math.max(1, maxSeats)) : fixedPlan.selfServeMaxSeats,
      temporarySeatPassEnabled: fixedDrafts.passEnabled,
      temporarySeatPassDays: Number.isFinite(passDays)
        ? Math.min(90, Math.max(1, passDays))
        : fixedPlan.temporarySeatPassDays,
      temporarySeatPassPricePerSeatMajor: Number.isFinite(passPrice)
        ? Math.max(0, passPrice)
        : fixedPlan.temporarySeatPassPricePerSeatMajor,
    });
    if (merged.monthlyVolumeDiscountPercentMax < merged.monthlyVolumeDiscountPercentMin) {
      merged.monthlyVolumeDiscountPercentMax = merged.monthlyVolumeDiscountPercentMin;
    }
    if (merged.annualVolumeDiscountPercentMax < merged.annualVolumeDiscountPercentMin) {
      merged.annualVolumeDiscountPercentMax = merged.annualVolumeDiscountPercentMin;
    }
    setFixedPlan(merged);
    setFixedDrafts({
      firstSeat: String(merged.firstSeatMonthlyMajor),
      monthlyDiscMin: String(merged.monthlyVolumeDiscountPercentMin),
      monthlyDiscMax: String(merged.monthlyVolumeDiscountPercentMax),
      annualDiscMin: String(merged.annualVolumeDiscountPercentMin),
      annualDiscMax: String(merged.annualVolumeDiscountPercentMax),
      discCap: String(merged.discountCapSeats),
      maxSeats: String(merged.selfServeMaxSeats),
      passEnabled: merged.temporarySeatPassEnabled,
      passDays: String(merged.temporarySeatPassDays),
      passPricePerSeat: String(merged.temporarySeatPassPricePerSeatMajor),
    });
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
        yearlyDiscountPercent: 0,
        yearlyDiscountEnabled: false,
        billingTrialDays: trial,
        billingGraceDaysAfterDue: grace,
        fixedAnnualRoundToTen,
        fixedPlanPricing: commitFixedPlanFromDrafts(),
        defaultSeatCalculatorJson: JSON.stringify({
          model: seatModel,
          yearlyDiscountPercent: 0,
          yearlyDiscountEnabled: false,
        }),
      });
    },
    onSuccess: async (saved) => {
      setConfirmOpen(false);
      queryClient.setQueryData(["admin", "billing-settings"], saved);
      await queryClient.refetchQueries({ queryKey: ["public-pricing-rates"], type: "all" });
      toast({
        title: "Pricing updated",
        description: "Flex curve, Yearly plan settings, and billing defaults are saved.",
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

  const confirmDescription = (
    <ul className="list-disc pl-4 space-y-1">
      <li>
        Flex curve: base {formatEuroMajor(seatModel.base)}, 2nd seat {formatEuroMajor(seatModel.start)}, floor{" "}
        {formatEuroMajor(seatModel.floor)} from seat {seatModel.floorAt}+
      </li>
      <li>
        Yearly first seat: {formatEuroMajor(fixedPlan.firstSeatMonthlyMajor)}/mo · annual volume discount{" "}
        {fixedPlan.annualVolumeDiscountPercentMin}–{fixedPlan.annualVolumeDiscountPercentMax}% (cap{" "}
        {fixedPlan.discountCapSeats} seats)
      </li>
      <li>
        Short-term seat pass:{" "}
        {fixedPlan.temporarySeatPassEnabled
          ? `${fixedPlan.temporarySeatPassDays} days · ${formatEuroMajor(fixedPlan.temporarySeatPassPricePerSeatMajor)}/extra seat`
          : "disabled"}
      </li>
      <li>
        Self-serve Yearly checkout up to {fixedPlan.selfServeMaxSeats} seats
        {fixedAnnualRoundToTen ? " · annual total rounded to €10" : ""}
      </li>
      <li>
        Invoice due {paymentDueDays} days · trial {billingTrialDays} days · grace {billingGraceDaysAfterDue} days
      </li>
      <li className="text-ordo-yellow/90">Public pricing and new org estimates update immediately.</li>
    </ul>
  );

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
              Flex is monthly postpaid only. Fixed has separate monthly and annual volume discounts. Press{" "}
              <span className="text-white/80">Save pricing</span> to persist.
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            className="h-11 w-full shrink-0 bg-rose-600 px-8 text-base font-semibold hover:bg-rose-500 sm:w-auto"
            onClick={() => {
              commitFixedPlanFromDrafts();
              setConfirmOpen(true);
            }}
            disabled={saveMutation.isPending}
          >
            Save pricing…
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <TieredSeatPricingCalculator
            compareFlexFixedPlans
            hideInlineModelControls
            fixedPlanPricing={fixedPlan}
            fixedAnnualRoundToTen={fixedAnnualRoundToTen}
            seatModel={seatModel}
            onSeatModelChange={setSeatModel}
          />

          <div className="space-y-4 border-t border-white/10 pt-5">
            <FlexSeatModelRow model={seatModel} onChange={setSeatModel} />
            <FixedPlanSettingsRow
              onCommit={commitFixedPlanFromDrafts}
              fixedAnnualRoundToTen={fixedAnnualRoundToTen}
              onFixedAnnualRoundToTenChange={setFixedAnnualRoundToTen}
              drafts={fixedDrafts}
              setDrafts={setFixedDrafts}
            />
            <BillingOpsRow
              paymentDueDays={paymentDueDays}
              onPaymentDueDaysChange={setPaymentDueDays}
              billingTrialDays={billingTrialDays}
              onBillingTrialDaysChange={setBillingTrialDays}
              billingGraceDaysAfterDue={billingGraceDaysAfterDue}
              onBillingGraceDaysAfterDueChange={setBillingGraceDaysAfterDue}
            />
          </div>

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

      <ConfirmPricingSaveDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Update global pricing?"
        description={confirmDescription}
        confirmLabel="Update global pricing"
        pending={saveMutation.isPending}
        onConfirm={() => saveMutation.mutate()}
      />
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
