import { useEffect, useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { api, isApiError, ApiError } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { signOut } from "@/lib/auth-client";
import { usePreferences } from "@/hooks/usePreferences";
import type { DistanceUnit, Language, TimeFormat } from "@/lib/preferences";
import { useI18n } from "@/lib/i18n";
import type { Person, PersonDocument } from "../../../backend/src/types";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import { AddressFields, EMPTY_ADDRESS, type Address } from "@/components/AddressFields";
import { DateInputWithWeekday } from "@/components/DateInputWithWeekday";
import { usePermissions } from "@/hooks/usePermissions";
import Billing from "@/pages/Billing";
import {
  PersonDocumentListRow,
  type PersonDocumentListRowHandle,
  type PersonDocumentSavePatch,
} from "@/components/PersonDocumentListRow";
import {
  DocumentPermissionsForm,
  normalizeDocumentPermissions,
  type DocumentPermissionState,
  type DocumentPermissionOptions,
} from "@/components/DocumentPermissionsForm";

const CONFIRM_PHRASE = "DELETE";

async function uploadPersonPhoto(personId: string, file: File): Promise<void> {
  const baseUrl = import.meta.env.VITE_BACKEND_URL || "";
  const formData = new FormData();
  formData.append("file", file);
  const resp = await fetch(`${baseUrl}/api/people/${personId}/photo`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!resp.ok) throw new Error("Could not upload image.");
}

async function uploadPersonDocument(
  personId: string,
  file: File,
  name: string,
  type: string,
  options?: { expiresAtYmd?: string; doesNotExpire?: boolean }
): Promise<void> {
  const baseUrl = import.meta.env.VITE_BACKEND_URL || "";
  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", name.trim() || file.name);
  formData.append("type", type.trim() || "other");
  if (options?.doesNotExpire) {
    formData.append("doesNotExpire", "true");
  } else if (options?.expiresAtYmd?.trim()) {
    formData.append("expiresAt", options.expiresAtYmd.trim());
  }
  const resp = await fetch(`${baseUrl}/api/people/${personId}/documents`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!resp.ok) throw new Error("Could not upload document.");
}

export default function Account() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { effective, isLoading } = usePreferences();
  const { t } = useI18n();
  const { canAction } = usePermissions();
  const canManageBranding = canAction("billing.manage");

  const [phrase, setPhrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [prefsError, setPrefsError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [docExpires, setDocExpires] = useState("");
  const [docDoesNotExpire, setDocDoesNotExpire] = useState(false);
  const [docType, setDocType] = useState("other");
  const [permissionsDoc, setPermissionsDoc] = useState<PersonDocument | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<DocumentPermissionState>({ teamIds: [], personIds: [] });

  const documentRowHandleMap = useRef(new Map<string, PersonDocumentListRowHandle>());

  const { data: mePerson } = useQuery<Person | null>({
    queryKey: ["people", "me"],
    queryFn: () => api.get<Person | null>("/api/people/me"),
  });

  const { data: myDocs } = useQuery<PersonDocument[]>({
    queryKey: ["people", mePerson?.id, "documents"],
    queryFn: () => api.get<PersonDocument[]>(`/api/people/${mePerson!.id}/documents`),
    enabled: Boolean(mePerson?.id),
  });

  const { data: permissionOptions } = useQuery<DocumentPermissionOptions>({
    queryKey: ["people", "documents", permissionsDoc?.id, "permission-options"],
    queryFn: () =>
      api.get<DocumentPermissionOptions>(`/api/people/documents/${permissionsDoc!.id}/permissions/options`),
    enabled: Boolean(permissionsDoc?.id),
  });

  const { data: permissionState } = useQuery<DocumentPermissionState>({
    queryKey: ["people", "documents", permissionsDoc?.id, "permissions"],
    queryFn: () =>
      api.get<DocumentPermissionState>(`/api/people/documents/${permissionsDoc!.id}/permissions`),
    enabled: Boolean(permissionsDoc?.id),
  });

  const [profileDraft, setProfileDraft] = useState<{
    name: string;
    phone: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
  }>({
    name: "",
    phone: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
  });
  const [companyDraft, setCompanyDraft] = useState({
    invoiceName: "",
    invoiceVat: "",
    invoiceEmail: "",
    invoicePhone: "",
    invoiceContact: "",
  });
  const [companyAddress, setCompanyAddress] = useState<Address>(EMPTY_ADDRESS);
  const [companyLogoFile, setCompanyLogoFile] = useState<File | null>(null);
  const [companyLogoPreviewUrl, setCompanyLogoPreviewUrl] = useState<string | null>(null);
  const [companyLogoStatus, setCompanyLogoStatus] = useState<string>("");

  const { data: companyInfo } = useQuery<{
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
    hasCompanyLogo?: boolean;
    companyLogoUpdatedAt?: string | null;
  }>({
    queryKey: ["org-invoice-info"],
    queryFn: () => api.get("/api/org/invoice-info"),
    enabled: canManageBranding,
  });

  const updatePrefsMutation = useMutation({
    mutationFn: (body: Partial<{ language: Language; timeFormat: TimeFormat; distanceUnit: DistanceUnit }>) =>
      api.patch<{ ok: boolean }>("/api/preferences", body),
    onSuccess: () => {
      setPrefsError("");
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
    },
    onError: (e: unknown) => {
      if (isApiError(e)) setPrefsError(e.message);
      else setPrefsError(t("account.savePrefError"));
    },
  });

  const saveCompanyMutation = useMutation({
    mutationFn: async () => {
      await api.patch("/api/org/invoice-info", {
        ...companyDraft,
        invoiceStreet: companyAddress.street || null,
        invoiceNumber: companyAddress.number || null,
        invoiceZip: companyAddress.zip || null,
        invoiceCity: companyAddress.city || null,
        invoiceState: companyAddress.state || null,
        invoiceCountry: companyAddress.country || null,
      });
      if (companyLogoFile) {
        const baseUrl = import.meta.env.VITE_BACKEND_URL || "";
        const formData = new FormData();
        formData.append("file", companyLogoFile);
        const resp = await fetch(`${baseUrl}/api/org/company-logo`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (!resp.ok) {
          const payload = await resp.json().catch(() => null);
          const message =
            payload?.error?.message || payload?.message || "Company info saved, but logo upload failed.";
          throw new Error(message);
        }
      }
    },
    onSuccess: () => {
      setCompanyLogoFile(null);
      setCompanyLogoStatus(companyLogoFile ? "Company information and logo saved." : "Company information saved.");
      queryClient.invalidateQueries({ queryKey: ["org-invoice-info"] });
      setProfileMessage(companyLogoFile ? "Company information and logo saved." : "Company information saved.");
      toast({ title: companyLogoFile ? "Company information and logo saved" : "Company information saved" });
    },
    onError: (e: Error) => {
      const msg = e.message || "Could not save company information.";
      setCompanyLogoStatus(msg);
      setProfileMessage(msg);
      toast({ title: "Could not save company information", description: msg, variant: "destructive" });
    },
  });

  const uploadCompanyLogoMutation = useMutation({
    mutationFn: async () => {
      if (!companyLogoFile) throw new Error("Please choose a logo file first.");
      const baseUrl = import.meta.env.VITE_BACKEND_URL || "";
      const formData = new FormData();
      formData.append("file", companyLogoFile);
      const resp = await fetch(`${baseUrl}/api/org/company-logo`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!resp.ok) {
        const payload = await resp.json().catch(() => null);
        const message = payload?.error?.message || payload?.message || "Could not upload company logo.";
        throw new Error(message);
      }
    },
    onSuccess: () => {
      setCompanyLogoFile(null);
      setCompanyLogoStatus("Company logo updated.");
      queryClient.invalidateQueries({ queryKey: ["org-invoice-info"] });
      setProfileMessage("Company logo updated.");
      toast({ title: "Company logo updated" });
    },
    onError: (e: Error) => {
      const msg = e.message || "Could not upload company logo.";
      setCompanyLogoStatus(msg);
      setProfileMessage(msg);
      toast({ title: "Could not upload company logo", description: msg, variant: "destructive" });
    },
  });

  const removeCompanyLogoMutation = useMutation({
    mutationFn: () => api.delete("/api/org/company-logo"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-invoice-info"] });
      setCompanyLogoStatus("Company logo removed.");
      setProfileMessage("Company logo removed.");
      toast({ title: "Company logo removed" });
    },
    onError: (e: Error) => {
      const msg = e.message || "Could not remove company logo.";
      setCompanyLogoStatus(msg);
      setProfileMessage(msg);
      toast({ title: "Could not remove company logo", description: msg, variant: "destructive" });
    },
  });

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      if (!mePerson) return;
      const docHandles = [...documentRowHandleMap.current.values()];
      if (docHandles.length) {
        await Promise.all(docHandles.map((h) => h.saveIfDirty()));
      }
      await api.put(`/api/people/${mePerson.id}`, {
        name: profileDraft.name.trim(),
        phone: profileDraft.phone.trim() || undefined,
        emergencyContactName: profileDraft.emergencyContactName.trim() || undefined,
        emergencyContactPhone: profileDraft.emergencyContactPhone.trim() || undefined,
      });
      if (photoFile) await uploadPersonPhoto(mePerson.id, photoFile);
      if (docFile)
        await uploadPersonDocument(mePerson.id, docFile, docName, docType, {
          expiresAtYmd: docExpires,
          doesNotExpire: docDoesNotExpire,
        });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people", "me"] });
      if (mePerson?.id) queryClient.invalidateQueries({ queryKey: ["people", mePerson.id, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["people"] });
      setPhotoFile(null);
      setDocFile(null);
      setDocName("");
      setDocExpires("");
      setDocDoesNotExpire(false);
      setDocType("other");
      setProfileMessage("Profile saved.");
    },
    onError: (e: Error) => {
      setProfileMessage(e.message || "Could not save profile.");
    },
  });

  const removePhotoMutation = useMutation({
    mutationFn: () => api.delete(`/api/people/${mePerson!.id}/photo`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people", "me"] });
      setProfileMessage("Image deleted.");
    },
    onError: () => setProfileMessage("Could not delete image."),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => api.delete(`/api/people/documents/${docId}`),
    onSuccess: () => {
      if (mePerson?.id) queryClient.invalidateQueries({ queryKey: ["people", mePerson.id, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["people"] });
    },
  });

  const updateDocMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: PersonDocumentSavePatch }) =>
      api.patch<PersonDocument>(`/api/people/documents/${id}`, body),
    onSuccess: (data, { id }) => {
      if (mePerson?.id && data) {
        queryClient.setQueryData<PersonDocument[]>(["people", mePerson.id, "documents"], (old) =>
          !old ? old : old.map((d) => (d.id === id ? { ...d, ...data } : d))
        );
      }
      if (mePerson?.id) queryClient.invalidateQueries({ queryKey: ["people", mePerson.id, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["people"] });
    },
    onError: (e: Error) => {
      const msg = e instanceof ApiError ? e.message : "Could not update document";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const updateDocPermissionsMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: DocumentPermissionState }) =>
      api.patch<DocumentPermissionState>(`/api/people/documents/${id}/permissions`, body),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["people", "documents", id, "permissions"] });
      toast({ title: "Document permissions updated" });
      setPermissionsDoc(null);
    },
    onError: (e: Error) => {
      const msg = e instanceof ApiError ? e.message : "Could not update document permissions";
      toast({ title: msg, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!mePerson) return;
    setProfileDraft({
      name: mePerson.name ?? "",
      phone: mePerson.phone ?? "",
      emergencyContactName: mePerson.emergencyContactName ?? "",
      emergencyContactPhone: mePerson.emergencyContactPhone ?? "",
    });
  }, [mePerson?.id]);

  useEffect(() => {
    if (!companyInfo) return;
    setCompanyDraft({
      invoiceName: companyInfo.invoiceName ?? "",
      invoiceVat: companyInfo.invoiceVat ?? "",
      invoiceEmail: companyInfo.invoiceEmail ?? "",
      invoicePhone: companyInfo.invoicePhone ?? "",
      invoiceContact: companyInfo.invoiceContact ?? "",
    });
    setCompanyAddress({
      street: companyInfo.invoiceStreet ?? "",
      number: companyInfo.invoiceNumber ?? "",
      zip: companyInfo.invoiceZip ?? "",
      city: companyInfo.invoiceCity ?? "",
      state: companyInfo.invoiceState ?? "",
      country: companyInfo.invoiceCountry ?? "",
    });
  }, [companyInfo]);

  useEffect(() => {
    if (!companyLogoFile) {
      setCompanyLogoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(companyLogoFile);
    setCompanyLogoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [companyLogoFile]);

  useEffect(() => {
    if (!permissionState || !permissionsDoc) return;
    setPermissionDraft(
      normalizeDocumentPermissions(
        { teamIds: permissionState.teamIds ?? [], personIds: permissionState.personIds ?? [] },
        permissionOptions?.teams
      )
    );
  }, [permissionState, permissionsDoc?.id, permissionOptions?.teams]);

  async function onDeleteAccount() {
    setError("");
    if (phrase !== CONFIRM_PHRASE) {
      setError(t("account.phraseError", { phrase: CONFIRM_PHRASE }));
      return;
    }
    setLoading(true);
    try {
      await api.delete<undefined>("/api/me/account", {
        body: JSON.stringify({ phrase: CONFIRM_PHRASE }),
        headers: { "Content-Type": "application/json" },
      });
      await signOut();
      navigate("/login");
    } catch (e: unknown) {
      if (isApiError(e)) {
        setError(e.message);
      } else {
        setError(t("account.deleteError"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-white">{t("account.title")}</h2>
        <p className="text-sm text-white/45 mt-1">{t("account.subtitle")}</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <div>
          <p className="text-sm font-medium text-white">{t("account.preferencesTitle")}</p>
          <p className="text-xs text-white/50 mt-1">
            {t("account.preferencesHint")}
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.language")}</Label>
            <Select
              value={effective?.language ?? "en"}
              disabled={isLoading || updatePrefsMutation.isPending}
              onValueChange={(value) => updatePrefsMutation.mutate({ language: value as Language })}
            >
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white">
                <SelectItem value="en">{t("common.english")}</SelectItem>
                <SelectItem value="da">{t("common.danish")}</SelectItem>
                <SelectItem value="de">{t("common.german")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.timeFormat")}</Label>
            <Select
              value={effective?.timeFormat ?? "24h"}
              disabled={isLoading || updatePrefsMutation.isPending}
              onValueChange={(value) => updatePrefsMutation.mutate({ timeFormat: value as TimeFormat })}
            >
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white">
                <SelectItem value="24h">{t("common.clock24")}</SelectItem>
                <SelectItem value="12h">{t("common.clock12")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.distance")}</Label>
            <Select
              value={effective?.distanceUnit ?? "km"}
              disabled={isLoading || updatePrefsMutation.isPending}
              onValueChange={(value) => updatePrefsMutation.mutate({ distanceUnit: value as DistanceUnit })}
            >
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white">
                <SelectItem value="km">{t("common.kilometers")}</SelectItem>
                <SelectItem value="mi">{t("common.miles")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {prefsError ? <p className="text-xs text-red-400">{prefsError}</p> : null}
      </div>

      {canManageBranding ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-white">Company information & branding</p>
            <p className="text-xs text-white/50 mt-1">
              Used on generated reports and documents (invoice PDFs and venue tech rider files).
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs uppercase tracking-wide">Company name</Label>
              <Input
                value={companyDraft.invoiceName}
                onChange={(e) => setCompanyDraft((s) => ({ ...s, invoiceName: e.target.value }))}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs uppercase tracking-wide">VAT number</Label>
              <Input
                value={companyDraft.invoiceVat}
                onChange={(e) => setCompanyDraft((s) => ({ ...s, invoiceVat: e.target.value }))}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-white/70 text-xs uppercase tracking-wide">Company address</Label>
              <AddressFields value={companyAddress} onChange={setCompanyAddress} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs uppercase tracking-wide">Email</Label>
              <Input
                value={companyDraft.invoiceEmail}
                onChange={(e) => setCompanyDraft((s) => ({ ...s, invoiceEmail: e.target.value }))}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs uppercase tracking-wide">Phone</Label>
              <Input
                value={companyDraft.invoicePhone}
                onChange={(e) => setCompanyDraft((s) => ({ ...s, invoicePhone: e.target.value }))}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs uppercase tracking-wide">Contact person</Label>
              <Input
                value={companyDraft.invoiceContact}
                onChange={(e) => setCompanyDraft((s) => ({ ...s, invoiceContact: e.target.value }))}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-white/70 text-xs uppercase tracking-wide">Company logo</Label>
            {companyInfo?.hasCompanyLogo ? (
              <img
                src={`${import.meta.env.VITE_BACKEND_URL || ""}/api/org/company-logo?ts=${companyInfo.companyLogoUpdatedAt ?? ""}`}
                alt="Company logo"
                className="h-20 max-w-[240px] rounded border border-white/10 bg-white object-contain p-2"
              />
            ) : null}
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    setCompanyLogoStatus("");
                    setCompanyLogoFile(e.target.files?.[0] ?? null);
                  }}
                  className="max-w-md bg-white/5 border-white/10 text-white file:text-white"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/10 text-white/80 bg-transparent"
                  disabled={!companyLogoFile || uploadCompanyLogoMutation.isPending}
                  onClick={() => uploadCompanyLogoMutation.mutate()}
                >
                  {uploadCompanyLogoMutation.isPending ? "Uploading..." : "Upload logo"}
                </Button>
                {companyInfo?.hasCompanyLogo ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-white/10 text-white/70 bg-transparent"
                    disabled={removeCompanyLogoMutation.isPending}
                    onClick={() => removeCompanyLogoMutation.mutate()}
                  >
                    {removeCompanyLogoMutation.isPending ? "Removing..." : "Remove logo"}
                  </Button>
                ) : null}
              </div>
              {companyLogoPreviewUrl ? (
                <div className="rounded border border-white/10 bg-white/5 p-2">
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-white/40">New logo preview</p>
                  <img
                    src={companyLogoPreviewUrl}
                    alt="New company logo preview"
                    className="h-20 max-w-[200px] object-contain"
                  />
                </div>
              ) : null}
            </div>
            {companyLogoStatus ? <p className="text-xs text-white/70">{companyLogoStatus}</p> : null}
          </div>
          <Button
            type="button"
            className="bg-indigo-700 hover:bg-indigo-600"
            disabled={saveCompanyMutation.isPending}
            onClick={() => saveCompanyMutation.mutate()}
          >
            {saveCompanyMutation.isPending ? "Saving..." : "Save company information"}
          </Button>
        </div>
      ) : null}

      <div id="billing" className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <div>
          <p className="text-sm font-medium text-white">Billing</p>
          <p className="text-xs text-white/50 mt-1">
            Manage monthly invoicing, organization billing options, and payment status.
          </p>
        </div>
        <Billing embedded />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <div>
          <p className="text-sm font-medium text-white">My profile</p>
          <p className="text-xs text-white/50 mt-1">
            Edit your person profile, image, and personal documents here.
          </p>
        </div>
        {!mePerson ? (
          <p className="text-xs text-white/40">
            No linked person profile found for your email in this organization yet.
          </p>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-white/70 text-xs uppercase tracking-wide">Name</Label>
                <Input
                  value={profileDraft.name}
                  onChange={(e) => setProfileDraft((s) => ({ ...s, name: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70 text-xs uppercase tracking-wide">Phone</Label>
                <Input
                  value={profileDraft.phone}
                  onChange={(e) => setProfileDraft((s) => ({ ...s, phone: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70 text-xs uppercase tracking-wide">Emergency contact name</Label>
                <Input
                  value={profileDraft.emergencyContactName}
                  onChange={(e) => setProfileDraft((s) => ({ ...s, emergencyContactName: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70 text-xs uppercase tracking-wide">Emergency contact phone</Label>
                <Input
                  value={profileDraft.emergencyContactPhone}
                  onChange={(e) => setProfileDraft((s) => ({ ...s, emergencyContactPhone: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
            </div>

            <div className="flex flex-col gap-4 w-full min-w-0">
              <div className="space-y-2 w-full max-w-md">
                <Label className="text-white/70 text-xs uppercase tracking-wide">Profile image</Label>
                {mePerson.hasPhoto ? (
                  <img
                    src={`${import.meta.env.VITE_BACKEND_URL || ""}/api/people/${mePerson.id}/photo?ts=${mePerson.photoUpdatedAt ?? ""}`}
                    alt="Profile"
                    className="h-24 w-24 rounded-md object-cover border border-white/10"
                  />
                ) : null}
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                  className="bg-white/5 border-white/10 text-white file:text-white"
                />
                {mePerson.hasPhoto ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-white/15 text-white/70"
                    disabled={removePhotoMutation.isPending}
                    onClick={() => {
                      if (!confirmDeleteAction("profile image")) return;
                      removePhotoMutation.mutate();
                    }}
                  >
                    {removePhotoMutation.isPending ? "Deleting..." : "Delete image"}
                  </Button>
                ) : null}
              </div>

              <div className="space-y-2 w-full min-w-0">
                <Label className="text-white/70 text-xs uppercase tracking-wide">Documents</Label>
                <div className="overflow-x-auto">
                  <div className="flex items-center gap-2 min-w-[980px]">
                    <Input
                      placeholder="Document name"
                      value={docName}
                      onChange={(e) => setDocName(e.target.value)}
                      className="w-[220px] bg-white/5 border-white/10 text-white"
                    />
                    <Input
                      placeholder="Document type"
                      value={docType}
                      onChange={(e) => setDocType(e.target.value)}
                      className="w-[170px] bg-white/5 border-white/10 text-white"
                    />
                    <label className="flex items-center gap-2 text-sm text-white/55 cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={docDoesNotExpire}
                        onChange={(e) => {
                          setDocDoesNotExpire(e.target.checked);
                          if (e.target.checked) setDocExpires("");
                        }}
                        className="rounded border-white/30 accent-violet-600"
                      />
                      <span>Does not expire</span>
                    </label>
                    <DateInputWithWeekday
                      value={docExpires}
                      disabled={docDoesNotExpire}
                      onChange={setDocExpires}
                      className="h-9 w-[170px] rounded border border-white/10 bg-white/5 px-2 py-1.5 text-white text-sm disabled:opacity-40"
                      weekdayClassName="text-[10px] text-white/45"
                    />
                    <Input
                      type="file"
                      onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                      className="w-[230px] bg-white/5 border-white/10 text-white file:text-white"
                    />
                  </div>
                </div>
                {myDocs && myDocs.length > 0 ? (
                  <div className="rounded border border-white/10">
                    {myDocs.map((doc) => (
                      <PersonDocumentListRow
                        key={doc.id}
                        ref={(h) => {
                          if (h) documentRowHandleMap.current.set(doc.id, h);
                          else documentRowHandleMap.current.delete(doc.id);
                        }}
                        doc={doc}
                        canEdit
                        canManagePermissions
                        isSaving={updateDocMutation.isPending && updateDocMutation.variables?.id === doc.id}
                        isDeleting={deleteDocMutation.isPending && deleteDocMutation.variables === doc.id}
                        onSave={async (id, body) => {
                          await updateDocMutation.mutateAsync({ id, body });
                        }}
                        onEditPermissions={(d) => setPermissionsDoc(d)}
                        onDelete={(id) => deleteDocMutation.mutate(id)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {profileMessage ? <p className="text-xs text-white/60">{profileMessage}</p> : null}
            <Button
              type="button"
              className="bg-indigo-700 hover:bg-indigo-600"
              disabled={saveProfileMutation.isPending}
              onClick={() => saveProfileMutation.mutate()}
            >
              {saveProfileMutation.isPending ? "Saving..." : "Save profile"}
            </Button>
          </>
        )}
      </div>

      <Dialog open={Boolean(permissionsDoc)} onOpenChange={(o) => { if (!o) setPermissionsDoc(null); }}>
        <DialogContent className="bg-[#16161f] border-white/10 text-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Document permissions</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-white/45">Default is no one in addition to the document owner. Use teams and people below.</p>
          <DocumentPermissionsForm
            options={permissionOptions}
            draft={permissionDraft}
            onChange={setPermissionDraft}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-white/10 text-white/70 bg-transparent"
              onClick={() => setPermissionsDoc(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-indigo-700 hover:bg-indigo-600 text-white"
              disabled={!permissionsDoc || updateDocPermissionsMutation.isPending}
              onClick={() => {
                if (!permissionsDoc) return;
                updateDocPermissionsMutation.mutate({
                  id: permissionsDoc.id,
                  body: { teamIds: permissionDraft.teamIds, personIds: permissionDraft.personIds },
                });
              }}
            >
              {updateDocPermissionsMutation.isPending ? "Saving..." : "Save permissions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-xl border border-red-500/25 bg-red-950/20 p-5 space-y-4">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-white">{t("account.deleteTitle")}</p>
            <p className="text-xs text-white/50 leading-relaxed">
              {t("account.deleteHint")}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="delete-phrase" className="text-white/70 text-xs uppercase tracking-wide">
            {t("account.typeConfirm", { phrase: CONFIRM_PHRASE })}
          </Label>
          <Input
            id="delete-phrase"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            autoComplete="off"
            className="bg-white/5 border-white/10 text-white placeholder:text-white/25"
          />
        </div>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Button
          type="button"
          variant="destructive"
          className="w-full bg-red-900 hover:bg-red-800"
          disabled={loading || phrase !== CONFIRM_PHRASE}
          onClick={onDeleteAccount}
        >
          {loading ? t("account.deleting") : t("account.deleteCta")}
        </Button>
      </div>
    </div>
  );
}
