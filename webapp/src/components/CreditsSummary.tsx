import { Link } from "react-router-dom";
import { Coins, TrendingUp, AlertTriangle, Infinity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface OrgCreditsPayload {
  credits: number;
  userCount: number;
  dailyCreditsUsed?: number;
  estimatedDaysRemaining: number | null;
  warning: boolean;
  blocked: boolean;
  /** When true, balance is not charged and runway is hidden */
  unlimitedCredits?: boolean;
}

interface CreditsSummaryProps {
  org: OrgCreditsPayload | undefined;
  isLoading?: boolean;
  className?: string;
  /** Larger card on Billing; compact strip on People */
  variant?: "card" | "compact";
}

export function CreditsSummary({ org, isLoading, className, variant = "card" }: CreditsSummaryProps) {
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

  const unlimited = Boolean(org.unlimitedCredits);
  const balance = org.credits ?? 0;
  const perDay = org.dailyCreditsUsed ?? org.userCount ?? 0;
  const daysLeft =
    org.estimatedDaysRemaining !== null && org.estimatedDaysRemaining !== undefined
      ? org.estimatedDaysRemaining
      : perDay > 0
        ? Math.floor(balance / perDay)
        : balance;

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
            <Coins size={14} className="text-amber-400/80" />
            Organisation credits
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <p className="text-[11px] text-white/35 uppercase tracking-wide">Used per day</p>
              <p className="text-lg font-semibold text-white tabular-nums">
                {unlimited ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400/90">
                    <Infinity size={18} />
                    Not charged
                  </span>
                ) : (
                  <>
                    {perDay}{" "}
                    <span className="text-sm font-normal text-white/40">
                      credit{perDay === 1 ? "" : "s"} ({perDay} active team member{perDay === 1 ? "" : "s"})
                    </span>
                  </>
                )}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-white/35 uppercase tracking-wide">Balance left</p>
              <p className="text-lg font-semibold text-white tabular-nums">
                {unlimited ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400/90">
                    <Infinity size={18} />
                    Unlimited
                  </span>
                ) : (
                  <>
                    {balance.toLocaleString()}{" "}
                    <span className="text-sm font-normal text-white/40">credit days</span>
                  </>
                )}
              </p>
            </div>
            {!unlimited ? (
              <div>
                <p className="text-[11px] text-white/35 uppercase tracking-wide">Runway</p>
                <p className="text-lg font-semibold text-white tabular-nums flex items-center gap-1.5">
                  <TrendingUp size={16} className="text-purple-400/80" />~{daysLeft}{" "}
                  <span className="text-sm font-normal text-white/40">days at current usage</span>
                </p>
              </div>
            ) : null}
          </div>
          {!unlimited && (org.blocked || org.warning) ? (
            <div
              className={cn(
                "flex items-center gap-2 text-xs rounded-lg px-3 py-2 border",
                org.blocked
                  ? "text-red-300 bg-red-950/40 border-red-800/40"
                  : "text-amber-200 bg-amber-950/35 border-amber-800/35"
              )}
            >
              <AlertTriangle size={14} className="flex-shrink-0" />
              {org.blocked
                ? "No credits left — account is read-only until you top up."
                : "Credits are running low."}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:items-end flex-shrink-0">
          <Button
            asChild
            className="bg-purple-600 hover:bg-purple-700 text-white w-full sm:w-auto"
            size={variant === "compact" ? "sm" : "default"}
          >
            <Link to="/billing">Buy more credits</Link>
          </Button>
          <p className="text-[10px] text-white/25 max-w-[220px] sm:text-right">
            1 credit per active team member per day. Shared org balance.
          </p>
        </div>
      </div>
    </div>
  );
}
