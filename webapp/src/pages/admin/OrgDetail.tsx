import { useEffect, useMemo, useState } from "react";
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
import { ArrowLeft, Users, CalendarDays, MapPin, UserRound, Receipt, Mail, Wrench, Crown, UserMinus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AdminOrgEmailMembersResultSchema,
  type AdminOrgEmailMembersResult,
} from "../../../../backend/src/types";
import { syncAuthSessionAfterWorkspaceChange } from "@/lib/auth-client";
import { TieredSeatPricingCalculator } from "@/components/pricing/TieredSeatPricingCalculator";
import { DEFAULT_TIERED_SEAT_MODEL, type TieredSeatModel } from "@/lib/tieredSeatPricing";
import { parseSeatCalculatorJson } from "@/lib/seatCalculatorJson";

interface OrgUser {
  id: string;
  name: string | null;
  email: string;
  orgRole: string;
  createdAt: string;
  isActive: boolean;
}

/** Labels organisation membership `owner` distinctly from platform administration. */
function displayOrgRole(role: string): string {
  if (role === "owner") return "Organisation Owner";
  return role;
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
  customUserDailyRateCents: number | null;
  customSeatCalculatorJson: string | null;
  billingPlan?: string;
  committedSeats?: number | null;
  annualRenewalDate?: string | null;
  annualTermStartDate?: string | null;
  annualInvoiceAmountCents?: number | null;
  /** Persisted admin default seat JSON; used when customSeatCalculatorJson is null. */
  globalDefaultSeatCalculatorJson?: string | null;
  seatCalculatorDefaults?: {
    yearlyDiscountPercent: number;
    yearlyDiscountEnabled: boolean;
  };
  billingCurrencyCode: string;
  estimatedMonthlyCents: number;
  estimatedCurrencyCode: string;
  createdAt: string;
  users: OrgUser[];
  invoices: Invoice[];
  _count: { events: number; venues: number; people: number };
}

function formatEditableMajorFromCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "";
  const major = cents / 100;
  const fixed = major.toFixed(2);
  return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function majorToCents(value: string): number {
  const normalized = value.trim().replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(1, Math.round(parsed * 100));
}

function mergeSeatModelFromJson(json: string | null | undefined): TieredSeatModel {
  const parsed = parseSeatCalculatorJson(json ?? null);
  return {
    ...DEFAULT_TIERED_SEAT_MODEL,
    ...parsed?.model,
  };
}

