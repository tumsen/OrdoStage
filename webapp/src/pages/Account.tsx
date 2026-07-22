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
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { signOut } from "@/lib/auth-client";
import { usePreferences } from "@/hooks/usePreferences";
import { useUserPreferencesMutation } from "@/hooks/useUserPreferencesMutation";
import type { DistanceUnit, Language, TimeFormat } from "@/lib/preferences";
import { UserUiLanguageSelect } from "@/components/UserUiLanguageSelect";
import { useI18n } from "@/lib/i18n";
import {
  DURATION_HOURS_INPUT_CLASS,
  DURATION_HOURS_INPUT_MAX_LENGTH,
  formatDurationHoursForInput,
  parseDurationHours,
} from "@/lib/durationHours";
import { commaDecimalForLanguage } from "@/lib/timeGrid";
import type { Person, PersonDocument, OrganizationLeavePolicy } from "../../../backend/src/types";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import { AddressFields, EMPTY_ADDRESS, type Address } from "@/components/AddressFields";
import { DateInputWithWeekday } from "@/components/DateInputWithWeekday";
import { usePermissions } from "@/hooks/usePermissions";
import { COUNTRY_FEATURE_CATALOG, isCountryFeatureEnabled } from "@/lib/countryFeatures";
import type { OrganizationCountryFeatures } from "@/lib/countryFeatures";
import { autoSaveBlurCapture, useAutoSave } from "@/hooks/useAutoSave";
import { useAutoSaveDraft } from "@/hooks/useAutoSaveDraft";
import { AutoSaveStatus } from "@/components/AutoSaveStatus";
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
import { RemoteImageHoverPreview } from "@/components/DocumentListThumbnail";
import {
  PERSON_DOCUMENT_TYPE_OPTIONS,
  personDocumentTypeLabel,
  type PersonDocumentTypeKey,
} from "@/lib/personDocumentTypes";

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
  const { t, language } = useI18n();
  const commaDec = commaDecimalForLanguage(language);
  const { canAction, isOwner } = usePermissions();
  const canManageBranding = canAction("billing.manage");
  const canDeleteOrganization = canAction("org.delete");
  const canManageOrgFeatures = canAction("org.update");
  type DeletionRequirements = {
    organizationName: string;
    owners: { id: string; email: string; name: string | null }[];
  };

  const { data: deletionInfo } = useQuery<DeletionRequirements>({
    queryKey: ["org", "deletion-requirements"],
    queryFn: () => api.get<DeletionRequirements>("/api/org/deletion-requirements"),
    enabled: canDeleteOrganization,
  });
  const { data: orgFeatureData } = useQuery<{
    productionPlannerEnabled?: boolean;
    countryFeatures?: OrganizationCountryFeatures;
  }>({
    queryKey: ["org", "features"],
    queryFn: () =>
      api.get<{ productionPlannerEnabled?: boolean; countryFeatures?: OrganizationCountryFeatures }>("/api/org"),
    enabled: canManageOrgFeatures,
  });
  const [productionPlannerEnabled, setProductionPlannerEnabled] = useState(false);
  const [dkTravelAllowanceEnabled, setDkTravelAllowanceEnabled] = useState(false);
  const [dkMileageAllowanceEnabled, setDkMileageAllowanceEnabled] = useState(false);
  const [dkLeaveManagementEnabled, setDkLeaveManagementEnabled] = useState(false);

  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ownerPasswords, setOwnerPasswords] = useState<Record<string, string>>({});
  const [prefsError, setPrefsError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [docExpires, setDocExpires] = useState("");
  const [docDoesNotExpire, setDocDoesNotExpire] = useState(false);
  const [docType, setDocType] = useState<PersonDocumentTypeKey>("other");
  const [permissionsDoc, setPermissionsDoc] = useState<PersonDocument | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<DocumentPermissionState>({ teamIds: [], personIds: [] });

  const documentRowHandleMap = useRef(new Map<string, PersonDocumentListRowHandle>());

  useEffect(() => {
    if (!isOwner || window.location.hash !== "#billing") return;
    const el = document.getElementById("billing");
    if (!el) return;
    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [isOwner]);

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

  useEffect(() => {
    setProductionPlannerEnabled(Boolean(orgFeatureData?.productionPlannerEnabled));
    setDkTravelAllowanceEnabled(
      isCountryFeatureEnabled(orgFeatureData?.countryFeatures, "DK", "travelAllowance")
    );
    setDkMileageAllowanceEnabled(
      isCountryFeatureEnabled(orgFeatureData?.countryFeatures, "DK", "mileageAllowance")
    );
    setDkLeaveManagementEnabled(
      isCountryFeatureEnabled(orgFeatureData?.countryFeatures, "DK", "leaveManagement")
    );
  }, [orgFeatureData?.productionPlannerEnabled, orgFeatureData?.countryFeatures]);

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

  const updatePrefsMutation = useUserPreferencesMutation();

  const patchPrefs = (body: Partial<{ language: Language; timeFormat: TimeFormat; distanceUnit: DistanceUnit }>) => {
    updatePrefsMutation.mutate(body, {
      onSuccess: () => setPrefsError(""),
      onError: (e: unknown) => {
        if (isApiError(e)) setPrefsError(e.message);
        else setPrefsError(t("account.savePrefError"));
      },
    });
  };

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
            payload?.error?.message || payload?.message || t("account.companyInfoLogoPartialFail");
          throw new Error(message);
        }
      }
    },
    onSuccess: () => {
      setCompanyLogoFile(null);
      setCompanyLogoStatus(companyLogoFile ? t("account.companyInfoAndLogoSaved") : t("account.companyInfoSaved"));
      queryClient.invalidateQueries({ queryKey: ["org-invoice-info"] });
      setProfileMessage(companyLogoFile ? t("account.companyInfoAndLogoSaved") : t("account.companyInfoSaved"));
      toast({ title: companyLogoFile ? t("account.companyInfoAndLogoSaved") : t("account.companyInfoSaved") });
    },
    onError: (e: Error) => {
      const msg = e.message || t("account.companyInfoSaveError");
      setCompanyLogoStatus(msg);
      setProfileMessage(msg);
      toast({ title: t("account.companyInfoSaveError"), description: msg, variant: "destructive" });
    },
  });

  const updateOrgFeaturesMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.patch<{ ok: boolean; productionPlannerEnabled: boolean }>("/api/org/features", {
        productionPlannerEnabled: enabled,
      }),
    onSuccess: (data) => {
      setProductionPlannerEnabled(Boolean(data.productionPlannerEnabled));
      queryClient.invalidateQueries({ queryKey: ["org"] });
      queryClient.invalidateQueries({ queryKey: ["org", "features"] });
      toast({ title: t("account.orgFeatureUpdated") });
    },
    onError: (e: unknown) => {
      setProductionPlannerEnabled(Boolean(orgFeatureData?.productionPlannerEnabled));
      const msg = isApiError(e) ? e.message : t("account.orgFeatureUpdateError");
      toast({ title: t("account.featureUpdateFailed"), description: msg, variant: "destructive" });
    },
  });

  const updateCountryFeaturesMutation = useMutation({
    mutationFn: (patch: {
      travelAllowance?: boolean;
      mileageAllowance?: boolean;
      leaveManagement?: boolean;
    }) =>
      api.patch<{ ok: boolean; countryFeatures: OrganizationCountryFeatures }>("/api/org/country-features", {
        country: "DK",
        ...patch,
      }),
    onSuccess: (data) => {
      setDkTravelAllowanceEnabled(
        isCountryFeatureEnabled(data.countryFeatures, "DK", "travelAllowance")
      );
      setDkMileageAllowanceEnabled(
        isCountryFeatureEnabled(data.countryFeatures, "DK", "mileageAllowance")
      );
      setDkLeaveManagementEnabled(
        isCountryFeatureEnabled(data.countryFeatures, "DK", "leaveManagement")
      );
      queryClient.invalidateQueries({ queryKey: ["org"] });
      queryClient.invalidateQueries({ queryKey: ["org", "features"] });
      toast({ title: t("account.countryFeatureUpdated") });
    },
    onError: (e: unknown) => {
      setDkTravelAllowanceEnabled(
        isCountryFeatureEnabled(orgFeatureData?.countryFeatures, "DK", "travelAllowance")
      );
      setDkMileageAllowanceEnabled(
        isCountryFeatureEnabled(orgFeatureData?.countryFeatures, "DK", "mileageAllowance")
      );
      setDkLeaveManagementEnabled(
        isCountryFeatureEnabled(orgFeatureData?.countryFeatures, "DK", "leaveManagement")
      );
      const msg = isApiError(e) ? e.message : t("account.countryFeatureUpdateError");
      toast({ title: t("account.featureUpdateFailed"), description: msg, variant: "destructive" });
    },
  });

  const { data: leavePolicy } = useQuery({
    queryKey: ["org-leave-policy"],
    queryFn: () => api.get<OrganizationLeavePolicy>("/api/org/leave-policy"),
    enabled: canManageOrgFeatures && dkLeaveManagementEnabled,
  });

  const [leavePolicyDraft, setLeavePolicyDraft] = useState({
    vacationYearStartMonth: "9",
    vacationYearStartDay: "1",
    defaultVacationDaysPerYear: "25",
    defaultExtraVacationDays: "5",
    defaultWeeklyContractHours: "37",
    compTimeFromOvertimeEnabled: true,
  });

  useEffect(() => {
    if (!leavePolicy) return;
    setLeavePolicyDraft({
      vacationYearStartMonth: String(leavePolicy.vacationYearStartMonth),
      vacationYearStartDay: String(leavePolicy.vacationYearStartDay),
      defaultVacationDaysPerYear: String(leavePolicy.defaultVacationDaysPerYear),
      defaultExtraVacationDays: String(leavePolicy.defaultExtraVacationDays),
      defaultWeeklyContractHours: formatDurationHoursForInput(
        leavePolicy.defaultWeeklyContractHours,
        commaDec
      ),
      compTimeFromOvertimeEnabled: leavePolicy.compTimeFromOvertimeEnabled,
    });
  }, [leavePolicy, commaDec]);

  const saveLeavePolicyMutation = useMutation({
    mutationFn: () => {
      const weeklyHours = parseDurationHours(leavePolicyDraft.defaultWeeklyContractHours);
      if (weeklyHours === null || Number.isNaN(weeklyHours)) {
        throw new Error("Invalid weekly contract hours");
      }
      return api.patch<OrganizationLeavePolicy>("/api/org/leave-policy", {
        vacationYearStartMonth: parseInt(leavePolicyDraft.vacationYearStartMonth, 10),
        vacationYearStartDay: parseInt(leavePolicyDraft.vacationYearStartDay, 10),
        defaultVacationDaysPerYear: parseFloat(leavePolicyDraft.defaultVacationDaysPerYear),
        defaultExtraVacationDays: parseFloat(leavePolicyDraft.defaultExtraVacationDays),
        defaultWeeklyContractHours: weeklyHours,
        compTimeFromOvertimeEnabled: leavePolicyDraft.compTimeFromOvertimeEnabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-leave-policy"] });
      toast({ title: t("account.leavePolicySaved") });
    },
    onError: (e: unknown) => {
      const msg = isApiError(e) ? e.message : t("account.leavePolicySaveError");
      toast({ title: t("account.saveFailed"), description: msg, variant: "destructive" });
    },
  });

  const uploadCompanyLogoMutation = useMutation({
    mutationFn: async () => {
      if (!companyLogoFile) throw new Error(t("account.chooseLogoFirst"));
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
        const message = payload?.error?.message || payload?.message || t("account.companyLogoUploadError");
        throw new Error(message);
      }
    },
    onSuccess: () => {
      setCompanyLogoFile(null);
      setCompanyLogoStatus(t("account.companyLogoUpdated"));
      queryClient.invalidateQueries({ queryKey: ["org-invoice-info"] });
      setProfileMessage(t("account.companyLogoUpdated"));
      toast({ title: t("account.companyLogoUpdated") });
    },
    onError: (e: Error) => {
      const msg = e.message || t("account.companyLogoUploadError");
      setCompanyLogoStatus(msg);
      setProfileMessage(msg);
      toast({ title: t("account.companyLogoUploadError"), description: msg, variant: "destructive" });
    },
  });

  const removeCompanyLogoMutation = useMutation({
    mutationFn: () => api.delete("/api/org/company-logo"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-invoice-info"] });
      setCompanyLogoStatus(t("account.companyLogoRemoved"));
      setProfileMessage(t("account.companyLogoRemoved"));
      toast({ title: t("account.companyLogoRemoved") });
    },
    onError: (e: Error) => {
      const msg = e.message || t("account.companyLogoRemoveError");
      setCompanyLogoStatus(msg);
      setProfileMessage(msg);
      toast({ title: t("account.companyLogoRemoveError"), description: msg, variant: "destructive" });
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
      if (docFile)
        await uploadPersonDocument(mePerson.id, docFile, docName, docType, {
          expiresAtYmd: docExpires,
          doesNotExpire: docDoesNotExpire,
        });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people", "me"] });
      if (mePerson?.id) queryClient.invalidateQueries({ queryKey: ["people", mePerson.id, "documents"] });
      setDocFile(null);
      setDocName("");
      setDocExpires("");
      setDocDoesNotExpire(false);
      setDocType("other");
    },
    onError: () => {
      /* surfaced via AutoSaveStatus */
    },
  });

  const profileAutoSave = useAutoSave({
    enabled: Boolean(mePerson?.id),
    resetKey: mePerson?.id,
    getSnapshot: () => profileDraft,
    save: () => saveProfileMutation.mutateAsync(),
  });

  const companyAutoSave = useAutoSaveDraft({
    enabled: canManageBranding,
    getSnapshot: () => ({ companyDraft, companyAddress, companyLogoFile: companyLogoFile?.name ?? null }),
    save: () => saveCompanyMutation.mutateAsync(),
  });

  const onProfileBlurCapture = autoSaveBlurCapture(
    () => profileAutoSave.schedule(),
    Boolean(mePerson?.id)
  );

  const uploadPhotoMutation = useMutation({
    mutationFn: (file: File) => uploadPersonPhoto(mePerson!.id, file),
    onSuccess: () => {
      setPhotoPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      queryClient.invalidateQueries({ queryKey: ["people", "me"] });
      setProfileMessage(t("account.profileImageUpdated"));
    },
    onError: (e: Error) => {
      const msg = e.message || t("account.profileImageUploadError");
      setProfileMessage(msg);
      toast({ title: t("account.profileImageUploadError"), description: msg, variant: "destructive" });
    },
  });

  function handleProfilePhotoChange(file: File | null) {
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
      setPhotoPreviewUrl(null);
    }
    if (!file) return;
    setPhotoPreviewUrl(URL.createObjectURL(file));
    if (mePerson?.id) uploadPhotoMutation.mutate(file);
  }

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  const removePhotoMutation = useMutation({
    mutationFn: () => api.delete(`/api/people/${mePerson!.id}/photo`),
    onSuccess: () => {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
        setPhotoPreviewUrl(null);
      }
      queryClient.invalidateQueries({ queryKey: ["people", "me"] });
      setProfileMessage(t("account.imageDeleted"));
    },
    onError: () => setProfileMessage(t("account.imageDeleteError")),
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
      const msg = e instanceof ApiError ? e.message : t("account.documentUpdateError");
      toast({ title: msg, variant: "destructive" });
    },
  });

  const updateDocPermissionsMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: DocumentPermissionState }) =>
      api.patch<DocumentPermissionState>(`/api/people/documents/${id}/permissions`, body),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["people", "documents", id, "permissions"] });
      toast({ title: t("account.documentPermissionsUpdated") });
      setPermissionsDoc(null);
    },
    onError: (e: Error) => {
      const msg = e instanceof ApiError ? e.message : t("account.documentPermissionsError");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh draft only when switching person
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
    if (!deletionInfo?.owners?.length) return;
    setOwnerPasswords(Object.fromEntries(deletionInfo.owners.map((o) => [o.id, ""])));
  }, [deletionInfo?.organizationName, deletionInfo?.owners]);

  useEffect(() => {
    if (!permissionState || !permissionsDoc) return;
    setPermissionDraft(
      normalizeDocumentPermissions(
        { teamIds: permissionState.teamIds ?? [], personIds: permissionState.personIds ?? [] },
        permissionOptions?.teams
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draft resets when doc id / loaded state changes
  }, [permissionState, permissionsDoc?.id, permissionOptions?.teams]);

  const expectedOrgDeletePhrase = deletionInfo ? `DELETE ${deletionInfo.organizationName}` : "";
  const ownersList = deletionInfo?.owners;
  const ownerPasswordsComplete =
    (ownersList?.length ?? 0) > 0 &&
    (ownersList ?? []).every((o) => Boolean(ownerPasswords[o.id]?.trim()));
  const canSubmitOrgDelete =
    Boolean(deletionInfo?.owners?.length) &&
    confirmPhrase.trim() === expectedOrgDeletePhrase &&
    ownerPasswordsComplete;

  async function onDeleteOrganization() {
    setError("");
    if (!deletionInfo?.owners?.length) return;
    const expected = `DELETE ${deletionInfo.organizationName}`;
    if (confirmPhrase.trim() !== expected) {
      setError(t("account.orgDeletePhraseError"));
      return;
    }
    for (const o of deletionInfo.owners) {
      if (!ownerPasswords[o.id]?.trim()) {
        setError(t("account.orgDeletePasswordMissing"));
        return;
      }
    }
    setLoading(true);
    try {
      await api.deleteWithBody<{ ok: boolean }>("/api/org", {
        confirm: expected,
        ownerPasswords: Object.fromEntries(
          deletionInfo.owners.map((o) => [o.id, ownerPasswords[o.id]!.trim()])
        ),
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
    <div className="page-shell space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-white">{t("account.title")}</h2>
        <p className="text-sm text-white/45 mt-1">{t("account.subtitle")}</p>
        {isOwner ? (
          <a
            href="#billing"
            className="inline-block mt-3 text-sm text-ordo-yellow/90 hover:text-ordo-yellow underline-offset-2 hover:underline"
          >
            Jump to billing &amp; Paddle checkout →
          </a>
        ) : null}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <div>
          <p className="text-sm font-medium text-white">{t("account.preferencesTitle")}</p>
          <p className="text-xs text-white/50 mt-1">
            {t("account.preferencesHint")}
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <UserUiLanguageSelect />
          <div className="space-y-2">
            <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.timeFormat")}</Label>
            <Select
              value={effective?.timeFormat ?? "24h"}
              disabled={isLoading || updatePrefsMutation.isPending}
              onValueChange={(value) => patchPrefs({ timeFormat: value as TimeFormat })}
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
              onValueChange={(value) => patchPrefs({ distanceUnit: value as DistanceUnit })}
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
        <div
          className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4"
          onBlurCapture={companyAutoSave.onBlurCapture}
        >
          <div>
            <p className="text-sm font-medium text-white">{t("account.companyInfoTitle")}</p>
            <p className="text-xs text-white/50 mt-1">
              {t("account.companyInfoHint")}
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.companyName")}</Label>
              <Input
                value={companyDraft.invoiceName}
                onChange={(e) => setCompanyDraft((s) => ({ ...s, invoiceName: e.target.value }))}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.companyVat")}</Label>
              <Input
                value={companyDraft.invoiceVat}
                onChange={(e) => setCompanyDraft((s) => ({ ...s, invoiceVat: e.target.value }))}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.companyAddress")}</Label>
              <AddressFields value={companyAddress} onChange={setCompanyAddress} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.companyEmail")}</Label>
              <Input
                value={companyDraft.invoiceEmail}
                onChange={(e) => setCompanyDraft((s) => ({ ...s, invoiceEmail: e.target.value }))}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.companyPhone")}</Label>
              <Input
                value={companyDraft.invoicePhone}
                onChange={(e) => setCompanyDraft((s) => ({ ...s, invoicePhone: e.target.value }))}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.companyContactPerson")}</Label>
              <Input
                value={companyDraft.invoiceContact}
                onChange={(e) => setCompanyDraft((s) => ({ ...s, invoiceContact: e.target.value }))}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.companyLogo")}</Label>
            {companyInfo?.hasCompanyLogo ? (
              <RemoteImageHoverPreview
                src={`${import.meta.env.VITE_BACKEND_URL || ""}/api/org/company-logo?ts=${companyInfo.companyLogoUpdatedAt ?? ""}`}
                alt={t("account.companyLogo")}
                triggerClassName="h-20 max-w-[240px] rounded border border-white/10 bg-white p-2 shadow-none"
                triggerImgClassName="h-full w-full max-h-[4.5rem] object-contain"
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
                  {uploadCompanyLogoMutation.isPending ? t("account.uploading") : t("account.uploadLogo")}
                </Button>
                {companyInfo?.hasCompanyLogo ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-white/10 text-white/70 bg-transparent"
                    disabled={removeCompanyLogoMutation.isPending}
                    onClick={() => removeCompanyLogoMutation.mutate()}
                  >
                    {removeCompanyLogoMutation.isPending ? t("account.removing") : t("account.removeLogo")}
                  </Button>
                ) : null}
              </div>
              {companyLogoPreviewUrl ? (
                <div className="rounded border border-white/10 bg-white/5 p-2">
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-white/40">{t("account.newLogoPreview")}</p>
                  <RemoteImageHoverPreview
                    src={companyLogoPreviewUrl}
                    alt={t("account.newLogoPreview")}
                    triggerClassName="h-20 max-w-[200px] rounded border-0 bg-transparent p-0 shadow-none"
                    triggerImgClassName="h-full w-full object-contain"
                  />
                </div>
              ) : null}
            </div>
            {companyLogoStatus ? <p className="text-xs text-white/70">{companyLogoStatus}</p> : null}
          </div>
          <AutoSaveStatus status={companyAutoSave.status} error={companyAutoSave.error} />
        </div>
      ) : null}

      {isOwner ? (
        <div id="billing" className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-white">Billing</p>
            <p className="text-xs text-white/50 mt-1">
              Manage monthly invoicing, organization billing options, and payment status.
            </p>
          </div>
          <Billing embedded />
        </div>
      ) : null}

      {canManageOrgFeatures ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-white">{t("account.orgFeaturesTitle")}</p>
            <p className="text-xs text-white/50 mt-1">
              Enable optional modules per organization. Country-specific rules can be toggled separately.
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
            <div>
              <p className="text-sm text-white">{t("account.productionPlanner")}</p>
              <p className="text-xs text-white/45">Disabled by default while Events and Tours continue.</p>
            </div>
            <Switch
              checked={productionPlannerEnabled}
              disabled={updateOrgFeaturesMutation.isPending}
              onCheckedChange={(checked) => {
                setProductionPlannerEnabled(checked);
                updateOrgFeaturesMutation.mutate(checked);
              }}
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-white/35">{t("account.countryModulesTitle")}</p>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
              <div>
                <p className="text-sm text-white">
                  {COUNTRY_FEATURE_CATALOG.DK.label}: {COUNTRY_FEATURE_CATALOG.DK.features.travelAllowance.label}
                </p>
                <p className="text-xs text-white/45">
                  {COUNTRY_FEATURE_CATALOG.DK.features.travelAllowance.description}
                </p>
              </div>
              <Switch
                checked={dkTravelAllowanceEnabled}
                disabled={updateCountryFeaturesMutation.isPending}
                onCheckedChange={(checked) => {
                  setDkTravelAllowanceEnabled(checked);
                  updateCountryFeaturesMutation.mutate({ travelAllowance: checked });
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
              <div>
                <p className="text-sm text-white">
                  {COUNTRY_FEATURE_CATALOG.DK.label}: {COUNTRY_FEATURE_CATALOG.DK.features.mileageAllowance.label}
                </p>
                <p className="text-xs text-white/45">
                  {COUNTRY_FEATURE_CATALOG.DK.features.mileageAllowance.description}
                </p>
              </div>
              <Switch
                checked={dkMileageAllowanceEnabled}
                disabled={updateCountryFeaturesMutation.isPending}
                onCheckedChange={(checked) => {
                  setDkMileageAllowanceEnabled(checked);
                  updateCountryFeaturesMutation.mutate({ mileageAllowance: checked });
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5">
              <div>
                <p className="text-sm text-white">
                  {COUNTRY_FEATURE_CATALOG.DK.label}: {COUNTRY_FEATURE_CATALOG.DK.features.leaveManagement.label}
                </p>
                <p className="text-xs text-white/45">
                  {COUNTRY_FEATURE_CATALOG.DK.features.leaveManagement.description}
                </p>
              </div>
              <Switch
                checked={dkLeaveManagementEnabled}
                disabled={updateCountryFeaturesMutation.isPending}
                onCheckedChange={(checked) => {
                  setDkLeaveManagementEnabled(checked);
                  updateCountryFeaturesMutation.mutate({ leaveManagement: checked });
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {canManageOrgFeatures && dkLeaveManagementEnabled ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-white">{t("time.leavePolicyTitle")}</p>
            <p className="text-xs text-white/50 mt-1">{t("time.leavePolicyHint")}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-white/55 text-xs">{t("time.leavePolicyVacationYearStart")} (month)</Label>
              <Input
                type="number"
                min={1}
                max={12}
                value={leavePolicyDraft.vacationYearStartMonth}
                onChange={(e) =>
                  setLeavePolicyDraft((s) => ({ ...s, vacationYearStartMonth: e.target.value }))
                }
                className="bg-white/5 border-white/10 text-white h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/55 text-xs">{t("time.leavePolicyVacationYearStart")} (day)</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={leavePolicyDraft.vacationYearStartDay}
                onChange={(e) =>
                  setLeavePolicyDraft((s) => ({ ...s, vacationYearStartDay: e.target.value }))
                }
                className="bg-white/5 border-white/10 text-white h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/55 text-xs">{t("time.leavePolicyDefaultVacation")}</Label>
              <Input
                type="number"
                min={0}
                value={leavePolicyDraft.defaultVacationDaysPerYear}
                onChange={(e) =>
                  setLeavePolicyDraft((s) => ({ ...s, defaultVacationDaysPerYear: e.target.value }))
                }
                className="bg-white/5 border-white/10 text-white h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/55 text-xs">{t("time.leavePolicyDefaultExtraVacation")}</Label>
              <Input
                type="number"
                min={0}
                value={leavePolicyDraft.defaultExtraVacationDays}
                onChange={(e) =>
                  setLeavePolicyDraft((s) => ({ ...s, defaultExtraVacationDays: e.target.value }))
                }
                className="bg-white/5 border-white/10 text-white h-8"
              />
              <p className="text-[10px] text-white/40">{t("time.leavePolicyDefaultExtraVacationHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/55 text-xs">{t("time.leavePolicyDefaultWeeklyHours")}</Label>
              <Input
                type="text"
                inputMode="decimal"
                maxLength={DURATION_HOURS_INPUT_MAX_LENGTH}
                value={leavePolicyDraft.defaultWeeklyContractHours}
                onChange={(e) =>
                  setLeavePolicyDraft((s) => ({ ...s, defaultWeeklyContractHours: e.target.value }))
                }
                placeholder="37:00"
                className={DURATION_HOURS_INPUT_CLASS}
              />
              <p className="text-[10px] text-white/40">{t("time.leaveHoursInputHint")}</p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 sm:col-span-2 lg:col-span-1">
              <Label className="text-white/55 text-xs">{t("time.leavePolicyCompFromOvertime")}</Label>
              <Switch
                checked={leavePolicyDraft.compTimeFromOvertimeEnabled}
                onCheckedChange={(checked) =>
                  setLeavePolicyDraft((s) => ({ ...s, compTimeFromOvertimeEnabled: checked }))
                }
              />
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            className="bg-white/10 hover:bg-white/15 text-white"
            disabled={saveLeavePolicyMutation.isPending}
            onClick={() => saveLeavePolicyMutation.mutate()}
          >
            {t("account.saveLeavePolicy")}
          </Button>
        </div>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-white">{t("account.myProfile")}</p>
            {mePerson ? (
              <AutoSaveStatus status={profileAutoSave.status} error={profileAutoSave.error} />
            ) : null}
          </div>
          <p className="text-xs text-white/50 mt-1">
            {t("account.myProfileHint")}
          </p>
        </div>
        {!mePerson ? (
          <p className="text-xs text-white/40">
            {t("account.noLinkedPerson")}
          </p>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-3" onBlurCapture={onProfileBlurCapture}>
              <div className="space-y-2">
                <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.name")}</Label>
                <Input
                  value={profileDraft.name}
                  onChange={(e) => setProfileDraft((s) => ({ ...s, name: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.phone")}</Label>
                <Input
                  value={profileDraft.phone}
                  onChange={(e) => setProfileDraft((s) => ({ ...s, phone: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.emergencyContactName")}</Label>
                <Input
                  value={profileDraft.emergencyContactName}
                  onChange={(e) => setProfileDraft((s) => ({ ...s, emergencyContactName: e.target.value }))}
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.emergencyContactPhone")}</Label>
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
                <p className="text-[11px] text-white/40">Uploads automatically when you choose a file.</p>
                {(photoPreviewUrl ||
                  (mePerson.hasPhoto
                    ? `${import.meta.env.VITE_BACKEND_URL || ""}/api/people/${mePerson.id}/photo?ts=${mePerson.photoUpdatedAt ?? ""}`
                    : null)) ? (
                  <RemoteImageHoverPreview
                    src={
                      photoPreviewUrl ??
                      `${import.meta.env.VITE_BACKEND_URL || ""}/api/people/${mePerson.id}/photo?ts=${mePerson.photoUpdatedAt ?? ""}`
                    }
                    alt="Profile"
                    triggerClassName="h-24 w-24 max-h-24 max-w-24 rounded-md border border-white/10 bg-black/20 p-0 shadow-none"
                    triggerImgClassName="h-full w-full object-cover"
                  />
                ) : null}
                <Input
                  type="file"
                  accept="image/*"
                  disabled={uploadPhotoMutation.isPending}
                  onChange={(e) => handleProfilePhotoChange(e.target.files?.[0] ?? null)}
                  className="bg-white/5 border-white/10 text-white file:text-white"
                />
                {uploadPhotoMutation.isPending ? (
                  <p className="text-xs text-white/45">{t("account.uploadingProfileImage")}</p>
                ) : null}
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
                    {removePhotoMutation.isPending ? t("account.deleting") : t("account.deleteImage")}
                  </Button>
                ) : null}
              </div>

              <div className="space-y-2 w-full min-w-0">
                <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.documents")}</Label>
                <div className="overflow-x-auto">
                  <div className="flex flex-wrap items-end gap-2 min-w-0">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-white/45 uppercase tracking-wide">{t("account.name")}</Label>
                      <Input
                        placeholder={t("account.documentNamePlaceholder")}
                        value={docName}
                        onChange={(e) => setDocName(e.target.value)}
                        className="w-[220px] bg-white/5 border-white/10 text-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-white/45 uppercase tracking-wide">{t("account.type")}</Label>
                      <Select value={docType} onValueChange={(v) => setDocType(v as PersonDocumentTypeKey)}>
                        <SelectTrigger className="w-[200px] h-9 bg-white/5 border-white/10 text-white text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#16161f] border-white/10 text-white max-h-64">
                          {PERSON_DOCUMENT_TYPE_OPTIONS.map((value) => (
                            <SelectItem key={value} value={value}>
                              {personDocumentTypeLabel(value)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
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
                      <span>{t("account.doesNotExpire")}</span>
                    </label>
                    <DateInputWithWeekday
                      value={docExpires}
                      disabled={docDoesNotExpire}
                      onChange={setDocExpires}
                      className="h-9 w-[170px] rounded border border-white/10 bg-white/5 px-2 py-1.5 text-white text-sm disabled:opacity-40"
                      weekdayClassName="text-sm text-white/45"
                    />
                    <div
                      className="w-[230px] rounded-md border border-dashed border-white/20 bg-white/[0.02] p-1.5"
                      onDragOver={(e) => {
                        e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const f = e.dataTransfer.files?.[0] ?? null;
                        setDocFile(f);
                        if (f && !docName.trim()) setDocName(f.name.replace(/\.[^.]+$/, ""));
                      }}
                    >
                      <Input
                        type="file"
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null;
                          setDocFile(f);
                          if (f && !docName.trim()) setDocName(f.name.replace(/\.[^.]+$/, ""));
                        }}
                        className="w-full bg-white/5 border-white/10 text-white file:text-white"
                      />
                      <p className="mt-1 text-[10px] text-white/35 text-center">Drag & drop</p>
                    </div>
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
          </>
        )}
      </div>

      <Dialog open={Boolean(permissionsDoc)} onOpenChange={(o) => { if (!o) setPermissionsDoc(null); }}>
        <DialogContent className="bg-[#16161f] border-white/10 text-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("account.documentPermissions")}</DialogTitle>
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
              {updateDocPermissionsMutation.isPending ? t("account.saving") : t("account.savePermissions")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canDeleteOrganization ? (
        <div className="rounded-xl border border-red-500/25 bg-red-950/20 p-5 space-y-4">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-red-200">{t("account.deleteTitle")}</p>
              <p className="text-xs font-medium text-red-300/90">Cannot be undone.</p>
              <p className="text-xs text-white/50 leading-relaxed">{t("account.deleteHint")}</p>
            </div>
          </div>
          {!deletionInfo ? (
            <p className="text-xs text-white/45">{t("account.deleteLoadingRequirements")}</p>
          ) : deletionInfo.owners.length === 0 ? (
            <p className="text-xs text-amber-300">{t("account.deleteNoOwners")}</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="delete-org-phrase" className="text-white/70 text-xs uppercase tracking-wide">
                  {t("account.typeConfirm", { phrase: expectedOrgDeletePhrase })}
                </Label>
                <Input
                  id="delete-org-phrase"
                  value={confirmPhrase}
                  onChange={(e) => setConfirmPhrase(e.target.value)}
                  placeholder={expectedOrgDeletePhrase}
                  autoComplete="off"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25"
                />
              </div>
              <div className="space-y-3 pt-1">
                <p className="text-xs font-medium text-white/70 uppercase tracking-wide">
                  {t("account.ownerPasswordsHeading")}
                </p>
                {deletionInfo.owners.map((o) => (
                  <div key={o.id} className="space-y-1.5">
                    <Label htmlFor={`owner-pw-${o.id}`} className="text-white/60 text-xs">
                      {t("account.ownerPasswordLabel", { email: o.email })}
                      {o.name ? (
                        <span className="text-white/35"> ({o.name})</span>
                      ) : null}
                    </Label>
                    <Input
                      id={`owner-pw-${o.id}`}
                      type="password"
                      autoComplete="current-password"
                      value={ownerPasswords[o.id] ?? ""}
                      onChange={(e) =>
                        setOwnerPasswords((prev) => ({ ...prev, [o.id]: e.target.value }))
                      }
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/25"
                    />
                  </div>
                ))}
              </div>
              {error ? <p className="text-sm text-red-400">{error}</p> : null}
              <Button
                type="button"
                variant="destructive"
                className="w-full bg-red-900 hover:bg-red-800"
                disabled={loading || !canSubmitOrgDelete}
                onClick={onDeleteOrganization}
              >
                {loading ? t("account.deleting") : t("account.deleteCta")}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
