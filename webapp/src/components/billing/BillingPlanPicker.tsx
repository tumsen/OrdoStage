import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, isApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatEuroMajor } from "@/lib/tieredSeatPricing";
import {
  activeTemporarySeatsBoost,
  effectiveYearlyCommittedSeats,
  FLEX_FIXED_MAX_SEATS,
  FLEX_FIXED_MIN_SEATS,
  annualDiscountPercent,
  annualInvoiceTotalMajor,
  annualMonthlyEquivMajor,
  annualSavingMajor,
  flexMonthlyTotalMajor,
  requiresEnterpriseContact,
  temporarySeatPassTotalMajor,
} from "@/lib/flexFixedPricing";
import { FlexFixedPlanComparison } from "@/components/pricing/FlexFixedPlanComparison";
import { pricingSeatRangeClass } from "@/components/pricing/pricingSeatRangeClass";
import { z } from "zod";
import type {
  FixedCheckoutResponseSchema,
  FixedSeatIncreaseQuoteSchema,
  FixedTemporaryPassQuoteSchema,
} from "@/contracts/backendTypes";

type Props = {
  billingPlan: "flex" | "fixed";
  committedSeats: number | null;
  annualRenewalDate: string | null;
  billableCountThisMonth: number;
  isOwner: boolean;
  fixedAnnualRoundToTen?: boolean;
  temporarySeatsBoost?: number | null;
  temporarySeatsBoostExpiresAt?: string | null;
  temporarySeatPassEnabled?: boolean;
  temporarySeatPassDays?: number;
  temporarySeatPassPricePerSeatMajor?: number;
  effectiveCommittedSeats?: number | null;
};

function clampSeats(n: number): number {
  return Math.min(200, Math.max(FLEX_FIXED_MIN_SEATS, Math.round(n)));
}