function yearlyFromCalculatorJson(
  json: string | null | undefined,
  defaults: { yearlyDiscountPercent: number; yearlyDiscountEnabled: boolean },
): { percent: number; enabled: boolean } {
  const parsed = parseSeatCalculatorJson(json ?? null);
  return {
    percent: parsed?.yearlyDiscountPercent ?? defaults.yearlyDiscountPercent,
    enabled: parsed?.yearlyDiscountEnabled ?? defaults.yearlyDiscountEnabled,
  };
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
    customUserDailyRateMajor: "",
  });
  const [useCustomSeatCurve, setUseCustomSeatCurve] = useState(() => Boolean(org.customSeatCalculatorJson?.trim()));
  const [seatModel, setSeatModel] = useState<TieredSeatModel>({ ...DEFAULT_TIERED_SEAT_MODEL });
  const [seatYearlyPercent, setSeatYearlyPercent] = useState(15);
  const [seatYearlyEnabled, setSeatYearlyEnabled] = useState(true);

  useEffect(() => {
    setUseCustomSeatCurve(Boolean(org.customSeatCalculatorJson?.trim()));
  }, [org.id, org.customSeatCalculatorJson]);

  useEffect(() => {
    setForm({
      customDiscountPercent: org.customDiscountPercent == null ? "" : String(org.customDiscountPercent),
      customFlatRateCents: org.customFlatRateCents == null ? "" : String(org.customFlatRateCents),
      customFlatRateMaxUsers: org.customFlatRateMaxUsers == null ? "" : String(org.customFlatRateMaxUsers),
      billingCurrencyCode: org.billingCurrencyCode || "EUR",
      customUserDailyRateMajor: formatEditableMajorFromCents(org.customUserDailyRateCents),
    });
  }, [
    org.id,
    org.customDiscountPercent,
    org.customFlatRateCents,
    org.customFlatRateMaxUsers,
    org.billingCurrencyCode,
    org.customUserDailyRateCents,
  ]);

  useEffect(() => {
    const defaults = org.seatCalculatorDefaults ?? { yearlyDiscountPercent: 15, yearlyDiscountEnabled: true };
    if (useCustomSeatCurve) {
      if (org.customSeatCalculatorJson?.trim()) {
        setSeatModel(mergeSeatModelFromJson(org.customSeatCalculatorJson));
        const y = yearlyFromCalculatorJson(org.customSeatCalculatorJson, defaults);
        setSeatYearlyPercent(y.percent);
        setSeatYearlyEnabled(y.enabled);
      }
    } else {
      setSeatModel(mergeSeatModelFromJson(org.globalDefaultSeatCalculatorJson));
      const y = yearlyFromCalculatorJson(org.globalDefaultSeatCalculatorJson, defaults);
      setSeatYearlyPercent(y.percent);
      setSeatYearlyEnabled(y.enabled);
    }
  }, [
    org.id,
    org.customSeatCalculatorJson,
    org.globalDefaultSeatCalculatorJson,
    org.seatCalculatorDefaults,
    useCustomSeatCurve,
  ]);

  const pricingMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/admin/orgs/${org.id}/billing-pricing`, {
        customUserDailyRateCents: form.customUserDailyRateMajor.trim() ? majorToCents(form.customUserDailyRateMajor) : null,
        customSeatCalculatorJson: useCustomSeatCurve
          ? JSON.stringify({
              model: seatModel,
              yearlyDiscountPercent: seatYearlyPercent,
              yearlyDiscountEnabled: seatYearlyEnabled,
            })
          : null,
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
          <p className="text-xs text-white/50 mt-1">
            Plan:{" "}
            <span className="text-white/80 capitalize">
              {org.billingPlan === "fixed" ? "Fixed (annual)" : "Flex (monthly)"}
            </span>
            {org.billingPlan === "fixed" && org.committedSeats != null ? (
              <> · {org.committedSeats} committed seats</>
            ) : null}
            {org.annualRenewalDate ? <> · renews {formatDate(org.annualRenewalDate)}</> : null}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gray-900 border border-white/10">
          <CardContent className="space-y-3">
            <p className="text-sm text-white/70">Custom organization pricing</p>
            <Input placeholder="Billing currency (e.g. EUR, USD, DKK)" value={form.billingCurrencyCode} onChange={(e) => setForm((p) => ({ ...p, billingCurrencyCode: e.target.value.toUpperCase() }))} />
            <div>
              <Label className="text-xs text-white/50">Fixed EUR per billable seat / month (optional override)</Label>
              <Input
                className="mt-1"
                placeholder="Leave empty to use the seat curve (global default or organisation curve below)"
                value={form.customUserDailyRateMajor}
                onChange={(e) => setForm((p) => ({ ...p, customUserDailyRateMajor: e.target.value }))}
              />
              <p className="text-[11px] text-white/40 mt-1">
                If set, each billable member is charged this flat amount instead of the tiered total from the
                calculator.
              </p>
            </div>
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

      <Card className="bg-gray-900 border border-white/10">
        <CardHeader>
          <CardTitle className="text-white text-base">Organisation seat curve (illustrative)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-white/55">
            By default this matches the admin pricing defaults and updates when those change. Enable a custom curve to
            override for this organisation only. Values save with <span className="text-white/75">Save custom billing
            pricing</span> and are used for invoices unless a fixed per-seat override is set above.
          </p>
          <div className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <Checkbox
              id="org-custom-seat-curve"
              checked={useCustomSeatCurve}
              onCheckedChange={(v) => setUseCustomSeatCurve(v === true)}
              className="mt-0.5 border-white/30 data-[state=checked]:bg-rose-600 data-[state=checked]:border-rose-600"
            />
            <div className="space-y-0.5">
              <Label htmlFor="org-custom-seat-curve" className="text-sm text-white/85 cursor-pointer">
                Use organisation-specific seat curve
              </Label>
              <p className="text-[11px] text-white/45 leading-snug">
                When off, invoices use the global admin seat curve; the fields below mirror it read-only.
              </p>
            </div>
          </div>
          <TieredSeatPricingCalculator
            showTrialBadge={false}
            showModelControls
            disableModelControls={!useCustomSeatCurve}
            seatModel={seatModel}
            onSeatModelChange={setSeatModel}
            yearlyDiscountPercent={seatYearlyPercent}
            yearlyDiscountEnabled={seatYearlyEnabled}
            showYearlyDiscountControls
            onYearlyDiscountPercentChange={setSeatYearlyPercent}
            onYearlyDiscountEnabledChange={setSeatYearlyEnabled}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SupportAccessTab({ org }: { org: OrgDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [role, setRole] = useState<"owner" | "manager" | "viewer">("owner");

  const accessMutation = useMutation({
    mutationFn: (data: { mode: "impersonate" | "incognito"; role?: "owner" | "manager" | "viewer" }) =>
      api.post(`/api/admin/orgs/${org.id}/support-access`, data),
    onSuccess: async (_, variables) => {
      await syncAuthSessionAfterWorkspaceChange();
      queryClient.invalidateQueries({ queryKey: ["org"] });
      queryClient.invalidateQueries({ queryKey: ["org-memberships"] });
      queryClient.invalidateQueries({ queryKey: ["me", "permissions"] });
      const assumedRole =
        variables.mode === "incognito" ? "viewer" : variables.role ?? role;
      toast({
        title: variables.mode === "incognito" ? "Incognito support mode enabled" : "Support access enabled",
        description: `You are now entering ${org.name} as ${assumedRole}.`,
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
  const fixCredentialMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post<{ message: string; rowsBefore: number }>(`/api/admin/users/${userId}/fix-credential`, {}),
    onSuccess: (data) => {
      toast({ title: "Login fixed", description: data.message });
    },
    onError: (err) => {
      const msg = isApiError(err) ? err.message : "Could not fix credential.";
      toast({ title: "Fix failed", description: msg, variant: "destructive" });
    },
  });

  const [emailMode, setEmailMode] = useState<"all" | "selected">("all");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(() => new Set());
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  const activeUsers = useMemo(() => users.filter((u) => u.isActive), [users]);
  const owners = useMemo(() => users.filter((u) => u.orgRole === "owner"), [users]);

  const grantOrgOwnerMutation = useMutation({
    mutationFn: (email: string) =>
      api.post(`/api/admin/orgs/${orgId}/grant-org-admin`, { email }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orgs", orgId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setGrantEmail("");
      toast({
        title: "Organisation Owner granted",
        description: "This account now has Organisation Owner for this organization (not platform admin).",
      });
    },
    onError: (err) => {
      toast({
        title: "Error",
        description: isApiError(err) ? err.message : "Failed to grant Organisation Owner.",
        variant: "destructive",
      });
    },
  });

  const revokeOrgOwnerMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post(`/api/admin/orgs/${orgId}/revoke-organisation-owner`, { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orgs", orgId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({
        title: "Organisation Owner removed",
        description: "They remain an organisation member with the member role.",
      });
    },
    onError: (err) => {
      toast({
        title: "Could not remove",
        description: isApiError(err) ? err.message : "Failed to revoke Organisation Owner.",
        variant: "destructive",
      });
    },
  });

  const emailMembersMutation = useMutation({
    mutationFn: () =>
      api.post<AdminOrgEmailMembersResult>(`/api/admin/orgs/${orgId}/email-members`, {
        mode: emailMode,
        ...(emailMode === "selected" ? { userIds: Array.from(selectedUserIds) } : {}),
        subject: emailSubject.trim(),
        body: emailBody.trim(),
      }),
    onSuccess: (data) => {
      const parsed = AdminOrgEmailMembersResultSchema.safeParse(data);
      if (!parsed.success) {
        toast({ title: "Sent", description: "Email request completed." });
        return;
      }
      const r = parsed.data;
      if (r.devPreview) {
        toast({
          title: "Dev preview",
          description: `Resend is not configured — no emails sent (${r.skipped ?? 0} would-be recipients). Check server logs.`,
        });
        return;
      }
      if (r.failed > 0) {
        toast({
          title: "Partially sent",
          description: `Delivered ${r.sent}, failed ${r.failed}.${r.failedEmails?.length ? ` Examples: ${r.failedEmails.slice(0, 3).join(", ")}` : ""}`,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Emails sent",
        description: `Message queued for ${r.sent} recipient${r.sent === 1 ? "" : "s"}.`,
      });
      setEmailSubject("");
      setEmailBody("");
      setSelectedUserIds(new Set());
    },
    onError: (err) => {
      toast({
        title: "Could not send",
        description: isApiError(err) ? err.message : "Email request failed.",
        variant: "destructive",
      });
    },
  });

  const allActiveSelected =
    activeUsers.length > 0 && activeUsers.every((u) => selectedUserIds.has(u.id));
  const someActiveSelected = activeUsers.some((u) => selectedUserIds.has(u.id));

  function toggleUser(id: string) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllActive() {
    if (allActiveSelected) {
      setSelectedUserIds(new Set());
      return;
    }
    setSelectedUserIds(new Set(activeUsers.map((u) => u.id)));
  }

  const canSubmitEmail =
    emailSubject.trim().length > 0 &&
    emailBody.trim().length > 0 &&
    (emailMode === "all" ? activeUsers.length > 0 : selectedUserIds.size > 0);

  return (
    <div className="space-y-4">
      <Card className="bg-gray-900 border border-rose-800/35">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-white/90 flex items-center gap-2">
            <Crown size={16} className="text-rose-400/90 shrink-0" />
            Organisation Owner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-white/40">
            <strong className="text-white/55">Organisation Owner</strong> is this workspace&apos;s top role (billing and full control in the app).
            This is separate from <strong className="text-white/55">platform administration</strong> (Ordo Stage staff).
          </p>
          {owners.length === 0 ? (
            <p className="text-sm text-amber-200/75 rounded-lg border border-amber-800/30 bg-amber-950/20 px-3 py-2">
              No Organisation Owner on file for membership rows. Grant one below by email.
            </p>
          ) : (
            <ul className="space-y-2">
              {owners.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-white/90">{o.name ?? "—"}</span>
                      <Badge className="bg-rose-950/60 text-rose-400 border-rose-800/40 text-[10px] max-w-[min(100%,14rem)] whitespace-normal text-center leading-tight py-0.5 font-medium normal-case">
                        Organisation Owner
                      </Badge>
                      {o.isActive ? (
                        <span className="text-[10px] text-emerald-400/90">Active</span>
                      ) : (
                        <span className="text-[10px] text-white/35">Inactive</span>
                      )}
                    </div>
                    <a
                      href={`mailto:${o.email}`}
                      className="text-xs text-white/45 hover:text-rose-300 truncate block mt-0.5"
                    >
                      {o.email}
                    </a>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Fix login — credential rows after password reset"
                      disabled={fixCredentialMutation.isPending}
                      className="text-amber-400 hover:text-amber-300 hover:bg-amber-950/30"
                      onClick={() => fixCredentialMutation.mutate(o.id)}
                    >
                      <Wrench size={14} className="mr-1.5" />
                      Fix login
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Remove Organisation Owner — demotes to member; needs another owner if more than one exists"
                      disabled={
                        revokeOrgOwnerMutation.isPending || owners.length <= 1
                      }
                      className="text-red-400/90 hover:text-red-300 hover:bg-red-950/30 disabled:opacity-40"
                      onClick={() => {
                        if (owners.length <= 1) return;
                        if (
                          !window.confirm(
                            "Remove Organisation Owner from this person? They stay in the organisation as a member."
                          )
                        ) {
                          return;
                        }
                        revokeOrgOwnerMutation.mutate(o.id);
                      }}
                    >
                      <UserMinus size={14} className="mr-1.5" />
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-white/10 pt-4 space-y-2">
            <p className="text-xs font-medium text-white/55">Grant Organisation Owner</p>
            <p className="text-xs text-white/40">
              Assign by email (existing user account). Does not grant Ordo Stage platform admin.
            </p>
            <div className="flex flex-wrap gap-2 items-end max-w-xl">
              <div className="flex-1 min-w-[220px] space-y-1">
                <label htmlFor="grant-org-owner-email" className="text-xs text-white/40">
                  User email
                </label>
                <Input
                  id="grant-org-owner-email"
                  type="email"
                  placeholder="name@example.com"
                  value={grantEmail}
                  onChange={(e) => setGrantEmail(e.target.value)}
                  className="bg-gray-800 border-white/10 text-white placeholder:text-white/25"
                />
              </div>
              <Button
                className="bg-rose-700 hover:bg-rose-600"
                disabled={grantOrgOwnerMutation.isPending || grantEmail.trim().length === 0}
                onClick={() => grantOrgOwnerMutation.mutate(grantEmail.trim())}
              >
                {grantOrgOwnerMutation.isPending ? "Granting…" : "Grant"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-white/70 flex items-center gap-2">
            <Mail size={16} className="text-white/50" />
            Email members
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-white/40">
            Send a message to active organization accounts via the same email system as invites. Plain text;
            line breaks are preserved.
          </p>
          <div className="space-y-2">
            <Label className="text-xs text-white/50">Recipients</Label>
            <RadioGroup
              value={emailMode}
              onValueChange={(v) => setEmailMode(v as "all" | "selected")}
              className="gap-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="all" id="email-all" className="border-white/30 text-rose-400" />
                <Label htmlFor="email-all" className="text-sm text-white/80 font-normal cursor-pointer">
                  All active users ({activeUsers.length})
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem
                  value="selected"
                  id="email-selected"
                  className="border-white/30 text-rose-400"
                />
                <Label htmlFor="email-selected" className="text-sm text-white/80 font-normal cursor-pointer">
                  Selected users only
                </Label>
              </div>
            </RadioGroup>
          </div>
          <div className="space-y-1">
            <Label htmlFor="org-email-subject" className="text-xs text-white/50">
              Subject
            </Label>
            <Input
              id="org-email-subject"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Subject line"
              className="bg-gray-800 border-white/10 text-white placeholder:text-white/25"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="org-email-body" className="text-xs text-white/50">
              Message
            </Label>
            <Textarea
              id="org-email-body"
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              placeholder="Write your message…"
              rows={6}
              className="bg-gray-800 border-white/10 text-white placeholder:text-white/25 resize-y min-h-[120px]"
            />
          </div>
          <Button
            className="bg-rose-700 hover:bg-rose-600"
            disabled={!canSubmitEmail || emailMembersMutation.isPending}
            onClick={() => emailMembersMutation.mutate()}
          >
            {emailMembersMutation.isPending ? "Sending…" : "Send email"}
          </Button>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-white/10 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              {emailMode === "selected" ? (
                <TableHead className="w-10 text-white/40 font-medium text-xs uppercase tracking-wider">
                  <Checkbox
                    checked={allActiveSelected ? true : someActiveSelected ? "indeterminate" : false}
                    onCheckedChange={() => toggleSelectAllActive()}
                    disabled={activeUsers.length === 0}
                    aria-label="Select all active users"
                    className="border-white/30 data-[state=checked]:bg-rose-700 data-[state=checked]:border-rose-600"
                  />
                </TableHead>
              ) : null}
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Name</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Email</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Role</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Joined</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow className="border-white/5">
                <TableCell
                  colSpan={emailMode === "selected" ? 7 : 6}
                  className="text-center text-white/30 py-10"
                >
                  No users in this organization
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow
                  key={user.id}
                  className={`border-white/5 hover:bg-white/[0.02] ${!user.isActive ? "opacity-50" : ""}`}
                >
                  {emailMode === "selected" ? (
                    <TableCell className="w-10">
                      <Checkbox
                        checked={selectedUserIds.has(user.id)}
                        onCheckedChange={() => user.isActive && toggleUser(user.id)}
                        disabled={!user.isActive}
                        aria-label={`Select ${user.email}`}
                        className="border-white/30 data-[state=checked]:bg-rose-700 data-[state=checked]:border-rose-600"
                      />
                    </TableCell>
                  ) : null}
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
                      {displayOrgRole(user.orgRole)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-white/40 text-sm">{formatDate(user.createdAt)}</TableCell>
                  <TableCell className="text-white/40 text-sm">
                    {user.isActive ? (
                      <span className="text-emerald-400/90">Active</span>
                    ) : (
                      <span className="text-white/35">Inactive</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Fix login — consolidates duplicate credential rows so password works after reset"
                      disabled={fixCredentialMutation.isPending}
                      className="text-amber-400 hover:text-amber-300 hover:bg-amber-950/30 disabled:opacity-40"
                      onClick={() => fixCredentialMutation.mutate(user.id)}
                    >
                      <Wrench size={14} className="mr-1.5" />
                      Fix login
                    </Button>
                  </TableCell>
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
