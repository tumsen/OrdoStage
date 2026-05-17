import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { TieredSeatPricingCalculator } from "@/components/pricing/TieredSeatPricingCalculator";
import { ConfirmPricingSaveDialog } from "@/components/admin/ConfirmPricingSaveDialog";
import { estimateMonthlyOrgAmountCents } from "@/lib/orgBillingEstimate";
import {
  DEFAULT_FIXED_PLAN_PRICING,
  type FixedPlanPricingConfig,
} from "@/lib/fixedPlanPricingConfig";
import { DEFAULT_TIERED_SEAT_MODEL, formatEuroMajor, type TieredSeatModel } from "@/lib/tieredSeatPricing";
import { parseSeatCalculatorJson } from "@/lib/seatCalculatorJson";

export type OrgBillingPricingOrg = {
  id: string;
  name: string;
  customDiscountPercent: number | null;
  customFlatRateCents: number | null;
  customFlatRateMaxUsers: number | null;
  customUserDailyRateCents: number | null;
  customSeatCalculatorJson: string | null;
  globalDefaultSeatCalculatorJson?: string | null;
  seatCalculatorDefaults?: {
    yearlyDiscountPercent: number;
    yearlyDiscountEnabled: boolean;
  };
  billingCurrencyCode: string;
  estimatedMonthlyCents: number;
  estimatedCurrencyCode: string;
  users?: Array<{ id: string }>;
};

type AdminBillingSettingsSlice = {
  fixedAnnualRoundToTen?: boolean;
  fixedPlanPricing?: FixedPlanPricingConfig;
};

function formatEditableMajorFromCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "";
  const major = cents / 100;
  const fixed = major.toFixed(2);
  return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function majorToCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(1, Math.round(parsed * 100));
}

