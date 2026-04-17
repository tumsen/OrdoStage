import { useQuery, useMutation } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard, TrendingUp, AlertTriangle, XCircle, CheckCircle } from "lucide-react";

interface OrgData {
  id: string;
  name: string;
  credits: number;
  userCount: number;
  warning: boolean;
  blocked: boolean;
}

interface CheckoutResponse {
  url: string;
}

interface BillingPack {
  id: string;
  packId: string;
  days: number;
  label: string;
  amountCents: number;
  active: boolean;
}

function CreditStatus({ credits, userCount }: { credits: number; userCount: number }) {
  const daysLeft = userCount > 0 ? Math.floor(credits / userCount) : credits;
  const isBlocked = credits <= 0;
  const isWarning = credits > 0 && daysLeft <= 30;

  const colorClass = isBlocked
    ? "text-red-400 bg-red-950/40 border-red-800/40"
    : isWarning
    ? "text-amber-400 bg-amber-950/40 border-amber-800/40"
    : "text-green-400 bg-green-950/40 border-green-800/40";

  const icon = isBlocked ? (
    <XCircle size={20} className="text-red-400" />
  ) : isWarning ? (
    <AlertTriangle size={20} className="text-amber-400" />
  ) : (
    <CheckCircle size={20} className="text-green-400" />
  );

  const label = isBlocked
    ? "No credits — read-only mode"
    : isWarning
    ? `Low credits: ~${daysLeft} days left`
    : `Healthy: ~${daysLeft} days remaining`;

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${colorClass}`}>
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export default function Billing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const { data: org, isLoading } = useQuery<OrgData>({
    queryKey: ["org"],
    queryFn: () => api.get<OrgData>("/api/org"),
  });

  const { data: packs } = useQuery<BillingPack[]>({
    queryKey: ["billing", "packs"],
    queryFn: () => api.get<BillingPack[]>("/api/billing/packs"),
  });

  const checkoutMutation = useMutation({
    mutationFn: (packId: string) =>
      api.post<CheckoutResponse>("/api/billing/checkout", { packId }),
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
      }
    },
    onError: () => {
      setToast({ type: "error", message: "Failed to start checkout. Please try again." });
    },
  });

  useEffect(() => {
    const success = searchParams.get("success");
    const cancelled = searchParams.get("cancelled");
    if (success === "1") {
      setToast({ type: "success", message: "Payment successful! Your credits have been added." });
      setSearchParams({});
    } else if (cancelled === "1") {
      setToast({ type: "error", message: "Payment cancelled. No charges were made." });
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const credits = org?.credits ?? 0;
  const userCount = org?.userCount ?? 1;

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-4xl">
      {/* Toast */}
      {toast ? (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg ${
            toast.type === "success"
              ? "bg-green-950/90 border-green-700 text-green-300"
              : "bg-red-950/90 border-red-700 text-red-300"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle size={16} />
          ) : (
            <XCircle size={16} />
          )}
          <span className="text-sm">{toast.message}</span>
        </div>
      ) : null}

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Billing &amp; Credits</h2>
        <p className="text-gray-400 mt-1 text-sm">
          Each user in your organization uses 1 credit per day.
        </p>
      </div>

      {/* Current Balance */}
      <Card className="bg-gray-900 border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <TrendingUp size={18} className="text-purple-400" />
            Credit Balance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="h-8 bg-gray-800 rounded animate-pulse" />
          ) : (
            <>
              <div className="flex items-end gap-2">
                <span className="text-5xl font-bold text-white">{credits.toLocaleString()}</span>
                <span className="text-gray-400 mb-1">days</span>
              </div>
              <CreditStatus credits={credits} userCount={userCount} />
              {userCount > 0 && credits > 0 ? (
                <p className="text-gray-400 text-sm">
                  At current usage ({userCount} {userCount === 1 ? "user" : "users"}), your credits will last{" "}
                  <span className="text-white font-medium">
                    ~{Math.floor(credits / userCount)} days
                  </span>
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {/* Day Packs */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <CreditCard size={18} className="text-purple-400" />
          Top Up Credits
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(packs ?? []).map((pack, index) => (
            <Card
              key={pack.packId}
              className={`relative bg-gray-900 border transition-all duration-150 hover:border-purple-500/60 cursor-pointer ${
                index === 2 ? "border-purple-500/50" : "border-white/10"
              }`}
            >
              {index === 2 ? (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs px-3 py-0.5 rounded-full font-medium">
                  Most Popular
                </div>
              ) : null}
              <CardContent className="p-5 space-y-4">
                <div>
                  <div className="text-white font-semibold">{pack.label}</div>
                  <div className="text-gray-400 text-xs mt-0.5">Credit top-up pack</div>
                </div>
                <div>
                  <span className="text-3xl font-bold text-white">{pack.days.toLocaleString()}</span>
                  <span className="text-gray-400 text-sm ml-1">days</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-purple-400 font-semibold text-lg">€{(pack.amountCents / 100).toFixed(2)}</span>
                  <span className="text-gray-500 text-xs">
                    €{((pack.amountCents / 100) / pack.days * 100).toFixed(1)}¢/day
                  </span>
                </div>
                <Button
                  className="w-full bg-purple-600 hover:bg-purple-700 text-sm"
                  onClick={() => checkoutMutation.mutate(pack.packId)}
                  disabled={checkoutMutation.isPending}
                >
                  {checkoutMutation.isPending ? "Loading..." : "Buy Now"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Info */}
      <div className="bg-gray-900/50 border border-white/5 rounded-lg p-4 text-gray-400 text-sm space-y-1">
        <p>Credits are shared across your whole organization.</p>
        <p>Adding more users means credits are consumed faster — plan accordingly.</p>
        <p>Payments are processed securely by Stripe. No subscription, pay as you go.</p>
      </div>
    </div>
  );
}
