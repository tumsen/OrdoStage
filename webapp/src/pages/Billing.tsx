import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

interface OrgBillingData {
  id: string;
  name: string;
  billingStatus: string;
  billingCurrencyCode?: string;
  paymentDueDays: number;
  estimatedMonthlyCents?: number;
  estimatedCurrencyCode?: string;
  openInvoice?: {
    id: string;
    issuedAt: string;
    dueAt: string;
    status: string;
    totalCents: number;
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

export default function Billing({ embedded = false }: { embedded?: boolean } = {}) {
  const { canAction } = usePermissions();
  const canManageBilling = canAction("billing.manage");
  const { data: org, isLoading } = useQuery<OrgBillingData>({
    queryKey: ["org"],
    queryFn: () => api.get<OrgBillingData>("/api/org"),
  });

  return (
    <div className={embedded ? "space-y-8" : "p-6 md:p-8 space-y-8"}>
      {!embedded ? (
        <div>
          <h2 className="text-2xl font-bold text-white">Billing</h2>
          <p className="text-gray-400 mt-1 text-sm">Postpaid: billed monthly for real usage days, due within {org?.paymentDueDays ?? 7} days.</p>
        </div>
      ) : null}
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
            <p className="text-sm text-white/50">No open invoice. Next billing run will create one from usage snapshots.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-white">Status: <span className="text-white/70">{org.openInvoice.status}</span></p>
              <p className="text-sm text-white">Issued: <span className="text-white/70">{new Date(org.openInvoice.issuedAt).toLocaleDateString()}</span></p>
              <p className="text-sm text-white">Due: <span className="text-white/70">{new Date(org.openInvoice.dueAt).toLocaleDateString()}</span></p>
              <p className="text-sm text-white">Total: <span className="text-white/70">€{(org.openInvoice.totalCents / 100).toFixed(2)}</span></p>
              <p className="text-xs text-white/50">If overdue, organization becomes view-only until payment is registered.</p>
            </div>
          )}
        </CardContent>
      </Card>
      {canManageBilling && org?.estimatedMonthlyCents != null ? (
        <Card className="bg-gray-900 border-white/10">
          <CardHeader>
            <CardTitle className="text-white">Expected monthly price</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-white">
              Based on current active users and this month&apos;s pricing:
              <span className="ml-1 text-white/80">
                {org.estimatedCurrencyCode || org.billingCurrencyCode || "USD"} {(org.estimatedMonthlyCents / 100).toFixed(2)}
              </span>
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
