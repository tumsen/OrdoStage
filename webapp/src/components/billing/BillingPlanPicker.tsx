import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, isApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatEuroMajor } from "@/lib/tieredSeatPricing";
import {
  FLEX_FIXED_MAX_SEATS,
  FLEX_FIXED_MIN_SEATS,
  annualDiscountPercent,
  annualInvoiceTotalMajor,
  annualMonthlyEquivMajor,
  annualSavingMajor,
  flexMonthlyTotalMajor,
  requiresEnterpriseContact,
} from "@/lib/flexFixedPricing";
import { FlexFixedPlanComparison } from "@/components/pricing/FlexFixedPlanComparison";
import { z } from "zod";
import type {
  FixedCheckoutResponseSchema,
  FixedSeatIncreaseQuoteSchema,
} from "@/contracts/backendTypes";

type Props = {
  billingPlan: "flex" | "fixed";
  committedSeats: number | null;
  annualRenewalDate: string | null;
  billableCountThisMonth: number;
  isOwner: boolean;
  fixedAnnualRoundToTen?: boolean;
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
}: Props) {
  const { toast } = useToast();
  const [checkoutSeats, setCheckoutSeats] = useState(10);
  const [increaseSeats, setIncreaseSeats] = useState(() => (committedSeats ?? 10) + 5);

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
          description: "Self-serve Fixed checkout is available up to 150 seats.",
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
        description: isApiError(err) ? err.message : "Could not start Fixed checkout.",
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

  if (billingPlan === "fixed" && committedSeats != null) {
    const overage =
      billableCountThisMonth > committedSeats ? billableCountThisMonth - committedSeats : 0;
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-ordo-violet/30 bg-ordo-violet/10 px-4 py-3 text-sm text-white/85">
          <p className="font-medium text-white">Yearly plan active</p>
          <p className="mt-1 text-white/65">
            {committedSeats} committed seats · renews{" "}
            {annualRenewalDate ? new Date(annualRenewalDate).toLocaleDateString() : "—"}
          </p>
          {overage > 0 ? (
            <p className="mt-2 text-amber-200/90">
              {overage} billable seat{overage === 1 ? "" : "s"} above commitment this month — overage is invoiced
              monthly at Flex marginal rates.
            </p>
          ) : (
            <p className="mt-2 text-white/55">No overage above your commitment this month.</p>
          )}
        </div>

        {isOwner ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
            <p className="text-sm font-medium text-white">Increase committed seats</p>
            <p className="text-xs text-white/50">
              You cannot reduce seats during the annual term. Increases are charged as a prorated top-up for the
              remainder of the term.
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
            {requiresEnterpriseContact(increaseSeats) ? (
              <p className="text-xs text-amber-200/90">For more than 150 seats, contact Ordo Stage for enterprise pricing.</p>
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
              Flex marginal rates. Yearly does not include a free trial — commit and pay at checkout.
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
                className="w-full"
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
            <p className="text-emerald-200/90">Save {formatEuroMajor(quote.saving)}/yr vs Flex</p>
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
