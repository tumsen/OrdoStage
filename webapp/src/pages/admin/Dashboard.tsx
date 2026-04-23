import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, DollarSign, CreditCard, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RecentPurchase {
  id: string;
  organizationId: string;
  days: number;
  amountCents: number;
  createdAt: string;
  organization: { name: string };
}

interface AdminStats {
  totalOrgs: number;
  totalUsers: number;
  totalPeople: number;
  totalRevenueCents: number;
  recentPurchases: RecentPurchase[];
}

interface OrgSummary {
  id: string;
  name: string;
  creditBalance: number;
  unlimitedCredits?: boolean;
  freeTrialUsed: boolean;
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
  const { data: stats, isPending: statsPending } = useQuery<AdminStats>({
    queryKey: ["admin", "stats"],
    queryFn: () => api.get<AdminStats>("/api/admin/stats"),
  });

  const { data: orgs, isPending: orgsPending } = useQuery<OrgSummary[]>({
    queryKey: ["admin", "orgs"],
    queryFn: () => api.get<OrgSummary[]>("/api/admin/orgs"),
  });

  const lowCreditOrgs = orgs?.filter((o) => !o.unlimitedCredits && o.creditBalance < 30) ?? [];

  const finiteOrgs = (orgs ?? []).filter((o) => !o.unlimitedCredits);
  const hasUnlimitedOrg = (orgs ?? []).some((o) => Boolean(o.unlimitedCredits));
  const avgCreditBalance =
    finiteOrgs.length > 0
      ? Math.round(finiteOrgs.reduce((sum, o) => sum + o.creditBalance, 0) / finiteOrgs.length)
      : 0;

  if (statsPending) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-900 border border-white/10 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
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
          title="Avg Credit Balance"
          value={hasUnlimitedOrg ? "∞ days" : `${avgCreditBalance} days`}
          icon={CreditCard}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Purchases */}
        <Card className="bg-gray-900 border border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-white/70 uppercase tracking-wider">
              Recent Purchases
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!stats?.recentPurchases?.length ? (
              <div className="px-6 py-8 text-center text-white/30 text-sm">No purchases yet</div>
            ) : (
              <div className="divide-y divide-white/5">
                {stats.recentPurchases.slice(0, 10).map((purchase) => (
                  <div key={purchase.id} className="px-6 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`/admin/orgs/${purchase.organizationId}`}
                        className="text-sm text-white/80 hover:text-rose-300 truncate block transition-colors"
                      >
                        {purchase.organization.name}
                      </Link>
                      <div className="text-xs text-white/30 mt-0.5">{formatDate(purchase.createdAt)}</div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Badge className="bg-green-950/60 text-green-400 border-green-800/40 text-xs">
                        +{purchase.days}d
                      </Badge>
                      <span className="text-white/60 text-sm font-medium">
                        €{(purchase.amountCents / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low Credit Alert */}
        <Card className="bg-gray-900 border border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-white/70 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-400" />
              Low Credit Alerts
              {lowCreditOrgs.length > 0 ? (
                <Badge className="bg-amber-950/60 text-amber-400 border-amber-800/40 ml-1">
                  {lowCreditOrgs.length}
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
            ) : lowCreditOrgs.length === 0 ? (
              <div className="px-6 py-8 text-center text-white/30 text-sm">All organizations have sufficient credits</div>
            ) : (
              <div className="divide-y divide-white/5">
                {lowCreditOrgs.map((org) => (
                  <div key={org.id} className="px-6 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-white/80 truncate">{org.name}</div>
                      <div
                        className={`text-xs mt-0.5 ${
                          org.creditBalance <= 0
                            ? "text-red-400"
                            : "text-amber-400"
                        }`}
                      >
                        {org.creditBalance <= 0 ? "No credits" : `${org.creditBalance} days left`}
                      </div>
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
    </div>
  );
}