function parseOptionalPercent(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function mergeSeatModelFromJson(json: string | null | undefined): TieredSeatModel {
  const parsed = parseSeatCalculatorJson(json ?? null);
  return { ...DEFAULT_TIERED_SEAT_MODEL, ...parsed?.model };
}

function orgHasCustomOverrides(org: OrgBillingPricingOrg): boolean {
  return (
    org.customUserDailyRateCents != null ||
    org.customDiscountPercent != null ||
    org.customFlatRateCents != null ||
    org.customFlatRateMaxUsers != null ||
    Boolean(org.customSeatCalculatorJson?.trim())
  );
}

type FormState = {
  billingCurrencyCode: string;
  customUserDailyRateMajor: string;
  customDiscountPercent: string;
  customFlatRateMajor: string;
  customFlatRateMaxUsers: string;
  previewBillableSeats: string;
};

export function OrgBillingPricingPanel({ org }: { org: OrgBillingPricingOrg }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [overrideStandardPricing, setOverrideStandardPricing] = useState(() => orgHasCustomOverrides(org));
  const [useCustomSeatCurve, setUseCustomSeatCurve] = useState(() => Boolean(org.customSeatCalculatorJson?.trim()));
  const [seatModel, setSeatModel] = useState<TieredSeatModel>(() =>
    mergeSeatModelFromJson(org.customSeatCalculatorJson ?? org.globalDefaultSeatCalculatorJson),
  );
  const [form, setForm] = useState<FormState>(() => ({
    billingCurrencyCode: org.billingCurrencyCode || "EUR",
    customUserDailyRateMajor: formatEditableMajorFromCents(org.customUserDailyRateCents),
    customDiscountPercent: org.customDiscountPercent == null ? "" : String(org.customDiscountPercent),
    customFlatRateMajor: formatEditableMajorFromCents(org.customFlatRateCents),
    customFlatRateMaxUsers: org.customFlatRateMaxUsers == null ? "" : String(org.customFlatRateMaxUsers),
    previewBillableSeats: "10",
  }));

  const { data: billingSettings } = useQuery<AdminBillingSettingsSlice>({
    queryKey: ["admin", "billing-settings"],
    queryFn: () => api.get("/api/admin/billing/settings"),
    staleTime: 60_000,
  });

  const fixedPlan = billingSettings?.fixedPlanPricing ?? DEFAULT_FIXED_PLAN_PRICING;
  const fixedAnnualRoundToTen = billingSettings?.fixedAnnualRoundToTen !== false;
  const globalSeatModel = useMemo(
    () => mergeSeatModelFromJson(org.globalDefaultSeatCalculatorJson),
    [org.globalDefaultSeatCalculatorJson],
  );
  const calculatorSeatModel = overrideStandardPricing
    ? useCustomSeatCurve
      ? seatModel
      : globalSeatModel
    : globalSeatModel;

  const activeMemberCount = org.users?.length ?? 0;
  const tableRateCents = 1500;

  useEffect(() => {
    setOverrideStandardPricing(orgHasCustomOverrides(org));
    setUseCustomSeatCurve(Boolean(org.customSeatCalculatorJson?.trim()));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when org record or any override field changes
  }, [org.id, org.customSeatCalculatorJson, org.customUserDailyRateCents, org.customDiscountPercent, org.customFlatRateCents, org.customFlatRateMaxUsers]);

  useEffect(() => {
    setForm((prev) => ({
      billingCurrencyCode: org.billingCurrencyCode || "EUR",
      customUserDailyRateMajor: formatEditableMajorFromCents(org.customUserDailyRateCents),
      customDiscountPercent: org.customDiscountPercent == null ? "" : String(org.customDiscountPercent),
      customFlatRateMajor: formatEditableMajorFromCents(org.customFlatRateCents),
      customFlatRateMaxUsers: org.customFlatRateMaxUsers == null ? "" : String(org.customFlatRateMaxUsers),
      previewBillableSeats: prev.previewBillableSeats,
    }));
  }, [
    org.id,
    org.customDiscountPercent,
    org.customFlatRateCents,
    org.customFlatRateMaxUsers,
    org.billingCurrencyCode,
    org.customUserDailyRateCents,
  ]);

  useEffect(() => {
    if (!overrideStandardPricing) {
      setSeatModel(globalSeatModel);
      setUseCustomSeatCurve(false);
      return;
    }
    if (useCustomSeatCurve && org.customSeatCalculatorJson?.trim()) {
      setSeatModel(mergeSeatModelFromJson(org.customSeatCalculatorJson));
    } else {
      setSeatModel(globalSeatModel);
    }
  }, [overrideStandardPricing, useCustomSeatCurve, org.customSeatCalculatorJson, globalSeatModel]);

  const draftPayload = useMemo(() => {
    if (!overrideStandardPricing) {
      return {
        customUserDailyRateCents: null as number | null,
        customDiscountPercent: null as number | null,
        customFlatRateCents: null as number | null,
        customFlatRateMaxUsers: null as number | null,
        billingCurrencyCode: org.billingCurrencyCode || "EUR",
        customSeatCalculatorJson: null as string | null,
      };
    }
    const flatCents = majorToCents(form.customFlatRateMajor);
    const flatMax = form.customFlatRateMaxUsers.trim() ? Number(form.customFlatRateMaxUsers) : null;
    return {
      customUserDailyRateCents: majorToCents(form.customUserDailyRateMajor),
      customDiscountPercent: parseOptionalPercent(form.customDiscountPercent),
      customFlatRateCents: flatCents,
      customFlatRateMaxUsers:
        flatMax != null && Number.isFinite(flatMax) && flatMax > 0 ? Math.round(flatMax) : null,
      billingCurrencyCode: form.billingCurrencyCode.trim().toUpperCase() || "EUR",
      customSeatCalculatorJson: useCustomSeatCurve
        ? JSON.stringify({ model: seatModel, yearlyDiscountPercent: 0, yearlyDiscountEnabled: false })
        : null,
    };
  }, [form, overrideStandardPricing, useCustomSeatCurve, seatModel, org.billingCurrencyCode]);

  const previewBillable = useMemo(() => {
    const n = Math.round(Number(form.previewBillableSeats));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [form.previewBillableSeats]);

  const previewCents = useMemo(
    () =>
      estimateMonthlyOrgAmountCents({
        billableUsers: previewBillable,
        perUserMonthlyRateCents: tableRateCents,
        customUserMonthlyRateCents: draftPayload.customUserDailyRateCents,
        customDiscountPercent: draftPayload.customDiscountPercent,
        customFlatRateCents: draftPayload.customFlatRateCents,
        customFlatRateMaxUsers: draftPayload.customFlatRateMaxUsers,
        activeMemberCount,
        orgSeatCalculatorJson: draftPayload.customSeatCalculatorJson,
        globalSeatCalculatorJson: org.globalDefaultSeatCalculatorJson ?? null,
      }),
    [previewBillable, draftPayload, activeMemberCount, org.globalDefaultSeatCalculatorJson],
  );

  const flatCapActive =
    overrideStandardPricing &&
    draftPayload.customFlatRateCents != null &&
    draftPayload.customFlatRateMaxUsers != null &&
    activeMemberCount <= draftPayload.customFlatRateMaxUsers;

  function validateBeforeSave(): string | null {
    if (!overrideStandardPricing) return null;
    const hasFlat = draftPayload.customFlatRateCents != null;
    const hasMax = draftPayload.customFlatRateMaxUsers != null;
    if (hasFlat !== hasMax) {
      return "Monthly cap amount and member limit must both be set or both left empty.";
    }
    if (
      draftPayload.customDiscountPercent != null &&
      (draftPayload.customDiscountPercent < 0 || draftPayload.customDiscountPercent > 100)
    ) {
      return "Discount must be between 0 and 100.";
    }
    return null;
  }

  const pricingMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/admin/orgs/${org.id}/billing-pricing`, {
        customUserDailyRateCents: draftPayload.customUserDailyRateCents,
        customSeatCalculatorJson: draftPayload.customSeatCalculatorJson,
        customDiscountPercent: draftPayload.customDiscountPercent,
        customFlatRateCents: draftPayload.customFlatRateCents,
        customFlatRateMaxUsers: draftPayload.customFlatRateMaxUsers,
        billingCurrencyCode: draftPayload.billingCurrencyCode,
      }),
    onSuccess: () => {
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin", "orgs", org.id] });
      toast({ title: "Saved", description: "Organization billing pricing updated." });
    },
    onError: (err) => {
      toast({
        title: "Error",
        description: isApiError(err) ? err.message : "Failed to save pricing.",
        variant: "destructive",
      });
    },
  });

  const confirmSummary = (
    <ul className="list-disc pl-4 space-y-1 text-white/70">
      <li>
        Pricing mode:{" "}
        <strong className="text-white/90">
          {overrideStandardPricing ? "Custom overrides" : "Standard (global admin pricing)"}
        </strong>
      </li>
      {overrideStandardPricing ? (
        <>
          <li>
            Billing currency: <strong className="text-white/90">{draftPayload.billingCurrencyCode}</strong>
          </li>
          <li>
            Fixed per-seat:{" "}
            <strong className="text-white/90">
              {draftPayload.customUserDailyRateCents != null
                ? `${formatEuroMajor(draftPayload.customUserDailyRateCents / 100)}/seat/mo`
                : "none (seat curve)"}
            </strong>
          </li>
          <li>
            Discount:{" "}
            <strong className="text-white/90">
              {draftPayload.customDiscountPercent != null ? `${draftPayload.customDiscountPercent}%` : "none"}
            </strong>
          </li>
          <li>
            Monthly cap:{" "}
            <strong className="text-white/90">
              {draftPayload.customFlatRateCents != null && draftPayload.customFlatRateMaxUsers != null
                ? `${formatEuroMajor(draftPayload.customFlatRateCents / 100)} when ≤ ${draftPayload.customFlatRateMaxUsers} active members`
                : "none"}
            </strong>
          </li>
          <li>
            Seat curve:{" "}
            <strong className="text-white/90">{useCustomSeatCurve ? "organisation-specific" : "global default"}</strong>
          </li>
        </>
      ) : null}
      <li>
        Preview at {previewBillable} billable seats:{" "}
        <strong className="text-white/90">{formatEuroMajor(previewCents / 100)}/mo</strong>
        {flatCapActive ? " (flat cap applies)" : null}
      </li>
    </ul>
  );

  return (
    <>
      <Card className="bg-gray-900 border border-white/10">
        <CardHeader className="space-y-3">
          <div>
            <CardTitle className="text-white text-base">Organisation pricing</CardTitle>
            <p className="text-xs text-white/50 font-normal mt-1">
              By default this organisation follows the global admin pricing shown below. Enable overrides only when
              this organisation needs different Flex billing rules.
            </p>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-ordo-magenta/30 bg-ordo-magenta/5 p-3">
            <Checkbox
              id="org-override-standard-pricing"
              checked={overrideStandardPricing}
              onCheckedChange={(v) => {
                const on = v === true;
                setOverrideStandardPricing(on);
                if (!on) {
                  setUseCustomSeatCurve(false);
                  setSeatModel(globalSeatModel);
                }
              }}
              className="mt-0.5 border-white/30 data-[state=checked]:bg-ordo-magenta data-[state=checked]:border-ordo-magenta"
            />
            <div className="space-y-0.5">
              <Label htmlFor="org-override-standard-pricing" className="text-sm text-white/90 cursor-pointer">
                Override standard pricing
              </Label>
              <p className="text-[11px] text-white/45 leading-snug">
                When off, all custom fields are cleared on save and invoices use global Flex and Yearly rates.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-xl border border-ordo-violet/35 bg-gradient-to-b from-ordo-violet/10 to-transparent p-4 md:p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ordo-yellow/90 mb-3">Standard pricing</p>
            <TieredSeatPricingCalculator
              compareFlexFixedPlans
              showTrialBadge={false}
              seatModel={calculatorSeatModel}
              fixedPlanPricing={fixedPlan}
              fixedAnnualRoundToTen={fixedAnnualRoundToTen}
            />
          </div>

          {overrideStandardPricing ? (
            <div className="space-y-4 border-t border-white/10 pt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-ordo-magenta/90">Custom overrides</p>

              <div className="space-y-1">
                <Label className="text-xs text-white/50">Billing currency</Label>
                <Input
                  placeholder="EUR"
                  value={form.billingCurrencyCode}
                  onChange={(e) => setForm((p) => ({ ...p, billingCurrencyCode: e.target.value.toUpperCase() }))}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-white/50">Fixed price per billable seat / month (EUR)</Label>
                <Input
                  placeholder="Leave empty to use tiered seat curve"
                  value={form.customUserDailyRateMajor}
                  onChange={(e) => setForm((p) => ({ ...p, customUserDailyRateMajor: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-white/50">Discount on curve subtotal (%)</Label>
                <Input
                  inputMode="numeric"
                  placeholder="e.g. 10"
                  value={form.customDiscountPercent}
                  onChange={(e) => setForm((p) => ({ ...p, customDiscountPercent: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-white/50">Monthly cap (EUR)</Label>
                <Input
                  placeholder="e.g. 500"
                  value={form.customFlatRateMajor}
                  onChange={(e) => setForm((p) => ({ ...p, customFlatRateMajor: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-white/50">Cap applies when active members ≤</Label>
                <Input
                  inputMode="numeric"
                  placeholder="e.g. 25"
                  value={form.customFlatRateMaxUsers}
                  onChange={(e) => setForm((p) => ({ ...p, customFlatRateMaxUsers: e.target.value }))}
                />
                <p className="text-[11px] text-white/40">
                  Both cap fields required together ({activeMemberCount} active members now).
                </p>
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <Checkbox
                  id="org-custom-seat-curve"
                  checked={useCustomSeatCurve}
                  onCheckedChange={(v) => setUseCustomSeatCurve(v === true)}
                  className="mt-0.5 border-white/30 data-[state=checked]:bg-ordo-magenta data-[state=checked]:border-ordo-magenta"
                />
                <div className="space-y-0.5">
                  <Label htmlFor="org-custom-seat-curve" className="text-sm text-white/85 cursor-pointer">
                    Custom Flex seat curve
                  </Label>
                  <p className="text-[11px] text-white/45 leading-snug">
                    When off, Flex uses the global seat curve from admin pricing (chart above).
                  </p>
                </div>
              </div>

              {useCustomSeatCurve ? (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-[11px] text-white/50 mb-3">Edit organisation Flex curve (EUR)</p>
                  <TieredSeatPricingCalculator
                    showTrialBadge={false}
                    showModelControls
                    seatModel={seatModel}
                    onSeatModelChange={setSeatModel}
                  />
                </div>
              ) : null}

              <div className="space-y-1">
                <Label className="text-xs text-white/50">Preview billable seats</Label>
                <Input
                  inputMode="numeric"
                  value={form.previewBillableSeats}
                  onChange={(e) => setForm((p) => ({ ...p, previewBillableSeats: e.target.value }))}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-white/55 border-t border-white/10 pt-4">
              Using global admin pricing. Save to clear any existing organisation overrides.
            </p>
          )}

          <div className="rounded-lg border border-ordo-yellow/25 bg-ordo-yellow/5 px-3 py-2 text-sm text-white/80">
            Estimated this month (server): {org.estimatedCurrencyCode}{" "}
            {(org.estimatedMonthlyCents / 100).toFixed(2)} · Draft at {previewBillable} billable:{" "}
            <strong className="text-ordo-yellow/95">{formatEuroMajor(previewCents / 100)}/mo</strong>
          </div>

          <Button
            type="button"
            className="w-full bg-rose-700 hover:bg-rose-600"
            disabled={pricingMutation.isPending}
            onClick={() => {
              const err = validateBeforeSave();
              if (err) {
                toast({ title: "Cannot save", description: err, variant: "destructive" });
                return;
              }
              setConfirmOpen(true);
            }}
          >
            Save organisation pricing
          </Button>
        </CardContent>
      </Card>

      <ConfirmPricingSaveDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Save organisation pricing?"
        description={
          <>
            <p>
              These settings apply to <strong className="text-white/90">{org.name}</strong> Flex billing.
            </p>
            {confirmSummary}
          </>
        }
        confirmLabel="Save organisation pricing"
        pending={pricingMutation.isPending}
        onConfirm={() => pricingMutation.mutate()}
      />
    </>
  );
}
