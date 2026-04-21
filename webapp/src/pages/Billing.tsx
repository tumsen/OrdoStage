import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { AddressFields, type Address, EMPTY_ADDRESS } from "@/components/AddressFields";
import { useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard, CheckCircle, XCircle, RefreshCw, Trash2 } from "lucide-react";
import { CreditsSummary, type OrgCreditsPayload } from "@/components/CreditsSummary";
import { usePermissions } from "@/hooks/usePermissions";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { DistanceUnit, Language, TimeFormat } from "@/lib/preferences";
import { useI18n } from "@/lib/i18n";

interface OrgBillingData extends OrgCreditsPayload {
  id: string;
  name: string;
  defaultLanguage?: Language;
  defaultTimeFormat?: TimeFormat;
  defaultDistanceUnit?: DistanceUnit;
  unlimitedCredits?: boolean;
  autoTopUpEnabled: boolean;
  autoTopUpPackId: string | null;
  autoTopUpThreshold: number;
  pendingAutoTopUpUrl: string | null;

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

export default function Billing() {
  const queryClient = useQueryClient();
  const { isOwner } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [thresholdDraft, setThresholdDraft] = useState("");
  const [orgNameDraft, setOrgNameDraft] = useState("");
  const [deleteWord, setDeleteWord] = useState("");
  const [showDeleteOrg, setShowDeleteOrg] = useState(false);
  const [inv, setInv] = useState({
    invoiceName: "",
    invoiceVat: "",
    invoiceEmail: "",
    invoicePhone: "",
    invoiceContact: "",
  });
  const [invAddress, setInvAddress] = useState<Address>(EMPTY_ADDRESS);
  const [invSaving, setInvSaving] = useState(false);
  const { t } = useI18n();

  const { data: org, isLoading } = useQuery<OrgBillingData>({
    queryKey: ["org"],
    queryFn: () => api.get<OrgBillingData>("/api/org"),
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


  const settingsMutation = useMutation({
    mutationFn: (body: {
      autoTopUpEnabled?: boolean;
      autoTopUpPackId?: string | null;
      autoTopUpThreshold?: number;
    }) => api.patch<{ ok: boolean }>("/api/org/billing-settings", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org"] });
      setToast({ type: "success", message: "Billing settings saved." });
    },
    onError: (e: Error) => {
      setToast({ type: "error", message: e.message || "Could not save settings." });
    },
  });

  const orgPreferencesMutation = useMutation({
    mutationFn: (body: { language: Language; timeFormat: TimeFormat; distanceUnit: DistanceUnit }) =>
      api.patch<{ ok: boolean }>("/api/org/preferences", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org"] });
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
      setToast({ type: "success", message: t("billing.updated") });
    },
    onError: (e: Error) => {
      setToast({ type: "error", message: e.message || t("billing.updateError") });
    },
  });

  useEffect(() => {
    const success = searchParams.get("success");
    const cancelled = searchParams.get("cancelled");
    const autoTop = searchParams.get("auto_topup");
    if (success === "1") {
      setToast({
        type: "success",
        message:
          autoTop === "1"
            ? "Payment successful! Credits have been added (auto top-up checkout)."
            : "Payment successful! Your credits have been added.",
      });
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

  const firstPackId = packs?.[0]?.packId ?? "";

  useEffect(() => {
    if (org?.autoTopUpThreshold !== undefined) setThresholdDraft(String(org.autoTopUpThreshold));
  }, [org?.autoTopUpThreshold]);

  useEffect(() => {
    if (org?.name) setOrgNameDraft(org.name);
  }, [org?.name]);

  interface InvoiceInfo {
    name: string;
    invoiceName: string | null;
    invoiceStreet: string | null;
    invoiceNumber: string | null;
    invoiceZip: string | null;
    invoiceCity: string | null;
    invoiceState: string | null;
    invoiceCountry: string | null;
    invoiceVat: string | null;
    invoiceEmail: string | null;
    invoicePhone: string | null;
    invoiceContact: string | null;
  }

  const { data: invoiceInfo } = useQuery<InvoiceInfo>({
    queryKey: ["org-invoice-info"],
    queryFn: () => api.get<InvoiceInfo>("/api/org/invoice-info"),
    enabled: isOwner,
  });

  useEffect(() => {
    if (!invoiceInfo) return;
    setInv({
      invoiceName: invoiceInfo.invoiceName ?? "",
      invoiceVat: invoiceInfo.invoiceVat ?? "",
      invoiceEmail: invoiceInfo.invoiceEmail ?? "",
      invoicePhone: invoiceInfo.invoicePhone ?? "",
      invoiceContact: invoiceInfo.invoiceContact ?? "",
    });
    setInvAddress({
      street:  invoiceInfo.invoiceStreet  ?? "",
      number:  invoiceInfo.invoiceNumber  ?? "",
      zip:     invoiceInfo.invoiceZip     ?? "",
      city:    invoiceInfo.invoiceCity    ?? "",
      state:   invoiceInfo.invoiceState   ?? "",
      country: invoiceInfo.invoiceCountry ?? "",
    });
  }, [invoiceInfo]);

  const renameOrgMutation = useMutation({
    mutationFn: (name: string) => api.patch<{ ok: boolean }>("/api/org", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org"] });
      setToast({ type: "success", message: "Organization name updated." });
    },
    onError: () => setToast({ type: "error", message: "Could not update organization name." }),
  });

  const deleteOrgMutation = useMutation({
    mutationFn: () => api.deleteWithBody<{ ok: boolean }>("/api/org", { confirm: "delete" }),
    onSuccess: async () => {
      await authClient.getSession();
      queryClient.invalidateQueries({ queryKey: ["org"] });
      queryClient.invalidateQueries({ queryKey: ["org-memberships"] });
      queryClient.invalidateQueries({ queryKey: ["me", "permissions"] });
      setToast({ type: "success", message: "Organization deleted." });
      window.location.assign("/select-org");
    },
    onError: () => setToast({ type: "error", message: "Could not delete organization." }),
  });

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-5xl mx-auto">
      {toast ? (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg ${
            toast.type === "success"
              ? "bg-green-950/90 border-green-700 text-green-300"
              : "bg-red-950/90 border-red-700 text-red-300"
          }`}
        >
          {toast.type === "success" ? <CheckCircle size={16} /> : <XCircle size={16} />}
          <span className="text-sm">{toast.message}</span>
        </div>
      ) : null}

      <div>
        <h2 className="text-2xl font-bold text-white">Billing &amp; Credits</h2>
        <p className="text-gray-400 mt-1 text-sm">
          Each active team member uses 1 credit per day. Credits are shared across your organisation.
        </p>
      </div>

      <CreditsSummary org={org} isLoading={isLoading} variant="card" />

      {isOwner && org ? (
        <Card className="bg-gray-900 border-white/10">
          <CardHeader>
            <CardTitle className="text-white text-base">Organization name</CardTitle>
            <p className="text-gray-400 text-sm font-normal">This name is shown to your team in the app and in invitations.</p>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="space-y-2 flex-1 max-w-md">
              <Label className="text-white/70">Name</Label>
              <Input
                className="bg-gray-800 border-white/10 text-white"
                value={orgNameDraft}
                onChange={(e) => setOrgNameDraft(e.target.value)}
                onBlur={() => {
                  const n = orgNameDraft.trim();
                  if (!n || n === org.name) return;
                  renameOrgMutation.mutate(n);
                }}
                disabled={renameOrgMutation.isPending}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isOwner && org ? (
        <Card className="bg-gray-900 border-white/10">
          <CardHeader>
            <CardTitle className="text-white text-base">{t("billing.orgDefaultsTitle")}</CardTitle>
            <p className="text-gray-400 text-sm font-normal">
              {t("billing.orgDefaultsHint")}
            </p>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="text-white/70">{t("billing.defaultLanguage")}</Label>
              <Select
                value={org.defaultLanguage ?? "en"}
                onValueChange={(value) =>
                  orgPreferencesMutation.mutate({
                    language: value as Language,
                    timeFormat: org.defaultTimeFormat ?? "24h",
                    distanceUnit: org.defaultDistanceUnit ?? "km",
                  })
                }
                disabled={orgPreferencesMutation.isPending}
              >
                <SelectTrigger className="bg-gray-800 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a24] border-white/10">
                  <SelectItem value="en">{t("common.english")}</SelectItem>
                  <SelectItem value="da">{t("common.danish")}</SelectItem>
                  <SelectItem value="de">{t("common.german")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">{t("billing.defaultTimeFormat")}</Label>
              <Select
                value={org.defaultTimeFormat ?? "24h"}
                onValueChange={(value) =>
                  orgPreferencesMutation.mutate({
                    language: org.defaultLanguage ?? "en",
                    timeFormat: value as TimeFormat,
                    distanceUnit: org.defaultDistanceUnit ?? "km",
                  })
                }
                disabled={orgPreferencesMutation.isPending}
              >
                <SelectTrigger className="bg-gray-800 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a24] border-white/10">
                  <SelectItem value="24h">{t("common.clock24")}</SelectItem>
                  <SelectItem value="12h">{t("common.clock12")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">{t("billing.defaultDistance")}</Label>
              <Select
                value={org.defaultDistanceUnit ?? "km"}
                onValueChange={(value) =>
                  orgPreferencesMutation.mutate({
                    language: org.defaultLanguage ?? "en",
                    timeFormat: org.defaultTimeFormat ?? "24h",
                    distanceUnit: value as DistanceUnit,
                  })
                }
                disabled={orgPreferencesMutation.isPending}
              >
                <SelectTrigger className="bg-gray-800 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a24] border-white/10">
                  <SelectItem value="km">{t("common.kilometers")}</SelectItem>
                  <SelectItem value="mi">{t("common.miles")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isOwner ? (
        <Card className="bg-gray-900 border-white/10">
          <CardHeader>
            <CardTitle className="text-white text-base">Company &amp; invoice information</CardTitle>
            <p className="text-gray-400 text-sm font-normal">
              Used on PDF invoices automatically sent when you buy credits. Leave blank to use your organization name only.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-white/70">Legal entity / company name</Label>
                <Input
                  className="bg-gray-800 border-white/10 text-white"
                  placeholder="Acme Theatre ApS"
                  value={inv.invoiceName}
                  onChange={(e) => setInv((s) => ({ ...s, invoiceName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-white/70">VAT number</Label>
                <Input
                  className="bg-gray-800 border-white/10 text-white"
                  placeholder="DK12345678"
                  value={inv.invoiceVat}
                  onChange={(e) => setInv((s) => ({ ...s, invoiceVat: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label className="text-white/70">Address</Label>
                <AddressFields value={invAddress} onChange={setInvAddress} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-white/70">Billing email</Label>
                <Input
                  type="email"
                  className="bg-gray-800 border-white/10 text-white"
                  placeholder="invoices@yourcompany.com"
                  value={inv.invoiceEmail}
                  onChange={(e) => setInv((s) => ({ ...s, invoiceEmail: e.target.value }))}
                />
                <p className="text-[11px] text-white/35">PDF invoices are sent to this address after each purchase.</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-white/70">Phone</Label>
                <Input
                  className="bg-gray-800 border-white/10 text-white"
                  placeholder="+45 12 34 56 78"
                  value={inv.invoicePhone}
                  onChange={(e) => setInv((s) => ({ ...s, invoicePhone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-white/70">Contact person</Label>
                <Input
                  className="bg-gray-800 border-white/10 text-white"
                  placeholder="Jane Doe"
                  value={inv.invoiceContact}
                  onChange={(e) => setInv((s) => ({ ...s, invoiceContact: e.target.value }))}
                />
              </div>
            </div>
            <div className="pt-1">
              <button
                type="button"
                disabled={invSaving}
                className="px-4 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
                onClick={async () => {
                  setInvSaving(true);
                  try {
                    await api.patch("/api/org/invoice-info", {
                      ...inv,
                      invoiceStreet:  invAddress.street  || null,
                      invoiceNumber:  invAddress.number  || null,
                      invoiceZip:     invAddress.zip     || null,
                      invoiceCity:    invAddress.city    || null,
                      invoiceState:   invAddress.state   || null,
                      invoiceCountry: invAddress.country || null,
                    });
                    queryClient.invalidateQueries({ queryKey: ["org-invoice-info"] });
                    setToast({ type: "success", message: "Invoice information saved." });
                  } catch {
                    setToast({ type: "error", message: "Could not save invoice information." });
                  } finally {
                    setInvSaving(false);
                  }
                }}
              >
                {invSaving ? "Saving…" : "Save invoice info"}
              </button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isOwner && org ? (
        <Card className="bg-gray-900 border-red-950/40 border">
          <CardHeader>
            <CardTitle className="text-red-300 text-base flex items-center gap-2">
              <Trash2 size={16} />
              Delete organization
            </CardTitle>
            <p className="text-red-200/50 text-sm font-normal">
              Permanently deletes all events, people, venues, tours, and billing data for{" "}
              <span className="text-white/70">{org.name}</span>. Other organizations you belong to are not affected.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {showDeleteOrg ? (
              <div className="rounded-lg border border-red-800/50 bg-red-950/25 p-4 space-y-3 max-w-md">
                <p className="text-sm text-red-200">
                  Type <span className="font-semibold text-white">delete</span> to confirm (not case sensitive).
                </p>
                <Input
                  className="bg-gray-900 border-red-800/40 text-white"
                  value={deleteWord}
                  onChange={(e) => setDeleteWord(e.target.value)}
                  placeholder="delete"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="border-white/10" onClick={() => { setShowDeleteOrg(false); setDeleteWord(""); }}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="bg-red-700 hover:bg-red-600 text-white border-0"
                    disabled={deleteOrgMutation.isPending || deleteWord.trim().toLowerCase() !== "delete"}
                    onClick={() => deleteOrgMutation.mutate()}
                  >
                    {deleteOrgMutation.isPending ? "Deleting…" : "Delete forever"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="border-red-800/50 text-red-300 hover:bg-red-950/40"
                onClick={() => setShowDeleteOrg(true)}
              >
                Delete this organization…
              </Button>
            )}
          </CardContent>
        </Card>
      ) : null}

      {org?.pendingAutoTopUpUrl && !org.unlimitedCredits ? (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
          <div className="flex items-start gap-2 text-indigo-200">
            <RefreshCw size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              Automatic top-up prepared a checkout because your balance is at or below your threshold.
              Complete payment to add credits.
            </span>
          </div>
          <Button asChild className="bg-indigo-600 hover:bg-indigo-500 sm:ml-auto flex-shrink-0">
            <a href={org.pendingAutoTopUpUrl}>Complete payment</a>
          </Button>
        </div>
      ) : null}


      {isOwner ? (
        <Card className="bg-gray-900 border-white/10">
          <CardHeader>
            <CardTitle className="text-white text-base">Automatic top-up when running low</CardTitle>
            <p className="text-gray-400 text-sm font-normal">
              When your balance is at or below the threshold, we create a Paddle checkout link for your chosen pack.
              You still confirm payment — credits are added after a successful transaction.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="auto-topup" className="text-white/80">
                Enable automatic checkout
              </Label>
              <Switch
                id="auto-topup"
                checked={org?.autoTopUpEnabled ?? false}
                disabled={settingsMutation.isPending || isLoading}
                onCheckedChange={(v) => {
                  settingsMutation.mutate({
                    autoTopUpEnabled: v,
                    autoTopUpPackId: v ? org?.autoTopUpPackId || firstPackId || null : org?.autoTopUpPackId ?? null,
                    autoTopUpThreshold: org?.autoTopUpThreshold ?? 30,
                  });
                }}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-white/70">Pack to buy when low</Label>
                <Select
                  value={org?.autoTopUpPackId || firstPackId || ""}
                  onValueChange={(packId) => {
                    settingsMutation.mutate({
                      autoTopUpPackId: packId,
                      autoTopUpEnabled: org?.autoTopUpEnabled ?? false,
                      autoTopUpThreshold: org?.autoTopUpThreshold ?? 30,
                    });
                  }}
                  disabled={settingsMutation.isPending || !(packs && packs.length)}
                >
                  <SelectTrigger className="bg-gray-800 border-white/10 text-white">
                    <SelectValue placeholder="Select pack" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a24] border-white/10">
                    {(packs ?? []).map((p) => (
                      <SelectItem key={p.packId} value={p.packId}>
                        {p.label} — {p.days} days (€{(p.amountCents / 100).toFixed(2)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Balance threshold (credit days)</Label>
                <Input
                  type="number"
                  min={0}
                  className="bg-gray-800 border-white/10 text-white"
                  value={thresholdDraft}
                  onChange={(e) => setThresholdDraft(e.target.value)}
                  onBlur={() => {
                    const n = Number.parseInt(thresholdDraft, 10);
                    if (Number.isNaN(n) || n < 0) return;
                    settingsMutation.mutate({
                      autoTopUpThreshold: n,
                      autoTopUpEnabled: org?.autoTopUpEnabled ?? false,
                      autoTopUpPackId: org?.autoTopUpPackId ?? firstPackId,
                    });
                  }}
                  disabled={settingsMutation.isPending}
                />
                <p className="text-[11px] text-white/35">
                  When balance is at or below this, a new checkout link is prepared (at most once per 24 hours).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

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
                    €{(((pack.amountCents / 100) / pack.days) * 100).toFixed(1)}¢/day
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

      <div className="bg-gray-900/50 border border-white/5 rounded-lg p-4 text-gray-400 text-sm space-y-1">
        <p>Credits are shared across your whole organisation.</p>
        <p>Adding more active team members means credits are consumed faster — plan accordingly.</p>
        <p>Payments are processed securely by Paddle. No subscription required for manual top-ups.</p>
      </div>
    </div>
  );
}
