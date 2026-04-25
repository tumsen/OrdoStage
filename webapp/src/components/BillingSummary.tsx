import { Link } from "react-router-dom";
import { Receipt, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface OrgBillingPayload {
  userCount?: number;
  billingStatus?: string;
  isViewOnlyDueToBilling?: boolean;
  openInvoice?: { dueAt?: string | null; totalCents?: number } | null;
}

interface BillingSummaryProps {
  org: OrgBillingPayload | undefined;
  isLoading?: boolean;
  className?: string;
  /** Larger card on Billing; compact strip on People */
  variant?: "card" | "compact";
}

export function BillingSummary({ org, isLoading, className, variant = "card" }: BillingSummaryProps) {
  if (isLoading || !org) {
    return (
      <div
        className={cn(
          "rounded-xl border border-white/10 bg-white/[0.03] animate-pulse",
          variant === "compact" ? "h-24" : "h-32",
          className
        )}
      />
    );
  }

  const billingStatus = org.billingStatus ?? "active";
  const overdue = Boolean(org.isViewOnlyDueToBilling);
  const dueText = org.openInvoice?.dueAt ? new Date(org.openInvoice.dueAt).toLocaleDateString() : null;

  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden",
        variant === "compact" ? "p-4" : "p-5",
        className
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-3 flex-1">
          <div className="flex items-center gap-2 text-white/50 text-xs font-medium uppercase tracking-wide">
            <Receipt size={14} className="text-amber-400/80" />
            Organisation billing
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <p className="text-[11px] text-white/35 uppercase tracking-wide">Status</p>
              <p className="text-lg font-semibold text-white tabular-nums">
                {billingStatus}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-white/35 uppercase tracking-wide">Users</p>
              <p className="text-lg font-semibold text-white tabular-nums">
                {org.userCount ?? 0}
              </p>
            </div>
            {dueText ? (
              <div>
                <p className="text-[11px] text-white/35 uppercase tracking-wide">Due date</p>
                <p className="text-lg font-semibold text-white tabular-nums">{dueText}</p>
              </div>
            ) : null}
          </div>
          {overdue ? (
            <div
              className={cn(
                "flex items-center gap-2 text-xs rounded-lg px-3 py-2 border",
                "text-red-300 bg-red-950/40 border-red-800/40"
              )}
            >
              <AlertTriangle size={14} className="flex-shrink-0" />
              Billing overdue: organization is view-only until invoice is paid.
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:items-end flex-shrink-0">
          <Button
            asChild
            className="bg-purple-600 hover:bg-purple-700 text-white w-full sm:w-auto"
            size={variant === "compact" ? "sm" : "default"}
          >
            <Link to="/billing">View billing</Link>
          </Button>
          <p className="text-[10px] text-white/25 max-w-[220px] sm:text-right">
            Monthly postpaid billing based on real usage days.
          </p>
        </div>
      </div>
    </div>
  );
}
