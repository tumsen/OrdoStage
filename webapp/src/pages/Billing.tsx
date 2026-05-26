import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, isApiError } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { openPaddleCheckout } from "@/lib/paddleCheckout";
import { BillingPlanPicker } from "@/components/billing/BillingPlanPicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt, Users } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface BillableMemberRow {
  id: string;
  name: string | null;
  email: string;
}

interface OrgBillingData {
  id: string;
  name: string;
  billingStatus: string;
  billingPlan?: string;
  committedSeats?: number | null;
  annualRenewalDate?: string | null;
  billingCurrencyCode?: string;
  paymentDueDays: number;
  fixedOverageEstimateCents?: number;
  fixedAnnualRoundToTen?: boolean;
  temporarySeatsBoost?: number | null;
  temporarySeatsBoostExpiresAt?: string | null;
  temporarySeatPassEnabled?: boolean;
  temporarySeatPassDays?: number;
  temporarySeatPassPricePerSeatMajor?: number;
  effectiveCommittedSeats?: number | null;
  paddleBilling?: { configured: boolean; environment: "sandbox" | "live" };
  billingTrialDays?: number;
  billingGraceDaysAfterDue?: number;
  billingOnTrial?: boolean;
  trialEndsAt?: string | null;
  billingInGraceAfterDue?: boolean;
  billingReadOnlyEffectiveAt?: string | null;
  estimatedMonthlyCents?: number;
  estimatedCurrencyCode?: string;
  billableMembersThisMonth?: BillableMemberRow[];
  openInvoice?: {
    id: string;
    issuedAt: string;
    dueAt: string;
    status: string;
    totalCents: number;
    paddleInvoiceUrl?: string | null;
    lines: Array<{
      id: string;
      userName: string | null;
      userEmail: string | null;
      daysConsumed: number;
      rateCents: number;
      subtotalCents: number;
    }>;
  } | null;
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function Billing({ embedded = false }: { embedded?: boolean } = {}) {
  const { canAction, isOwner } = usePermissions();
  const canManageBilling = canAction("billing.manage");
  const { data: org, isLoading } = useQuery<OrgBillingData>({
    queryKey: ["org"],
    queryFn: () => api.get<OrgBillingData>("/api/org"),
  });

  const billable = org?.billableMembersThisMonth ?? [];
  const trialDays = org?.billingTrialDays ?? 0;
  const graceDays = org?.billingGraceDaysAfterDue ?? 0;
  const billingPlan = org?.billingPlan === "fixed" ? "fixed" : "flex";

  const payInvoiceMutation = useMutation({
    mutationFn: () =>
      api.post<{ checkoutUrl: string | null; paddleTransactionId?: string | null }>(
        "/api/billing/open-invoice/checkout",
        {},
      ),
    onSuccess: async (data) => {
      const mode = await openPaddleCheckout({
        paddleTransactionId: data.paddleTransactionId,
        checkoutUrl: data.checkoutUrl,
      });
      if (mode === "unavailable") {
        toast({
          title: "Checkout unavailable",
          description:
            "Paddle did not return a payment link. Enable Checkout and set your default payment link in Paddle.",
          variant: "destructive",
        });
      }
    },
    onError: (err) => {
      toast({
        title: "Could not open payment",
        description: isApiError(err) ? err.message : "Paddle checkout failed.",
        variant: "destructive",
      });
    },
  });

  const openInvoicePayUrl = org?.openInvoice?.paddleInvoiceUrl?.trim() || null;

  return (
    <div className={embedded ? "space-y-8" : "p-6 md:p-8 space-y-8"}>
      {!embedded ? (
        <div>
          <h2 className="text-2xl font-bold text-white">Billing</h2>
          <p className="text-gray-400 mt-2 text-sm leading-relaxed max-w-3xl">
            You only pay for seats that actually get used in a calendar month. If nobody on your team had billable
            activity (show jobs, staffing, event edits, or logged work time), that month costs nothing for those idle
            seats. When people do contribute, each billable member counts as one seat for that month—no charge for
            months where they stay inactive.
          </p>
          <p className="text-gray-400 mt-2 text-sm leading-relaxed max-w-3xl">
            Invoices cover the <strong className="text-white/80 font-medium">previous</strong> calendar month and are
            due within {org?.paymentDueDays ?? 7} days of issue.
            {trialDays > 0 ? (
              <>
                {" "}
                New workspaces have a <strong className="text-white/80 font-medium">{trialDays}-day trial</strong> from
                creation: unpaid invoices do not switch the organization to read-only during the trial.
              </>
            ) : null}
            {graceDays > 0 ? (
              <>
                {" "}
                After the due date there is a <strong className="text-white/80 font-medium">{graceDays}-day grace</strong>{" "}
                period before the account becomes read-only.
              </>
            ) : (
              <> If an invoice stays unpaid after the due date, the organization becomes read-only until payment.</>
            )}
          </p>
        </div>
      ) : null}

      {org?.billingOnTrial ? (
        <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/25 px-4 py-3 text-sm text-emerald-100/90">
          Trial active until {formatShortDate(org.trialEndsAt)}. Billing reminders may still appear, but read-only mode
          does not apply from unpaid invoices until after the trial.
        </div>
      ) : null}

      {org?.billingInGraceAfterDue ? (
        <div className="rounded-lg border border-amber-800/40 bg-amber-950/25 px-4 py-3 text-sm text-amber-100/90">
          Payment is past the invoice due date. You have until{" "}
          <strong className="text-amber-50">{formatShortDate(org.billingReadOnlyEffectiveAt)}</strong> before the
          workspace switches to read-only unless the invoice is paid.
        </div>
      ) : null}

      <BillingPlanPicker
        billingPlan={billingPlan}
        paddleBilling={org?.paddleBilling}
        committedSeats={org?.committedSeats ?? null}
        annualRenewalDate={org?.annualRenewalDate ?? null}
        billableCountThisMonth={billable.length}
        isOwner={isOwner}
        fixedAnnualRoundToTen={org?.fixedAnnualRoundToTen !== false}
        temporarySeatsBoost={org?.temporarySeatsBoost ?? null}
        temporarySeatsBoostExpiresAt={org?.temporarySeatsBoostExpiresAt ?? null}
        temporarySeatPassEnabled={org?.temporarySeatPassEnabled !== false}
        temporarySeatPassDays={org?.temporarySeatPassDays ?? 30}
        temporarySeatPassPricePerSeatMajor={org?.temporarySeatPassPricePerSeatMajor ?? 25}
        effectiveCommittedSeats={org?.effectiveCommittedSeats ?? null}
      />

      <Card className="bg-gray-900 border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users size={16} />
            Billable members this month
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-white/50 mb-3 leading-relaxed">
            UTC calendar month to date: people listed here had at least one billable action (jobs, staffing, event team
            activity, or work time).
            {billingPlan === "flex"
              ? " This is the set your running-month Flex estimate is based on."
              : " Overage applies when billable count exceeds your Fixed commitment."}
          </p>
          {isLoading ? (
            <p className="text-sm text-white/50">Loading...</p>
          ) : billable.length === 0 ? (
            <p className="text-sm text-white/50">No billable activity yet this month.</p>
          ) : (
            <div className="rounded-md border border-white/10 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-white/50 text-xs">Name</TableHead>
                    <TableHead className="text-white/50 text-xs">Email</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {billable.map((u) => (
                    <TableRow key={u.id} className="border-white/5">
                      <TableCell className="text-white/90 text-sm">{u.name?.trim() || "—"}</TableCell>
                      <TableCell className="text-white/55 text-sm">{u.email}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Receipt size={16} />
            Current invoice status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-white/50">Loading...</p>
          ) : !org?.openInvoice ? (
            <p className="text-sm text-white/50">
              No open invoice. The next billing run creates one from billable activity in the closed month.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-white">
                Status: <span className="text-white/70">{org.openInvoice.status}</span>
              </p>
              <p className="text-sm text-white">
                Issued:{" "}
                <span className="text-white/70">{new Date(org.openInvoice.issuedAt).toLocaleDateString()}</span>
              </p>
              <p className="text-sm text-white">
                Due: <span className="text-white/70">{new Date(org.openInvoice.dueAt).toLocaleDateString()}</span>
              </p>
              <p className="text-sm text-white">
                Total: <span className="text-white/70">€{(org.openInvoice.totalCents / 100).toFixed(2)}</span>
              </p>
              <p className="text-xs text-white/50">
                If overdue past any configured grace period, the organization becomes view-only until payment is
                registered.
              </p>
              {isOwner && org.openInvoice.status !== "paid" ? (
                <div className="pt-3">
                  {openInvoicePayUrl ? (
                    <Button
                      asChild
                      className="bg-gradient-to-r from-ordo-magenta via-ordo-orange to-ordo-violet text-white border-0"
                    >
                      <a href={openInvoicePayUrl} target="_blank" rel="noreferrer">
                        Pay invoice with Paddle
                      </a>
                    </Button>
                  ) : (
                    <Button
                      className="bg-gradient-to-r from-ordo-magenta via-ordo-orange to-ordo-violet text-white border-0"
                      disabled={payInvoiceMutation.isPending}
                      onClick={() => payInvoiceMutation.mutate()}
                    >
                      {payInvoiceMutation.isPending ? "Opening checkout…" : "Pay invoice with Paddle"}
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
      {canManageBilling && org?.estimatedMonthlyCents != null ? (
        <Card className="bg-gray-900 border-white/10">
          <CardHeader>
            <CardTitle className="text-white">
              {billingPlan === "fixed" ? "Estimated overage this month" : "Expected monthly price"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-white leading-relaxed">
              {billingPlan === "fixed" ? (
                <>
                  Billable seats above your {org.committedSeats ?? 0}-seat commitment (Flex marginal rates):
                  <span className="ml-1 text-white/80 font-medium">
                    {org.estimatedCurrencyCode || "EUR"} {(org.estimatedMonthlyCents / 100).toFixed(2)}
                  </span>
                </>
              ) : (
                <>
                  Based on billable members so far this month and your pricing curve (or a fixed per-seat override if
                  Ordo Stage set one):
                  <span className="ml-1 text-white/80 font-medium">
                    {org.estimatedCurrencyCode || org.billingCurrencyCode || "EUR"}{" "}
                    {(org.estimatedMonthlyCents / 100).toFixed(2)}
                  </span>
                </>
              )}
            </p>
            <p className="text-xs text-white/45 mt-2">
              {billingPlan === "fixed"
                ? "Committed seats are covered by your annual Fixed plan. Overage is invoiced monthly."
                : "This is an estimate only; the closed-month invoice is authoritative."}
            </p>
          </CardContent>
        </Card>
      ) : null}
      {!embedded ? (
        <p className="text-xs text-white/40">
          Questions? Open{" "}
          <Link to="/account" className="text-rose-300/90 hover:text-rose-200 underline underline-offset-2">
            Account
          </Link>{" "}
          for workspace settings.
        </p>
      ) : null}
    </div>
  );
}