export function BillingPlanPicker({
  billingPlan,
  committedSeats,
  annualRenewalDate,
  billableCountThisMonth,
  isOwner,
  fixedAnnualRoundToTen = true,
  temporarySeatsBoost = null,
  temporarySeatsBoostExpiresAt = null,
  temporarySeatPassEnabled = true,
  temporarySeatPassDays = 30,
  temporarySeatPassPricePerSeatMajor = 25,
  effectiveCommittedSeats: effectiveCommittedProp = null,
}: Props) {
  const { toast } = useToast();
  const [checkoutSeats, setCheckoutSeats] = useState(10);
  const [increaseSeats, setIncreaseSeats] = useState(() => (committedSeats ?? 10) + 5);
  const [passExtraSeats, setPassExtraSeats] = useState(() => {
    const c = committedSeats ?? 0;
    return Math.max(1, billableCountThisMonth - c);
  });

  const roundTen = fixedAnnualRoundToTen;
  const quote = useMemo(() => {
    const n = clampSeats(checkoutSeats);
    return {
      n,
      flexMo: flexMonthlyTotalMajor(n),
      fixedMo: annualMonthlyEquivMajor(n),
      annual: annualInvoiceTotalMajor(n, roundTen),
      discount: annualDiscountPercent(n),
      saving: annualSavingMajor(n, roundTen),
      enterprise: requiresEnterpriseContact(n),
    };
  }, [checkoutSeats, roundTen]);

  const fixedCheckout = useMutation({
    mutationFn: () =>
      api.post<z.infer<typeof FixedCheckoutResponseSchema>>("/api/billing/fixed/checkout", {
        seats: quote.n,
      }),
    onSuccess: (data) => {
      if (data.requiresEnterpriseContact) {
        toast({
          title: "Contact us for 150+ seats",
          description: "Self-serve Yearly checkout is available up to 150 seats.",
        });
        return;
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      toast({ title: "Checkout unavailable", description: "Paddle did not return a checkout URL.", variant: "destructive" });
    },
    onError: (err) => {
      toast({
        title: "Checkout failed",
        description: isApiError(err) ? err.message : "Could not start Yearly checkout.",
        variant: "destructive",
      });
    },
  });

  const increaseQuote = useMutation({
    mutationFn: (newSeats: number) =>
      api.get<z.infer<typeof FixedSeatIncreaseQuoteSchema>>(
        `/api/billing/fixed/seat-increase-quote?newCommittedSeats=${newSeats}`,
      ),
  });

  const increaseCheckout = useMutation({
    mutationFn: (newSeats: number) =>
      api.post<{ checkoutUrl: string | null; topUpCents: number }>("/api/billing/fixed/seat-increase", {
        newCommittedSeats: newSeats,
      }),
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      toast({ title: "Checkout unavailable", variant: "destructive" });
    },
    onError: (err) => {
      toast({
        title: "Could not start top-up",
        description: isApiError(err) ? err.message : "Try again later.",
        variant: "destructive",
      });
    },
  });

  const passQuote = useMutation({
    mutationFn: (extraSeats: number) =>
      api.get<z.infer<typeof FixedTemporaryPassQuoteSchema>>(
        `/api/billing/fixed/temporary-pass-quote?extraSeats=${extraSeats}`,
      ),
  });

  const passCheckout = useMutation({
    mutationFn: (extraSeats: number) =>
      api.post<{ checkoutUrl: string | null; totalCents: number; passDays: number }>(
        "/api/billing/fixed/temporary-pass-checkout",
        { extraSeats },
      ),
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      toast({ title: "Checkout unavailable", variant: "destructive" });
    },
    onError: (err) => {
      toast({
        title: "Could not start pass checkout",
        description: isApiError(err) ? err.message : "Try again later.",
        variant: "destructive",
      });
    },
  });

  if (billingPlan === "fixed" && committedSeats != null) {
    const effectiveCommitted =
      effectiveCommittedProp ??
      effectiveYearlyCommittedSeats(committedSeats, temporarySeatsBoost, temporarySeatsBoostExpiresAt);
    const activeBoost = activeTemporarySeatsBoost(temporarySeatsBoost, temporarySeatsBoostExpiresAt);
    const overage =
      billableCountThisMonth > effectiveCommitted ? billableCountThisMonth - effectiveCommitted : 0;
    const passTotalPreview = temporarySeatPassEnabled
      ? temporarySeatPassTotalMajor(passExtraSeats, {
          firstSeatMonthlyMajor: 30,
          monthlyVolumeDiscountPercentMin: 15,
          monthlyVolumeDiscountPercentMax: 42,
          annualVolumeDiscountPercentMin: 15,
          annualVolumeDiscountPercentMax: 42,
          discountCapSeats: 150,
          selfServeMaxSeats: 150,
          temporarySeatPassEnabled: true,
          temporarySeatPassDays,
          temporarySeatPassPricePerSeatMajor,
        })
      : 0;

    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-ordo-violet/30 bg-ordo-violet/10 px-4 py-3 text-sm text-white/85">
          <p className="font-medium text-white">Yearly plan active</p>
          <p className="mt-1 text-white/65">
            {committedSeats} committed seats
            {activeBoost > 0 && temporarySeatsBoostExpiresAt
              ? ` · +${activeBoost} short-term until ${new Date(temporarySeatsBoostExpiresAt).toLocaleDateString()}`
              : ""}{" "}
            · renews {annualRenewalDate ? new Date(annualRenewalDate).toLocaleDateString() : "—"}
          </p>
          {overage > 0 ? (
            <p className="mt-2 text-amber-200/90">
              {overage} billable seat{overage === 1 ? "" : "s"} above your effective cover ({effectiveCommitted}) —
              choose a top-up below or pay monthly overage at Flex marginal rates.
            </p>
          ) : (
            <p className="mt-2 text-white/55">No overage above your effective cover this month.</p>
          )}
        </div>

        {isOwner ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <p className="text-sm font-medium text-white">Raise commitment (rest of year)</p>
              <p className="text-xs text-white/50">
                Permanently increase committed seats for the remainder of your annual term. Prorated charge at
                checkout.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="increase-seats" className="text-xs text-white/50">
                    New committed seats
                  </Label>
                  <input
                    id="increase-seats"
                    type="number"
                    min={committedSeats + 1}
                    max={200}
                    value={increaseSeats}
                    onChange={(e) => setIncreaseSeats(clampSeats(Number(e.target.value)))}
                    className="h-9 w-28 rounded-md border border-white/15 bg-black/30 px-2 text-white tabular-nums"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/15"
                  disabled={increaseSeats <= committedSeats || increaseQuote.isPending}
                  onClick={() => increaseQuote.mutate(increaseSeats)}
                >
                  Preview top-up
                </Button>
                <Button
                  type="button"
                  className="bg-rose-700 hover:bg-rose-600"
                  disabled={
                    increaseSeats <= committedSeats ||
                    increaseCheckout.isPending ||
                    requiresEnterpriseContact(increaseSeats)
                  }
                  onClick={() => increaseCheckout.mutate(increaseSeats)}
                >
                  {increaseCheckout.isPending ? "Starting…" : "Pay prorated top-up"}
                </Button>
              </div>
              {increaseQuote.data ? (
                <p className="text-sm text-white/70">
                  Prorated top-up: {formatEuroMajor(increaseQuote.data.topUpCents / 100)} (
                  {Math.round(increaseQuote.data.monthsRemainingFraction * 100)}% of term remaining)
                </p>
              ) : null}
            </div>

            {temporarySeatPassEnabled ? (
              <div className="rounded-xl border border-ordo-yellow/25 bg-ordo-yellow/5 p-4 space-y-3">
                <p className="text-sm font-medium text-white">Short-term seat pass</p>
                <p className="text-xs text-white/50">
                  Cover extra seats for {temporarySeatPassDays} days without changing your annual commitment. Overage
                  billing is waived for those seats while the pass is active.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="pass-extra-seats" className="text-xs text-white/50">
                      Extra seats
                    </Label>
                    <input
                      id="pass-extra-seats"
                      type="number"
                      min={1}
                      max={50}
                      value={passExtraSeats}
                      onChange={(e) => setPassExtraSeats(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                      className="h-9 w-28 rounded-md border border-white/15 bg-black/30 px-2 text-white tabular-nums"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-white/15"
                    disabled={passQuote.isPending}
                    onClick={() => passQuote.mutate(passExtraSeats)}
                  >
                    Preview pass
                  </Button>
                  <Button
                    type="button"
                    className="bg-rose-700 hover:bg-rose-600"
                    disabled={passCheckout.isPending}
                    onClick={() => passCheckout.mutate(passExtraSeats)}
                  >
                    {passCheckout.isPending ? "Starting…" : "Pay for pass"}
                  </Button>
                </div>
                {passQuote.data ? (
                  <p className="text-sm text-white/70">
                    Pass total: {formatEuroMajor(passQuote.data.totalCents / 100)} (
                    {formatEuroMajor(passQuote.data.pricePerSeatMajor)}/seat · {passQuote.data.passDays} days)
                  </p>
                ) : (
                  <p className="text-sm text-white/55">
                    Est. {formatEuroMajor(passTotalPreview)} for {passExtraSeats} seat
                    {passExtraSeats === 1 ? "" : "s"} · {temporarySeatPassDays} days
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FlexFixedPlanComparison />

      {isOwner ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-white">Switch to Yearly</p>
            <p className="text-xs text-white/50 mt-1">
              Pay annually upfront via Paddle for your committed seats. Overage above commitment is billed monthly at
              Flex marginal rates unless you buy a short-term seat pass. Yearly does not include a free trial.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1 min-w-[12rem] flex-1 max-w-md">
              <Label htmlFor="fixed-checkout-seats" className="text-xs text-white/50">
                Committed seats
              </Label>
              <input
                id="fixed-checkout-seats"
                type="range"
                min={FLEX_FIXED_MIN_SEATS}
                max={FLEX_FIXED_MAX_SEATS}
                value={Math.min(quote.n, FLEX_FIXED_MAX_SEATS)}
                onChange={(e) => setCheckoutSeats(Number(e.target.value))}
                className={pricingSeatRangeClass}
              />
              <p className="text-sm text-white tabular-nums">{quote.n} seats</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <p className="text-white/70">
              Annual invoice: <span className="text-white font-medium">{formatEuroMajor(quote.annual)}</span>
              {roundTen ? <span className="text-white/45 text-xs"> (rounded to €10)</span> : null}
            </p>
            <p className="text-white/70">
              Discount: <span className="text-white font-medium">{quote.discount.toFixed(1)}%</span>
            </p>
            <p className="text-ordo-yellow/90">Save {formatEuroMajor(quote.saving)}/yr vs Flex</p>
          </div>

          {quote.enterprise ? (
            <p className="text-sm text-amber-200/90">More than 150 seats requires an enterprise conversation.</p>
          ) : (
            <Button
              type="button"
              className="bg-rose-700 hover:bg-rose-600"
              disabled={fixedCheckout.isPending}
              onClick={() => fixedCheckout.mutate()}
            >
              {fixedCheckout.isPending ? "Opening checkout…" : "Continue to Paddle checkout (Yearly)"}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-white/45">Only organisation owners can start Yearly checkout.</p>
      )}
    </div>
  );
}
