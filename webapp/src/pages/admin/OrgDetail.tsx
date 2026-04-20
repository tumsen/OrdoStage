import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Users, CalendarDays, MapPin, UserRound, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OrgUser {
  id: string;
  name: string | null;
  email: string;
  orgRole: string;
  createdAt: string;
}

interface CreditLog {
  id: string;
  delta: number;
  reason: string;
  note: string | null;
  adminUserId: string | null;
  createdAt: string;
}

interface CreditPurchase {
  id: string;
  days: number;
  amountCents: number;
  createdAt: string;
}

interface OrgDetail {
  id: string;
  name: string;
  creditBalance: number;
  discountPercent: number;
  discountNote: string | null;
  freeTrialUsed: boolean;
  createdAt: string;
  users: OrgUser[];
  creditLogs: CreditLog[];
  creditPurchases: CreditPurchase[];
  _count: { events: number; venues: number; people: number };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ReasonBadge({ reason }: { reason: string }) {
  const styles: Record<string, string> = {
    purchase: "bg-green-950/60 text-green-400 border-green-800/40",
    admin_grant: "bg-blue-950/60 text-blue-400 border-blue-800/40",
    free_trial: "bg-purple-950/60 text-purple-400 border-purple-800/40",
    daily_deduction: "bg-white/5 text-white/40 border-white/10",
    admin_remove: "bg-red-950/60 text-red-400 border-red-800/40",
  };
  const labels: Record<string, string> = {
    purchase: "Purchase",
    admin_grant: "Admin Grant",
    free_trial: "Free Trial",
    daily_deduction: "Daily",
    admin_remove: "Admin Remove",
  };
  const style = styles[reason] ?? "bg-white/5 text-white/40 border-white/10";
  const label = labels[reason] ?? reason;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${style}`}>
      {label}
    </span>
  );
}

function DeltaDisplay({ delta }: { delta: number }) {
  const isPositive = delta > 0;
  return (
    <span className={`text-sm font-semibold ${isPositive ? "text-green-400" : "text-red-400"}`}>
      {isPositive ? "+" : ""}{delta}d
    </span>
  );
}

function StatItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-3">
      <Icon size={16} className="text-white/30" />
      <div className="text-lg font-bold text-white">{value}</div>
      <div className="text-xs text-white/40">{label}</div>
    </div>
  );
}

function CreditsTab({ org }: { org: OrgDetail }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [creditDelta, setCreditDelta] = useState<string>("");
  const [creditNote, setCreditNote] = useState("");
  const [trialDays, setTrialDays] = useState<string>("30");
  const [trialNote, setTrialNote] = useState("");
  const [discountPercent, setDiscountPercent] = useState<string>(String(org.discountPercent ?? 0));
  const [discountNote, setDiscountNote] = useState<string>(org.discountNote ?? "");

  const creditMutation = useMutation({
    mutationFn: (data: { delta: number; note?: string }) =>
      api.post(`/api/admin/orgs/${org.id}/credits`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orgs", org.id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "orgs"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      setCreditDelta("");
      setCreditNote("");
      toast({ title: "Credits updated", description: "The credit balance has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update credits.", variant: "destructive" });
    },
  });

  const trialMutation = useMutation({
    mutationFn: (data: { days: number; note?: string }) =>
      api.post(`/api/admin/orgs/${org.id}/free-trial`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orgs", org.id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "orgs"] });
      setTrialDays("30");
      setTrialNote("");
      toast({ title: "Free trial granted", description: "The free trial has been activated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to grant free trial.", variant: "destructive" });
    },
  });

  const discountMutation = useMutation({
    mutationFn: (data: { discountPercent: number; discountNote?: string }) =>
      api.put(`/api/admin/orgs/${org.id}/pricing`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orgs", org.id] });
      queryClient.invalidateQueries({ queryKey: ["admin", "orgs"] });
      toast({ title: "Pricing updated", description: "Customer discount has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update discount.", variant: "destructive" });
    },
  });

  const handleCreditSubmit = () => {
    const delta = parseInt(creditDelta, 10);
    if (isNaN(delta)) return;
    creditMutation.mutate({ delta, note: creditNote || undefined });
  };

  const handleTrialSubmit = () => {
    const days = parseInt(trialDays, 10);
    if (isNaN(days) || days < 1 || days > 365) return;
    trialMutation.mutate({ days, note: trialNote || undefined });
  };

  const deltaValue = parseInt(creditDelta, 10);
  const trialDaysValue = parseInt(trialDays, 10);
  const discountPercentValue = parseInt(discountPercent, 10);

  return (
    <div className="space-y-6">
      {/* Current Balance */}
      <div className="flex items-center gap-4 p-5 rounded-lg bg-gray-900/60 border border-white/10">
        <div className="w-12 h-12 rounded-xl bg-rose-950/60 border border-rose-800/30 flex items-center justify-center flex-shrink-0">
          <CreditCard size={20} className="text-rose-400" />
        </div>
        <div>
          <div className="text-white/40 text-xs uppercase tracking-wider mb-0.5">Current Balance</div>
          <div className={`text-3xl font-bold ${org.creditBalance <= 0 ? "text-red-400" : org.creditBalance <= 30 ? "text-amber-400" : "text-white"}`}>
            {org.creditBalance} <span className="text-sm font-normal text-white/40">days</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Add/Remove Credits */}
        <Card className="bg-gray-900 border border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-white/70">Add / Remove Credits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-white/40 mb-1 block">Days (negative to remove)</label>
              <Input
                type="number"
                placeholder="e.g. 30 or -10"
                value={creditDelta}
                onChange={(e) => setCreditDelta(e.target.value)}
                className="bg-gray-800 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-rose-500/30"
              />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Note (optional)</label>
              <Input
                placeholder="Reason for adjustment..."
                value={creditNote}
                onChange={(e) => setCreditNote(e.target.value)}
                className="bg-gray-800 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-rose-500/30"
              />
            </div>
            <Button
              onClick={handleCreditSubmit}
              disabled={creditMutation.isPending || isNaN(deltaValue)}
              className="w-full bg-rose-700 hover:bg-rose-600 text-white"
            >
              {creditMutation.isPending ? "Saving..." : "Apply Credits"}
            </Button>
          </CardContent>
        </Card>

        {/* Free Trial */}
        <Card className={`bg-gray-900 border ${org.freeTrialUsed ? "border-white/5 opacity-60" : "border-white/10"}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-white/70 flex items-center gap-2">
              Give Free Trial
              {org.freeTrialUsed ? (
                <Badge className="bg-white/5 text-white/40 border-white/10 text-xs">Already used</Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-white/40 mb-1 block">Days (1–365)</label>
              <Input
                type="number"
                min={1}
                max={365}
                placeholder="e.g. 30"
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
                disabled={org.freeTrialUsed}
                className="bg-gray-800 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-rose-500/30 disabled:opacity-40"
              />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Note (optional)</label>
              <Input
                placeholder="e.g. Welcome trial"
                value={trialNote}
                onChange={(e) => setTrialNote(e.target.value)}
                disabled={org.freeTrialUsed}
                className="bg-gray-800 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-rose-500/30 disabled:opacity-40"
              />
            </div>
            <Button
              onClick={handleTrialSubmit}
              disabled={
                trialMutation.isPending ||
                org.freeTrialUsed ||
                isNaN(trialDaysValue) ||
                trialDaysValue < 1 ||
                trialDaysValue > 365
              }
              className="w-full bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-40"
            >
              {org.freeTrialUsed
                ? "Already Used"
                : trialMutation.isPending
                ? "Granting..."
                : "Grant Free Trial"}
            </Button>
          </CardContent>
        </Card>

        {/* Customer discount */}
        <Card className="bg-gray-900 border border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-white/70">Customer Discount</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-white/40 mb-1 block">Discount % (0-100)</label>
              <Input
                type="number"
                min={0}
                max={100}
                placeholder="0"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                className="bg-gray-800 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-rose-500/30"
              />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Note (optional)</label>
              <Input
                placeholder="e.g. Partner theater agreement"
                value={discountNote}
                onChange={(e) => setDiscountNote(e.target.value)}
                className="bg-gray-800 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-rose-500/30"
              />
            </div>
            <Button
              onClick={() =>
                discountMutation.mutate({
                  discountPercent: discountPercentValue,
                  discountNote: discountNote || undefined,
                })
              }
              disabled={
                discountMutation.isPending ||
                isNaN(discountPercentValue) ||
                discountPercentValue < 0 ||
                discountPercentValue > 100
              }
              className="w-full bg-rose-700 hover:bg-rose-600 text-white"
            >
              {discountMutation.isPending ? "Saving..." : "Save Discount"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SupportAccessTab({ org }: { org: OrgDetail }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [role, setRole] = useState<"owner" | "manager" | "viewer">("owner");

  const accessMutation = useMutation({
    mutationFn: (data: { mode: "impersonate" | "incognito"; role?: "owner" | "manager" | "viewer" }) =>
      api.post(`/api/admin/orgs/${org.id}/support-access`, data),
    onSuccess: (_, variables) => {
      toast({
        title: variables.mode === "incognito" ? "Incognito support mode enabled" : "Support access enabled",
        description: `You are now entering ${org.name} as ${variables.mode === "incognito" ? "viewer" : role}.`,
      });
      navigate("/dashboard");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to switch into support mode for this organization.",
        variant: "destructive",
      });
    },
  });

  return (
    <Card className="bg-gray-900 border border-white/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-white/70">Support Access</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-white/40">
          Enter this organization as a selected role for troubleshooting, or use incognito mode
          for safe read-only exploration.
        </p>
        <div>
          <label className="text-xs text-white/40 mb-1 block">Role to assume</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "owner" | "manager" | "viewer")}
            className="w-full h-9 rounded-md bg-gray-800 border border-white/10 text-white px-2 text-sm"
          >
            <option value="owner">Owner</option>
            <option value="manager">Manager</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => accessMutation.mutate({ mode: "impersonate", role })}
            disabled={accessMutation.isPending}
            className="bg-rose-700 hover:bg-rose-600 text-white"
          >
            {accessMutation.isPending ? "Switching..." : `Enter as ${role}`}
          </Button>
          <Button
            variant="outline"
            onClick={() => accessMutation.mutate({ mode: "incognito" })}
            disabled={accessMutation.isPending}
            className="border-white/10 text-white/70 hover:text-white hover:bg-white/5"
          >
            Open Incognito (viewer)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function UsersTab({ users }: { users: OrgUser[] }) {
  return (
    <div className="rounded-lg border border-white/10 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-white/10 hover:bg-transparent">
            <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Name</TableHead>
            <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Email</TableHead>
            <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Role</TableHead>
            <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Joined</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 ? (
            <TableRow className="border-white/5">
              <TableCell colSpan={4} className="text-center text-white/30 py-10">
                No users in this organization
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => (
              <TableRow key={user.id} className="border-white/5 hover:bg-white/[0.02]">
                <TableCell className="text-white/80">{user.name ?? "—"}</TableCell>
                <TableCell className="text-white/50">{user.email}</TableCell>
                <TableCell>
                  <Badge
                    className={
                      user.orgRole === "owner"
                        ? "bg-rose-950/60 text-rose-400 border-rose-800/40 text-xs"
                        : "bg-white/5 text-white/50 border-white/10 text-xs"
                    }
                  >
                    {user.orgRole}
                  </Badge>
                </TableCell>
                <TableCell className="text-white/40 text-sm">{formatDate(user.createdAt)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function HistoryTab({ logs }: { logs: CreditLog[] }) {
  return (
    <div className="rounded-lg border border-white/10 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-white/10 hover:bg-transparent">
            <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Date</TableHead>
            <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Reason</TableHead>
            <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Delta</TableHead>
            <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.length === 0 ? (
            <TableRow className="border-white/5">
              <TableCell colSpan={4} className="text-center text-white/30 py-10">
                No credit history yet
              </TableCell>
            </TableRow>
          ) : (
            logs.map((log) => (
              <TableRow key={log.id} className="border-white/5 hover:bg-white/[0.02]">
                <TableCell className="text-white/40 text-sm">{formatDateTime(log.createdAt)}</TableCell>
                <TableCell>
                  <ReasonBadge reason={log.reason} />
                </TableCell>
                <TableCell>
                  <DeltaDisplay delta={log.delta} />
                </TableCell>
                <TableCell className="text-white/40 text-sm">{log.note ?? "—"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default function OrgDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: org, isPending } = useQuery<OrgDetail>({
    queryKey: ["admin", "orgs", id],
    queryFn: () => api.get<OrgDetail>(`/api/admin/orgs/${id}`),
    enabled: !!id,
  });

  const deleteOrgMutation = useMutation({
    mutationFn: () => api.delete(`/api/admin/orgs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orgs"] });
      toast({ title: "Organization deleted" });
      navigate("/admin/orgs");
    },
    onError: () => toast({ title: "Failed to delete organization", variant: "destructive" }),
  });

  if (isPending) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-gray-900 rounded animate-pulse" />
        <div className="h-24 bg-gray-900 rounded animate-pulse" />
        <div className="h-64 bg-gray-900 rounded animate-pulse" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="p-6 text-center text-white/30">Organization not found</div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Back + Header */}
      <div className="flex items-start gap-4">
        <Link
          to="/admin/orgs"
          className="mt-0.5 text-white/30 hover:text-white/60 transition-colors flex-shrink-0"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-white">{org.name}</h2>
          <div className="text-white/40 text-sm mt-0.5">Created {formatDate(org.createdAt)}</div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="flex flex-wrap items-center divide-x divide-white/10 rounded-lg border border-white/10 bg-gray-900 overflow-hidden">
        <StatItem icon={Users} label="Users" value={org.users.length} />
        <StatItem icon={CalendarDays} label="Events" value={org._count.events} />
        <StatItem icon={MapPin} label="Venues" value={org._count.venues} />
        <StatItem icon={UserRound} label="People" value={org._count.people} />
        <div className="flex flex-col items-center gap-1 px-4 py-3">
          <CreditCard size={16} className="text-white/30" />
          <div
            className={`text-lg font-bold ${
              org.creditBalance <= 0
                ? "text-red-400"
                : org.creditBalance <= 30
                ? "text-amber-400"
                : "text-white"
            }`}
          >
            {org.creditBalance}
          </div>
          <div className="text-xs text-white/40">Credits</div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="credits">
        <TabsList className="bg-gray-900 border border-white/10">
          <TabsTrigger value="credits" className="data-[state=active]:bg-rose-900/40 data-[state=active]:text-rose-200 text-white/40">
            Credits
          </TabsTrigger>
          <TabsTrigger value="users" className="data-[state=active]:bg-rose-900/40 data-[state=active]:text-rose-200 text-white/40">
            Users ({org.users.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-rose-900/40 data-[state=active]:text-rose-200 text-white/40">
            History ({org.creditLogs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="credits" className="mt-4">
          <div className="space-y-4">
            <CreditsTab org={org} />
            <SupportAccessTab org={org} />
          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <UsersTab users={org.users} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTab logs={org.creditLogs} />
        </TabsContent>
      </Tabs>

      <Card className="bg-gray-900 border-red-900/40 border mt-8">
        <CardHeader>
          <CardTitle className="text-red-300 text-base">Danger zone</CardTitle>
          <p className="text-white/40 text-sm font-normal">
            Delete this organization and all related data from the platform. This cannot be undone.
          </p>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            size="sm"
            className="border-red-800/50 text-red-300 hover:bg-red-950/40"
            disabled={deleteOrgMutation.isPending}
            onClick={() => {
              if (!confirm(`Permanently delete "${org.name}" and all of its data?`)) return;
              deleteOrgMutation.mutate();
            }}
          >
            {deleteOrgMutation.isPending ? "Deleting…" : "Delete organization"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
