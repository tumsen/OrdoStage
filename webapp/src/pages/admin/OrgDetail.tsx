import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, isApiError } from "@/lib/api";
import { confirmDeleteOrganizationByName } from "@/lib/deleteConfirm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Users, CalendarDays, MapPin, UserRound, Receipt } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OrgUser {
  id: string;
  name: string | null;
  email: string;
  orgRole: string;
  createdAt: string;
}

interface InvoiceLine {
  id: string;
  userName: string | null;
  userEmail: string | null;
  daysConsumed: number;
  rateCents: number;
  subtotalCents: number;
}
interface Invoice {
  id: string;
  issuedAt: string;
  dueAt: string;
  status: string;
  subtotalCents: number;
  discountPercent: number;
  discountCents: number;
  totalCents: number;
  lines: InvoiceLine[];
}

interface OrgDetail {
  id: string;
  name: string;
  billingStatus: string;
  billingDueAt: string | null;
  customDiscountPercent: number | null;
  customFlatRateCents: number | null;
  customFlatRateMaxUsers: number | null;
  billingCurrencyCode: string;
  estimatedMonthlyCents: number;
  estimatedCurrencyCode: string;
  createdAt: string;
  users: OrgUser[];
  invoices: Invoice[];
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

function BillingStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-950/60 text-emerald-400 border-emerald-800/40",
    overdue_view_only: "bg-red-950/60 text-red-400 border-red-800/40",
    issued: "bg-amber-950/60 text-amber-300 border-amber-800/40",
    overdue: "bg-red-950/60 text-red-400 border-red-800/40",
    paid: "bg-emerald-950/60 text-emerald-400 border-emerald-800/40",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${styles[status] ?? "bg-white/5 text-white/50 border-white/10"}`}>
      {status}
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

function BillingTab({ org }: { org: OrgDetail }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    customDiscountPercent: "",
    customFlatRateCents: "",
    customFlatRateMaxUsers: "",
    billingCurrencyCode: "EUR",
  });

  useEffect(() => {
    setForm({
      customDiscountPercent: org.customDiscountPercent == null ? "" : String(org.customDiscountPercent),
      customFlatRateCents: org.customFlatRateCents == null ? "" : String(org.customFlatRateCents),
      customFlatRateMaxUsers: org.customFlatRateMaxUsers == null ? "" : String(org.customFlatRateMaxUsers),
      billingCurrencyCode: org.billingCurrencyCode || "EUR",
    });
  }, [org.customDiscountPercent, org.customFlatRateCents, org.customFlatRateMaxUsers, org.billingCurrencyCode]);

  const pricingMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/admin/orgs/${org.id}/billing-pricing`, {
        customDiscountPercent: form.customDiscountPercent.trim() ? Number(form.customDiscountPercent) : null,
        customFlatRateCents: form.customFlatRateCents.trim() ? Number(form.customFlatRateCents) : null,
        customFlatRateMaxUsers: form.customFlatRateMaxUsers.trim() ? Number(form.customFlatRateMaxUsers) : null,
        billingCurrencyCode: form.billingCurrencyCode,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orgs", org.id] });
      toast({ title: "Saved", description: "Organization billing pricing updated." });
    },
    onError: (err) => {
      toast({
        title: "Error",
        description: isApiError(err) ? err.message : "Failed to save pricing.",
        variant: "destructive",
      });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: (invoiceId: string) =>
      api.post(`/api/admin/billing/invoices/${invoiceId}/mark-paid`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orgs", org.id] });
      toast({ title: "Invoice marked as paid" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 p-5 rounded-lg bg-gray-900/60 border border-white/10">
        <div className="w-12 h-12 rounded-xl bg-blue-950/60 border border-blue-800/30 flex items-center justify-center flex-shrink-0">
          <Receipt size={20} className="text-blue-300" />
        </div>
        <div>
          <div className="text-white/40 text-xs uppercase tracking-wider mb-0.5">Organization Billing Status</div>
          <BillingStatusBadge status={org.billingStatus} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gray-900 border border-white/10">
          <CardContent className="space-y-3">
            <p className="text-sm text-white/70">Custom organization pricing</p>
            <Input placeholder="Billing currency (e.g. EUR, USD, DKK)" value={form.billingCurrencyCode} onChange={(e) => setForm((p) => ({ ...p, billingCurrencyCode: e.target.value.toUpperCase() }))} />
            <Input placeholder="Discount % (optional)" value={form.customDiscountPercent} onChange={(e) => setForm((p) => ({ ...p, customDiscountPercent: e.target.value }))} />
            <Input placeholder="Flat rate cents (optional)" value={form.customFlatRateCents} onChange={(e) => setForm((p) => ({ ...p, customFlatRateCents: e.target.value }))} />
            <Input placeholder="Flat rate max users (optional)" value={form.customFlatRateMaxUsers} onChange={(e) => setForm((p) => ({ ...p, customFlatRateMaxUsers: e.target.value }))} />
            <p className="text-xs text-white/45">
              Estimated monthly price (current users): {org.estimatedCurrencyCode} {(org.estimatedMonthlyCents / 100).toFixed(2)}
            </p>
            <Button onClick={() => pricingMutation.mutate()} disabled={pricingMutation.isPending} className="w-full bg-rose-700 hover:bg-rose-600">
              {pricingMutation.isPending ? "Saving..." : "Save custom billing pricing"}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border border-white/10">
          <CardContent className="space-y-3">
            <p className="text-sm text-white/70">Latest invoices</p>
            {org.invoices.length === 0 ? (
              <p className="text-sm text-white/40">No invoices generated yet.</p>
            ) : (
              org.invoices.slice(0, 5).map((inv) => (
                <div key={inv.id} className="rounded border border-white/10 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <BillingStatusBadge status={inv.status} />
                    <p className="text-xs text-white/50">Due {formatDate(inv.dueAt)}</p>
                  </div>
                  <p className="text-sm text-white">Total €{(inv.totalCents / 100).toFixed(2)}</p>
                  <p className="text-xs text-white/50">Lines: {inv.lines.length}</p>
                  {inv.status !== "paid" ? (
                    <Button size="sm" variant="outline" onClick={() => markPaidMutation.mutate(inv.id)} disabled={markPaidMutation.isPending}>
                      Mark as paid
                    </Button>
                  ) : null}
                </div>
              ))
            )}
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

function UsersTab({ orgId, users }: { orgId: string; users: OrgUser[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [grantEmail, setGrantEmail] = useState("");

  const grantOrgAdminMutation = useMutation({
    mutationFn: (email: string) =>
      api.post(`/api/admin/orgs/${orgId}/grant-org-admin`, { email }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orgs", orgId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setGrantEmail("");
      toast({
        title: "Organization admin granted",
        description: "User now has owner role in this organization.",
      });
    },
    onError: (err) => {
      toast({
        title: "Error",
        description: isApiError(err) ? err.message : "Failed to grant organization admin.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-4">
      <Card className="bg-gray-900 border border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-white/70">Grant organization admin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-white/40">
            Grants owner role in this organization only (not OrdoStage platform admin).
          </p>
          <div className="flex flex-wrap gap-2 items-end max-w-xl">
            <div className="flex-1 min-w-[220px] space-y-1">
              <label htmlFor="grant-org-admin-email" className="text-xs text-white/40">
                User email
              </label>
              <Input
                id="grant-org-admin-email"
                type="email"
                placeholder="name@example.com"
                value={grantEmail}
                onChange={(e) => setGrantEmail(e.target.value)}
                className="bg-gray-800 border-white/10 text-white placeholder:text-white/25"
              />
            </div>
            <Button
              className="bg-rose-700 hover:bg-rose-600"
              disabled={grantOrgAdminMutation.isPending || grantEmail.trim().length === 0}
              onClick={() => grantOrgAdminMutation.mutate(grantEmail.trim())}
            >
              {grantOrgAdminMutation.isPending ? "Granting..." : "Grant org admin"}
            </Button>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}

function HistoryTab({ invoices }: { invoices: Invoice[] }) {
  return (
    <div className="rounded-lg border border-white/10 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-white/10 hover:bg-transparent">
            <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Date</TableHead>
            <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Status</TableHead>
            <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Due</TableHead>
            <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.length === 0 ? (
            <TableRow className="border-white/5">
              <TableCell colSpan={4} className="text-center text-white/30 py-10">
                No invoice history yet
              </TableCell>
            </TableRow>
          ) : (
            invoices.map((inv) => (
              <TableRow key={inv.id} className="border-white/5 hover:bg-white/[0.02]">
                <TableCell className="text-white/40 text-sm">{formatDateTime(inv.issuedAt)}</TableCell>
                <TableCell>
                  <BillingStatusBadge status={inv.status} />
                </TableCell>
                <TableCell className="text-white/40 text-sm">{formatDate(inv.dueAt)}</TableCell>
                <TableCell className="text-white/40 text-sm">€{(inv.totalCents / 100).toFixed(2)}</TableCell>
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
    mutationFn: () =>
      api.deleteWithBody(`/api/admin/orgs/${id}`, { confirm: `DELETE ${org?.name ?? ""}` }),
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
          <Receipt size={16} className="text-white/30" />
          <div
            className={`text-lg font-bold ${
              org.billingStatus === "overdue_view_only" ? "text-red-400" : "text-emerald-400"
            }`}
          >
            {org.billingStatus}
          </div>
          <div className="text-xs text-white/40">Billing</div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="billing">
        <TabsList className="bg-gray-900 border border-white/10">
          <TabsTrigger value="billing" className="data-[state=active]:bg-rose-900/40 data-[state=active]:text-rose-200 text-white/40">
            Billing
          </TabsTrigger>
          <TabsTrigger value="users" className="data-[state=active]:bg-rose-900/40 data-[state=active]:text-rose-200 text-white/40">
            Users ({org.users.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-rose-900/40 data-[state=active]:text-rose-200 text-white/40">
            History ({org.invoices.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="billing" className="mt-4">
          <div className="space-y-4">
            <BillingTab org={org} />
            <SupportAccessTab org={org} />
          </div>
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <UsersTab orgId={org.id} users={org.users} />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTab invoices={org.invoices} />
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
              if (!confirmDeleteOrganizationByName(org.name)) {
                toast({
                  title: "Delete cancelled",
                  description: `Type DELETE ${org.name} to confirm.`,
                  variant: "destructive",
                });
                return;
              }
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
