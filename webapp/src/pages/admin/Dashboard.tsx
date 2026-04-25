import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, isApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, DollarSign, Receipt, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RecentInvoice {
  id: string;
  organizationId: string;
  totalCents: number;
  issuedAt: string;
  dueAt: string;
  status: string;
  organization: { name: string };
}

interface AdminStats {
  totalOrgs: number;
  totalUsers: number;
  totalPeople: number;
  totalRevenueCents: number;
  recentInvoices: RecentInvoice[];
  openInvoices: number;
  expectedIncomeByCurrencyCents: Record<string, number>;
}

interface OrgSummary {
  id: string;
  name: string;
  billingStatus: string;
  billingDueAt?: string | null;
  createdAt: string;
  _count: { users: number; events: number };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatCard({
  title,
  value,
  icon: Icon,
  accent = false,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  accent?: boolean;
}) {
  return (
    <Card className="bg-gray-900 border border-white/10">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wider mb-1">{title}</p>
            <p className={`text-2xl font-bold ${accent ? "text-rose-400" : "text-white"}`}>{value}</p>
          </div>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent ? "bg-rose-950/60" : "bg-white/5"}`}>
            <Icon size={16} className={accent ? "text-rose-400" : "text-white/40"} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [testEmail, setTestEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState("");

  const { data: stats, isPending: statsPending } = useQuery<AdminStats>({
    queryKey: ["admin", "stats"],
    queryFn: () => api.get<AdminStats>("/api/admin/stats"),
  });

  const { data: orgs, isPending: orgsPending } = useQuery<OrgSummary[]>({
    queryKey: ["admin", "orgs"],
    queryFn: () => api.get<OrgSummary[]>("/api/admin/orgs"),
  });

  const overdueOrgs = orgs?.filter((o) => o.billingStatus === "overdue_view_only") ?? [];

  const testEmailMutation = useMutation({
    mutationFn: (to: string) => api.post<{ ok: boolean }>("/api/admin/email/test", { to }),
    onSuccess: () => {
      setEmailStatus("Test email sent successfully.");
      setTestEmail("");
    },
    onError: (err) => {
      setEmailStatus(isApiError(err) ? err.message : "Could not send test email.");
    },
  });

  if (statsPending) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-900 border border-white/10 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Organizations"
          value={stats?.totalOrgs ?? 0}
          icon={Building2}
        />
        <StatCard
          title="Total Users"
          value={stats?.totalUsers ?? 0}
          icon={Users}
        />
        <StatCard
          title="Total People"
          value={stats?.totalPeople ?? 0}
          icon={Users}
        />
        <StatCard
          title="Total Revenue"
          value={`€${((stats?.totalRevenueCents ?? 0) / 100).toFixed(2)}`}
          icon={DollarSign}
          accent
        />
        <StatCard
          title="Expected Income"
          value={Object.entries(stats?.expectedIncomeByCurrencyCents ?? {})
            .filter(([, cents]) => cents > 0)
            .slice(0, 1)
            .map(([currency, cents]) => `${currency} ${(cents / 100).toFixed(0)}`)[0] ?? "—"}
          icon={Receipt}
        />
      </div>

      <Card className="bg-gray-900 border border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-white/70 uppercase tracking-wider">
            Expected Monthly Income by Currency
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Object.entries(stats?.expectedIncomeByCurrencyCents ?? {})
            .filter(([, cents]) => cents > 0)
            .map(([currency, cents]) => (
              <div key={currency} className="rounded border border-white/10 p-3">
                <p className="text-xs text-white/40">{currency}</p>
                <p className="text-sm text-white font-semibold">{(cents / 100).toFixed(2)}</p>
              </div>
            ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent invoices */}
        <Card className="bg-gray-900 border border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-white/70 uppercase tracking-wider">
              Recent Invoices
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!stats?.recentInvoices?.length ? (
              <div className="px-6 py-8 text-center text-white/30 text-sm">No invoices yet</div>
            ) : (
              <div className="divide-y divide-white/5">
                {stats.recentInvoices.slice(0, 10).map((invoice) => (
                  <div key={invoice.id} className="px-6 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`/admin/orgs/${invoice.organizationId}`}
                        className="text-sm text-white/80 hover:text-rose-300 truncate block transition-colors"
                      >
                        {invoice.organization.name}
                      </Link>
                      <div className="text-xs text-white/30 mt-0.5">
                        Issued {formatDate(invoice.issuedAt)} · Due {formatDate(invoice.dueAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Badge className="bg-white/10 text-white/70 border-white/20 text-xs">
                        {invoice.status}
                      </Badge>
                      <span className="text-white/60 text-sm font-medium">
                        €{(invoice.totalCents / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overdue alert */}
        <Card className="bg-gray-900 border border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-white/70 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-400" />
              Overdue Billing Alerts
              {overdueOrgs.length > 0 ? (
                <Badge className="bg-amber-950/60 text-amber-400 border-amber-800/40 ml-1">
                  {overdueOrgs.length}
                </Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {orgsPending ? (
              <div className="px-6 py-4 space-y-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-12 bg-white/5 rounded animate-pulse" />
                ))}
              </div>
            ) : overdueOrgs.length === 0 ? (
              <div className="px-6 py-8 text-center text-white/30 text-sm">No organizations are overdue</div>
            ) : (
              <div className="divide-y divide-white/5">
                {overdueOrgs.map((org) => (
                  <div key={org.id} className="px-6 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-white/80 truncate">{org.name}</div>
                      <div className="text-xs mt-0.5 text-red-400">View-only until invoice is paid</div>
                    </div>
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="border-rose-800/50 text-rose-300 hover:bg-rose-950/40 hover:text-rose-200 text-xs flex-shrink-0"
                    >
                      <Link to={`/admin/orgs/${org.id}`}>Top up</Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gray-900 border border-white/10 max-w-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-white/70 uppercase tracking-wider">
            Email Test
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-white/45">
            Send a test email to verify Resend is configured correctly on backend.
          </p>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="you@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/25"
            />
            <Button
              disabled={testEmailMutation.isPending || testEmail.trim().length === 0}
              onClick={() => testEmailMutation.mutate(testEmail.trim())}
              className="bg-indigo-700 hover:bg-indigo-600 text-white"
            >
              {testEmailMutation.isPending ? "Sending..." : "Send test"}
            </Button>
          </div>
          {emailStatus ? <p className="text-xs text-white/60">{emailStatus}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
