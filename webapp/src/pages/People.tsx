import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { z } from "zod";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, ShieldAlert, User } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useAutoSaveForm } from "@/hooks/useAutoSaveForm";
import { useAutoSave, type AutoSaveStatus, autoSaveBlurCapture } from "@/hooks/useAutoSave";
import { AutoSaveStatus as AutoSaveIndicator } from "@/components/AutoSaveStatus";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import { cn } from "@/lib/utils";
import { BillingSummary, type OrgBillingPayload } from "@/components/BillingSummary";
import { DateInputWithWeekday } from "@/components/DateInputWithWeekday";
import {
  CircularPhotoEditor,
  normalizePhotoCrop,
  type PhotoCrop,
} from "@/components/person/CircularPhotoEditor";
import { PersonCard } from "@/components/person/PersonCard";
import {
  PERSON_DOCUMENT_TYPE_OPTIONS,
  personDocumentTypeLabel,
  type PersonDocumentTypeKey,
} from "@/lib/personDocumentTypes";
import type { Person, PersonDocument } from "../../../backend/src/types";
import { AddressFields, type Address } from "@/components/AddressFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useSession } from "@/lib/auth-client";
import { isCountryFeatureEnabled } from "@/lib/countryFeatures";
import type { OrganizationCountryFeatures } from "@/lib/countryFeatures";
import { useI18n } from "@/lib/i18n";
import type { LeaveBalanceSummary, PersonLeaveProfile } from "@/contracts/backendTypes";
import { LeaveLedgerMenu } from "@/components/time/LeaveLedgerPanel";
import { LeaveOpeningBalanceForm } from "@/components/time/LeaveOpeningBalanceForm";
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

interface Team {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

// ── Form schema ───────────────────────────────────────────────────────────────

const SOFTWARE_OWNER_EMAIL = "tumsen@gmail.com";

const PersonFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  affiliation: z.enum(["internal", "external"], {
    required_error: "Choose internal or external",
  }),
  /** Directory job title (free text). */
  role: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  addressStreet:  z.string().optional(),
  addressNumber:  z.string().optional(),
  addressZip:     z.string().optional(),
  addressCity:    z.string().optional(),
  addressState:   z.string().optional(),
  addressCountry: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  notes: z.string().optional(),
  /** Required: every person belongs to exactly one permission group. */
  permissionGroupId: z.string().min(1, "Select a permission group"),
  teamAssignments: z.array(
    z.object({
      teamId: z.string().optional(),
      role: z.string().optional(),
    })
  ),
});

type PersonFormValues = z.infer<typeof PersonFormSchema>;

type PeopleSortMode = "alphabetical" | "teams" | "internal" | "external";

function sortPeopleList(people: Person[], mode: PeopleSortMode): Person[] {
  const list = [...people];
  const teamSortKey = (p: Person) =>
    [...(p.teams ?? [])]
      .map((t) => t.name)
      .sort((a, b) => a.localeCompare(b))
      .join("\u0000") || "\uffff";

  switch (mode) {
    case "alphabetical":
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case "teams":
      return list.sort((a, b) => {
        const cmp = teamSortKey(a).localeCompare(teamSortKey(b));
        return cmp !== 0 ? cmp : a.name.localeCompare(b.name);
      });
    case "internal":
      return list.sort((a, b) => {
        const ai = a.affiliation === "internal" ? 0 : 1;
        const bi = b.affiliation === "internal" ? 0 : 1;
        if (ai !== bi) return ai - bi;
        return a.name.localeCompare(b.name);
      });
    case "external":
      return list.sort((a, b) => {
        const ae = a.affiliation === "external" ? 0 : 1;
        const be = b.affiliation === "external" ? 0 : 1;
        if (ae !== be) return ae - be;
        return a.name.localeCompare(b.name);
      });
    default:
      return list;
  }
}

function toFriendlyPeopleSaveError(message: string): string {
  const m = (message || "").trim();
  if (!m) return "Could not save person.";
  if (m.includes("Only owners can grant Admin permissions")) {
    return "Only organization owners can give someone Admin permissions.";
  }
  if (m.includes("Only owners can grant Owner permissions")) {
    return "Only organization owners can give someone Owner permissions.";
  }
  if (m.includes("Only the owner themselves can leave the Owner group")) {
    return "Only the current owner can remove their own Owner permissions.";
  }
  if (m.includes("grant owner permissions to another person before leaving")) {
    return "You must assign Owner permissions to another person before removing this owner.";
  }
  if (m.includes("Permission group is required")) {
    return "Select a permission group for this person.";
  }
  if (m.includes("Invalid permission group")) {
    return "The selected permission group no longer exists. Please pick another group.";
  }
  if (m.includes("One or more teams were not found")) {
    return "One of the selected teams was not found. Refresh and try again.";
  }
  if (m.includes("Cannot delete the last owner")) {
    return "You cannot remove the last owner. Add another owner first.";
  }
  return m;
}

const PEOPLE_SORT_OPTIONS: { mode: PeopleSortMode; labelKey: "people.sortAlphabetical" | "people.sortTeams" | "people.sortInternal" | "people.sortExternal" }[] = [
  { mode: "alphabetical", labelKey: "people.sortAlphabetical" },
  { mode: "teams", labelKey: "people.sortTeams" },
  { mode: "internal", labelKey: "people.sortInternal" },
  { mode: "external", labelKey: "people.sortExternal" },
];

async function uploadPersonPhoto(personId: string, file: File): Promise<void> {
  const baseUrl = import.meta.env.VITE_BACKEND_URL || "";
  const formData = new FormData();
  formData.append("file", file);
  const resp = await fetch(`${baseUrl}/api/people/${personId}/photo`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!resp.ok) {
    let message = "Failed to upload photo.";
    try {
      const parsed = await resp.json();
      const maybe = (parsed as { error?: { message?: string } })?.error?.message;
      if (typeof maybe === "string" && maybe.trim()) message = maybe;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
}

async function updatePersonPhotoFocus(
  personId: string,
  crop: PhotoCrop
): Promise<void> {
  await api.patch(`/api/people/${personId}/photo-focus`, {
    x: crop.x,
    y: crop.y,
    zoom: crop.zoom,
  });
}

function photoCropEqual(a: unknown, b: unknown): boolean {
  const left = a as PhotoCrop;
  const right = b as PhotoCrop;
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
}

function mergeAutoSaveStatuses(...statuses: AutoSaveStatus[]): AutoSaveStatus {
  if (statuses.includes("error")) return "error";
  if (statuses.includes("saving")) return "saving";
  if (statuses.includes("pending")) return "pending";
  if (statuses.includes("saved")) return "saved";
  return "idle";
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
  if (!resp.ok) {
    let message = "Failed to upload document.";
    try {
      const parsed = await resp.json();
      const maybe = (parsed as { error?: { message?: string } })?.error?.message;
      if (typeof maybe === "string" && maybe.trim()) message = maybe;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
}

// ── Person form dialog ────────────────────────────────────────────────────────

type RoleDefRow = { id: string; name: string; slug: string };

function PersonFormDialog({
  open,
  onOpenChange,
  person,
  onSuccess,
  onPersonUpdated,
  asPage = false,
  onCancel,
  onAutoSaveState,
}: {
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  person?: Person;
  onSuccess?: () => void;
  /** Called after a successful **edit** save (dialog stays open). */
  onPersonUpdated?: (p: Person) => void;
  /** Full-page edit layout (no dialog). Requires `person`. */
  asPage?: boolean;
  onCancel?: () => void;
  onAutoSaveState?: (state: { status: AutoSaveStatus; error: string | null }) => void;
}) {
  const documentRowHandleMap = useRef(new Map<string, PersonDocumentListRowHandle>());
  const queryClient = useQueryClient();
  const { canWrite: canWriteOrg, canAction } = usePermissions();
  const canManageContracts = canAction("time.read_all");
  const { t } = useI18n();
  const { data: session } = useSession();

  // Work contract state (separate from main form — saved independently)
  const [contractWeeklyHours, setContractWeeklyHours] = useState<string>("");
  const [contractVacationDays, setContractVacationDays] = useState<string>("");
  const [showInPayroll, setShowInPayroll] = useState(true);
  const [leaveUseOrgDefaults, setLeaveUseOrgDefaults] = useState(true);
  const [leaveExtraVacationDays, setLeaveExtraVacationDays] = useState("");
  const [leaveMonthlyHours, setLeaveMonthlyHours] = useState("");
  const [leaveAnnualHours, setLeaveAnnualHours] = useState("");
  const [leaveSickStatus, setLeaveSickStatus] = useState<"none" | "active">("none");
  const [leaveSickNote, setLeaveSickNote] = useState("");

  const { data: orgFeatures } = useQuery({
    queryKey: ["org", "features"],
    queryFn: () => api.get<{ countryFeatures?: OrganizationCountryFeatures }>("/api/org"),
    enabled: canManageContracts,
  });
  const leaveManagementEnabled = isCountryFeatureEnabled(
    orgFeatures?.countryFeatures,
    "DK",
    "leaveManagement"
  );
  const { data: teams } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Team[]>("/api/departments"),
  });

  const { data: permissionGroupRows = [] } = useQuery({
    queryKey: ["role-definitions"],
    queryFn: () => api.get<RoleDefRow[]>("/api/org/role-definitions"),
    enabled: asPage || Boolean(open),
  });
  const { data: mePerson } = useQuery<Person | null>({
    queryKey: ["people", "me"],
    queryFn: () => api.get<Person | null>("/api/people/me"),
    enabled: asPage || Boolean(open),
  });

  const form = useForm<PersonFormValues>({
    resolver: zodResolver(PersonFormSchema),
    values: person
      ? {
          name: person.name,
          affiliation: person.affiliation ?? "internal",
          role: person.role ?? "",
          permissionGroupId: person.permissionGroupId ?? "",
          email: person.email ?? "",
          phone: person.phone ?? "",
          addressStreet:  person.addressStreet  ?? "",
          addressNumber:  person.addressNumber  ?? "",
          addressZip:     person.addressZip     ?? "",
          addressCity:    person.addressCity    ?? "",
          addressState:   person.addressState   ?? "",
          addressCountry: person.addressCountry ?? "",
          emergencyContactName: person.emergencyContactName ?? "",
          emergencyContactPhone: person.emergencyContactPhone ?? "",
          notes: person.notes ?? "",
          teamAssignments:
            person.teamMemberships?.map((membership) => ({
              teamId: membership.teamId,
              role: membership.role ?? "",
            })) ?? [],
        }
      : {
          name: "",
          affiliation: "internal",
          role: "",
          permissionGroupId: "",
          email: "",
          phone: "",
          addressStreet:  "",
          addressNumber:  "",
          addressZip:     "",
          addressCity:    "",
          addressState:   "",
          addressCountry: "",
          emergencyContactName: "",
          emergencyContactPhone: "",
          notes: "",
          teamAssignments: [],
        },
  });

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoFocus, setPhotoFocus] = useState<PhotoCrop>(() =>
    normalizePhotoCrop({
      x: person?.photoFocusX ?? 50,
      y: person?.photoFocusY ?? 50,
      zoom: person?.photoZoom ?? 100,
    })
  );
  const photoCropRef = useRef(photoFocus);
  photoCropRef.current = photoFocus;
  const personIdRef = useRef(person?.id);
  personIdRef.current = person?.id;

  const photoCropAutoSave = useAutoSave({
    enabled: Boolean(person?.id),
    resetKey: person?.id,
    debounceMs: 500,
    getSnapshot: () => photoCropRef.current,
    isEqual: photoCropEqual,
    save: async () => {
      const id = personIdRef.current;
      if (!id) return;
      const crop = normalizePhotoCrop(photoCropRef.current);
      await updatePersonPhotoFocus(id, crop);
      queryClient.setQueryData<Person>(["people", id], (old) =>
        old
          ? { ...old, photoFocusX: crop.x, photoFocusY: crop.y, photoZoom: crop.zoom }
          : old
      );
      queryClient.setQueryData<Person[]>(["people"], (old) =>
        old
          ? old.map((p) =>
              p.id === id
                ? { ...p, photoFocusX: crop.x, photoFocusY: crop.y, photoZoom: crop.zoom }
                : p
            )
          : old
      );
      const updated = queryClient.getQueryData<Person>(["people", id]);
      if (updated) onPersonUpdated?.(updated);
    },
  });

  const applyPhotoCrop = useCallback(
    (crop: PhotoCrop) => {
      const normalized = normalizePhotoCrop(crop);
      setPhotoFocus(normalized);
      photoCropRef.current = normalized;
      photoCropAutoSave.schedule();
    },
    [photoCropAutoSave]
  );

  const [docFile, setDocFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [docExpires, setDocExpires] = useState("");
  const [docDoesNotExpire, setDocDoesNotExpire] = useState(false);
  const [docType, setDocType] = useState<(typeof PERSON_DOCUMENT_TYPE_OPTIONS)[number]>("other");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);
  const [permissionsDoc, setPermissionsDoc] = useState<PersonDocument | null>(null);
  const [permissionDraft, setPermissionDraft] = useState<DocumentPermissionState>({ teamIds: [], personIds: [] });

  const canEditPersonDocs =
    canWriteOrg ||
    Boolean(
      person?.email?.trim() &&
        session?.user?.email?.toLowerCase() === person.email?.trim().toLowerCase()
    );
  const isSelfPerson = Boolean(person?.id && mePerson?.id && person.id === mePerson.id);
  const isSoftwareOwner = (session?.user?.email || "").toLowerCase() === SOFTWARE_OWNER_EMAIL;

  const { data: personDocuments } = useQuery<PersonDocument[]>({
    queryKey: ["people", person?.id, "documents"],
    queryFn: () => api.get<PersonDocument[]>(`/api/people/${person!.id}/documents`),
    enabled: Boolean(person?.id),
  });

  const { data: leaveProfileData } = useQuery({
    queryKey: ["people", person?.id, "leave-profile"],
    queryFn: () =>
      api.get<{ profile: PersonLeaveProfile; leave: LeaveBalanceSummary }>(
        `/api/people/${person!.id}/leave-profile`
      ),
    enabled: Boolean(person?.id) && canManageContracts && leaveManagementEnabled,
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

  useEffect(() => {
    if (!permissionState || !permissionsDoc) return;
    setPermissionDraft(
      normalizeDocumentPermissions(
        { teamIds: permissionState.teamIds ?? [], personIds: permissionState.personIds ?? [] },
        permissionOptions?.teams
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draft aligns when permission payload / doc identity changes
  }, [permissionState, permissionsDoc?.id, permissionOptions?.teams]);

  // Sync contract fields from loaded person (after contractAutoSave is defined below)
  const syncContractFromPerson = useCallback((p: Person | undefined) => {
    const weekly = p?.weeklyContractHours != null ? String(p.weeklyContractHours) : "";
    const vacation = p?.vacationDaysPerYear != null ? String(p.vacationDaysPerYear) : "";
    setContractWeeklyHours(weekly);
    setContractVacationDays(vacation);
    setShowInPayroll(p?.showInPayroll !== false);
    return { contractWeeklyHours: weekly, contractVacationDays: vacation };
  }, []);

  useEffect(() => {
    const profile = leaveProfileData?.profile;
    if (!profile) return;
    setLeaveUseOrgDefaults(profile.useOrgDefaults);
    setLeaveExtraVacationDays(
      profile.extraVacationDaysPerYear != null ? String(profile.extraVacationDaysPerYear) : ""
    );
    setLeaveMonthlyHours(
      profile.monthlyContractHours != null ? String(profile.monthlyContractHours) : ""
    );
    setLeaveAnnualHours(
      profile.annualContractHours != null ? String(profile.annualContractHours) : ""
    );
    setLeaveSickStatus(profile.sickLeaveStatus);
    setLeaveSickNote(profile.sickLeaveNote ?? "");
  }, [leaveProfileData?.profile]);

  const watchedAssignments = form.watch("teamAssignments");
  const selectedTeamIds = new Set((watchedAssignments ?? []).map((a) => a.teamId).filter(Boolean));
  const sortedTeams = [...(teams ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  const canResendAppAccess =
    canWriteOrg && Boolean(person?.id && form.watch("email")?.trim() && form.watch("permissionGroupId")?.trim());

  const [loginEmailSentAt, setLoginEmailSentAt] = useState<string | null>(
    person?.appLoginEmailSentAt ?? null
  );

  useEffect(() => {
    setLoginEmailSentAt(person?.appLoginEmailSentAt ?? null);
  }, [person?.id, person?.appLoginEmailSentAt]);

  const sendAppLoginMutation = useMutation({
    mutationFn: () => {
      if (!person?.id) throw new Error("No person");
      return api.post<Person>(`/api/people/${person.id}/resend-app-access-email`);
    },
    onSuccess: (updated) => {
      setLoginEmailSentAt(updated.appLoginEmailSentAt ?? null);
      onPersonUpdated?.(updated);
      queryClient.setQueryData(["people", updated.id], updated);
      queryClient.invalidateQueries({ queryKey: ["people"] });
      toast({
        title: "Login email sent",
        description: "They can set a password using the link in their inbox (valid about one hour).",
      });
    },
    onError: (e: Error) => {
      toast({ title: "Could not send login email", description: e.message, variant: "destructive" });
    },
  });

  const showInPayrollMutation = useMutation({
    mutationFn: (next: boolean) => {
      if (!person?.id) throw new Error("No person");
      return api.patch<Person>(`/api/people/${person.id}/show-in-payroll`, { showInPayroll: next });
    },
    onMutate: (next) => {
      setShowInPayroll(next);
    },
    onSuccess: (updated) => {
      setShowInPayroll(updated.showInPayroll !== false);
      onPersonUpdated?.(updated);
      queryClient.setQueryData(["people", updated.id], updated);
      queryClient.invalidateQueries({ queryKey: ["people"] });
      queryClient.invalidateQueries({ queryKey: ["time-payroll-export"] });
    },
    onError: (e: Error, next) => {
      setShowInPayroll(!next);
      toast({
        title: t("time.showInPayrollSaveError"),
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const mutation = useMutation({
    mutationFn: (values: PersonFormValues) => {
      const payload = {
        name: values.name,
        affiliation: values.affiliation,
        role: values.role?.trim() || undefined,
        email: values.email || undefined,
        phone: values.phone || undefined,
        addressStreet:  values.addressStreet  || undefined,
        addressNumber:  values.addressNumber  || undefined,
        addressZip:     values.addressZip     || undefined,
        addressCity:    values.addressCity    || undefined,
        addressState:   values.addressState   || undefined,
        addressCountry: values.addressCountry || undefined,
        emergencyContactName: values.emergencyContactName || undefined,
        emergencyContactPhone: values.emergencyContactPhone || undefined,
        notes: values.notes || undefined,
        ...(values.permissionGroupId?.trim()
          ? { permissionGroupId: values.permissionGroupId.trim() }
          : {}),
        ...(canWriteOrg
          ? {
              teamAssignments: values.teamAssignments.map((assignment) => ({
                teamId: assignment.teamId?.trim() || undefined,
                role: assignment.role?.trim() || undefined,
              })),
            }
          : {}),
      };
      return person
        ? api.put(`/api/people/${person.id}`, payload)
        : api.post<Person>("/api/people", payload);
    },
    onSuccess: async (result) => {
      const personId = person?.id ?? (result as Person).id;
      if (personId && photoFile && !person) {
        await uploadPersonPhoto(personId, photoFile);
      }
      if (personId && docFile) {
        await uploadPersonDocument(
          personId,
          docFile,
          docName || docFile.name,
          docType,
          { expiresAtYmd: docExpires, doesNotExpire: docDoesNotExpire }
        );
      }
      queryClient.invalidateQueries({ queryKey: ["people", "me"] });
      if (personId && !asPage) {
        queryClient.invalidateQueries({ queryKey: ["people"] });
      }
      if (personId) {
        queryClient.invalidateQueries({ queryKey: ["people", personId, "documents"] });
      }
      setPhotoFile(null);
      setDocFile(null);
      setDocName("");
      setDocExpires("");
      setDocDoesNotExpire(false);
      setDocType("other");
      setUploadError(null);
      if (person) {
        onPersonUpdated?.(result as Person);
        if (!asPage) toast({ title: t("people.changesSaved") });
      } else {
        onOpenChange?.(false);
        form.reset();
      }
      onSuccess?.();
    },
    onError: (e: Error) => {
      const friendly = toFriendlyPeopleSaveError(e.message || "");
      setUploadError(friendly);
      if (!asPage) {
        toast({ title: "Could not save person", description: friendly, variant: "destructive" });
      }
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: (file: File) => uploadPersonPhoto(person!.id, file),
    onSuccess: async () => {
      setPhotoFile(null);
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
        setPhotoPreviewUrl(null);
      }
      const resetCrop = normalizePhotoCrop({ x: 50, y: 50, zoom: 100 });
      setPhotoFocus(resetCrop);
      photoCropRef.current = resetCrop;
      photoCropAutoSave.markSaved(resetCrop);
      const id = person!.id;
      await queryClient.invalidateQueries({ queryKey: ["people", id] });
      await queryClient.invalidateQueries({ queryKey: ["people"] });
      await queryClient.invalidateQueries({ queryKey: ["people", "me"] });
      const updated = await api.get<Person>(`/api/people/${id}`);
      queryClient.setQueryData(["people", id], updated);
      onPersonUpdated?.(updated);
    },
    onError: (e: Error) => {
      toast({
        title: "Could not upload profile image",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const removePhotoMutation = useMutation({
    mutationFn: () => api.delete(`/api/people/${person!.id}/photo`),
    onSuccess: async () => {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
        setPhotoPreviewUrl(null);
      }
      setPhotoFile(null);
      await queryClient.invalidateQueries({ queryKey: ["people"] });
      await queryClient.invalidateQueries({ queryKey: ["people", "me"] });
      if (person?.id) {
        const updated = await api.get<Person>(`/api/people/${person.id}`);
        queryClient.setQueryData(["people", person.id], updated);
        onPersonUpdated?.(updated);
      }
    },
  });

  function handleProfilePhotoChange(file: File | null) {
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
      setPhotoPreviewUrl(null);
    }
    setPhotoFile(file);
    if (!file) return;
    setPhotoPreviewUrl(URL.createObjectURL(file));
    if (person?.id) {
      uploadPhotoMutation.mutate(file);
    }
  }

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  useEffect(() => {
    setPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPhotoFile(null);
  }, [person?.id]);

  useEffect(() => {
    if (!person?.id) return;
    const crop = normalizePhotoCrop({
      x: person.photoFocusX ?? 50,
      y: person.photoFocusY ?? 50,
      zoom: person.photoZoom ?? 100,
    });
    setPhotoFocus(crop);
    photoCropRef.current = crop;
    photoCropAutoSave.markSaved(crop);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baseline crop when switching person only
  }, [person?.id]);

  const uploadDocMutation = useMutation({
    mutationFn: async () => {
      if (!person?.id || !docFile) return;
      await uploadPersonDocument(
        person.id,
        docFile,
        docName || docFile.name,
        docType,
        { expiresAtYmd: docExpires, doesNotExpire: docDoesNotExpire }
      );
    },
    onSuccess: () => {
      setDocFile(null);
      setDocName("");
      setDocExpires("");
      setDocDoesNotExpire(false);
      setDocType("other");
      if (person?.id) {
        queryClient.invalidateQueries({ queryKey: ["people", person.id, "documents"] });
      }
      queryClient.invalidateQueries({ queryKey: ["people"] });
    },
    onError: (e: Error) => setUploadError(e.message || "Could not upload document."),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => api.delete(`/api/people/documents/${docId}`),
    onSuccess: () => {
      if (person?.id) {
        queryClient.invalidateQueries({ queryKey: ["people", person.id, "documents"] });
      }
      queryClient.invalidateQueries({ queryKey: ["people"] });
    },
  });

  const updateDocMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: PersonDocumentSavePatch }) =>
      api.patch<PersonDocument>(`/api/people/documents/${id}`, body),
    onSuccess: (data, { id }) => {
      if (person?.id && data) {
        queryClient.setQueryData<PersonDocument[]>(["people", person.id, "documents"], (old) =>
          !old ? old : old.map((d) => (d.id === id ? { ...d, ...data } : d))
        );
      }
      if (person?.id) {
        queryClient.invalidateQueries({ queryKey: ["people", person.id, "documents"] });
      }
      queryClient.invalidateQueries({ queryKey: ["people"] });
    },
    onError: (e: Error) => {
      toast({
        title: e.message || "Could not update document",
        variant: "destructive",
      });
    },
  });

  const updateDocPermissionsMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: DocumentPermissionState }) =>
      api.patch<DocumentPermissionState>(`/api/people/documents/${id}/permissions`, body),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["people", "documents", id, "permissions"] });
      toast({ title: "Document permissions updated" });
      setPermissionsDoc(null);
    },
    onError: (e: Error) => {
      toast({ title: e.message || "Could not update document permissions", variant: "destructive" });
    },
  });

  async function persistPerson(values: PersonFormValues, options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;
    setUploadError(null);
    if (documentRowHandleMap.current.size > 0) {
      const handles = [...documentRowHandleMap.current.values()];
      await Promise.all(handles.map((h) => h.saveIfDirty()));
    }
    const result = (await mutation.mutateAsync(values)) as Person;
    if (person?.id) {
      queryClient.setQueryData(["people", person.id], result);
      queryClient.setQueryData<Person[]>(["people"], (old) =>
        !old ? old : old.map((p) => (p.id === person.id ? { ...p, ...result } : p))
      );
      onPersonUpdated?.(result);
      if (!silent) toast({ title: t("people.changesSaved") });
    }
  }

  async function handleSubmit(values: PersonFormValues) {
    try {
      await persistPerson(values);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save person";
      if (!asPage) {
        toast({ title: toFriendlyPeopleSaveError(msg), variant: "destructive" });
      }
      throw e;
    }
  }

  const autoSave = useAutoSaveForm({
    form,
    enabled: Boolean(person?.id),
    resetKey: person?.id,
    validate: async (values) => PersonFormSchema.safeParse(values).success,
    save: (values) => persistPerson(values, { silent: true }),
  });

  const contractAutoSave = useAutoSave({
    enabled: Boolean(person?.id) && canManageContracts,
    resetKey: person?.id ? `${person.id}-contract` : null,
    getSnapshot: () => ({
      contractWeeklyHours,
      contractVacationDays,
      leaveUseOrgDefaults,
      leaveExtraVacationDays,
      leaveMonthlyHours,
      leaveAnnualHours,
      leaveSickStatus,
      leaveSickNote,
    }),
    save: async () => {
      const personId = person?.id;
      if (!personId) return;
      const wh = contractWeeklyHours.trim() === "" ? null : parseFloat(contractWeeklyHours);
      const vd = contractVacationDays.trim() === "" ? null : parseFloat(contractVacationDays);
      if (wh !== null && Number.isNaN(wh)) throw new Error("Weekly hours must be a number");
      if (vd !== null && Number.isNaN(vd)) throw new Error("Vacation days must be a number");
      await api.patch(`/api/time/person-contract/${personId}`, {
        weeklyContractHours: wh,
        vacationDaysPerYear: vd,
      });
      if (leaveManagementEnabled) {
        const extra =
          leaveExtraVacationDays.trim() === "" ? null : parseFloat(leaveExtraVacationDays);
        const monthly = leaveMonthlyHours.trim() === "" ? null : parseFloat(leaveMonthlyHours);
        const annual = leaveAnnualHours.trim() === "" ? null : parseFloat(leaveAnnualHours);
        await api.patch(`/api/people/${personId}/leave-profile`, {
          useOrgDefaults: leaveUseOrgDefaults,
          weeklyContractHours: wh,
          vacationDaysPerYear: vd,
          extraVacationDaysPerYear: extra,
          monthlyContractHours: monthly,
          annualContractHours: annual,
          sickLeaveStatus: leaveSickStatus,
          sickLeaveNote: leaveSickNote.trim() === "" ? null : leaveSickNote.trim(),
        });
        await queryClient.invalidateQueries({ queryKey: ["people", personId, "leave-profile"] });
      }
      const updated = await api.get<Person>(`/api/people/${personId}`);
      queryClient.setQueryData(["people", personId], updated);
      onPersonUpdated?.(updated);
      await queryClient.invalidateQueries({ queryKey: ["time-people"] });
    },
  });

  useEffect(() => {
    const snapshot = syncContractFromPerson(person);
    contractAutoSave.markSaved(snapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load contract when switching person only
  }, [person?.id, syncContractFromPerson, contractAutoSave.markSaved]);

  useEffect(() => {
    if (!asPage || !onAutoSaveState) return;
    const status = mergeAutoSaveStatuses(
      autoSave.status,
      contractAutoSave.status,
      photoCropAutoSave.status
    );
    const error = autoSave.error ?? contractAutoSave.error ?? photoCropAutoSave.error;
    onAutoSaveState({ status, error });
  }, [
    asPage,
    onAutoSaveState,
    autoSave.status,
    autoSave.error,
    contractAutoSave.status,
    contractAutoSave.error,
    photoCropAutoSave.status,
    photoCropAutoSave.error,
  ]);

  const cardClass = "rounded-xl border border-white/10 bg-white/[0.03] p-5 md:p-6";
  const sectionTitle = "text-xs font-semibold uppercase tracking-wider text-white/50";

  function handleCancel() {
    if (asPage) {
      onCancel?.();
      return;
    }
    onOpenChange?.(false);
  }

  const profileImageSrc =
    photoPreviewUrl ??
    (person?.hasPhoto && person?.id
      ? `${import.meta.env.VITE_BACKEND_URL || ""}/api/people/${person.id}/photo?ts=${person.photoUpdatedAt ?? ""}`
      : null);

  const profileImageFields = (
    <>
      <p className="text-[11px] text-white/35">
        {person?.id
          ? "Uploads automatically when you choose a file."
          : t("people.photoAfterAdd")}
      </p>
      {profileImageSrc ? (
        <div className="space-y-2">
          <CircularPhotoEditor
            src={profileImageSrc}
            alt={person ? `${person.name} profile` : "Profile preview"}
            cropSeedKey={`${person?.id ?? "new"}-${person?.photoUpdatedAt ?? ""}`}
            focusX={photoFocus.x}
            focusY={photoFocus.y}
            zoom={photoFocus.zoom}
            onCropChange={person?.id ? applyPhotoCrop : undefined}
            editable
            hoverPreview
          />
          <p className="text-[10px] text-white/40">
            Drag to pan and scroll or use the zoom slider to scale. Crop saves automatically when you leave the page.
          </p>
        </div>
      ) : null}
      <Input
        type="file"
        accept="image/*"
        disabled={uploadPhotoMutation.isPending}
        onChange={(e) => handleProfilePhotoChange(e.target.files?.[0] ?? null)}
        className="bg-white/5 border-white/10 text-white file:text-white"
      />
      {uploadPhotoMutation.isPending ? (
        <p className="text-xs text-white/45">Uploading profile image…</p>
      ) : null}
      {person?.hasPhoto && person?.id ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-white/15 text-white/70"
          disabled={removePhotoMutation.isPending || uploadPhotoMutation.isPending}
          onClick={() => removePhotoMutation.mutate()}
        >
          {removePhotoMutation.isPending ? "Deleting…" : "Delete image"}
        </Button>
      ) : null}
    </>
  );

  const formFooter = (
    <div
      className={
        asPage
          ? "flex flex-wrap items-center gap-3 pt-4 border-t border-white/10"
          : "flex flex-wrap items-center justify-between gap-2 sm:justify-end"
      }
    >
      {!asPage ? (
      <div className="flex flex-wrap items-center gap-2 ml-auto">
        {!person ? (
          <Button
            type="button"
            disabled={mutation.isPending}
            onClick={() => form.handleSubmit(handleSubmit)()}
            className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
          >
            {mutation.isPending ? t("people.adding") : t("people.addPerson")}
          </Button>
        ) : (
          <AutoSaveIndicator status={autoSave.status} error={autoSave.error} />
        )}
        <Button
          type="button"
          variant="outline"
          onClick={handleCancel}
          className="border-white/10 text-white/60 hover:text-white bg-transparent"
        >
          {person ? "Close" : "Cancel"}
        </Button>
      </div>
      ) : null}
    </div>
  );

  const formBody = (
        <div
          className={asPage ? "w-full space-y-6 pb-4" : "space-y-4 py-1"}
          onBlurCapture={autoSave.onBlurCapture}
        >
          <div className={asPage ? "grid grid-cols-1 gap-5 md:grid-cols-2 md:items-start" : "contents"}>
            <div className={asPage ? `${cardClass} space-y-4 min-w-0` : "contents"}>
              {asPage ? <p className={sectionTitle}>Profile & access</p> : null}
          {/* Name + affiliation + Role */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-white/50 text-xs uppercase tracking-wide">Name *</Label>
              <Input
                {...form.register("name")}
                placeholder="Full name"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-white/30"
              />
              {form.formState.errors.name ? (
                <p className="text-red-400 text-xs">{form.formState.errors.name.message}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label className="text-white/50 text-xs uppercase tracking-wide">Internal / external *</Label>
              <Controller
                control={form.control}
                name="affiliation"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      if (person?.id) autoSave.schedule();
                    }}
                  >
                    <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#16161f] border-white/10 text-white">
                      <SelectItem value="internal">Internal</SelectItem>
                      <SelectItem value="external">External</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.affiliation ? (
                <p className="text-red-400 text-xs">{form.formState.errors.affiliation.message}</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-white/50 text-xs uppercase tracking-wide">Default role</Label>
              <p className="text-[10px] text-white/30 leading-snug">
                Job title in the directory. You can set a different <strong className="text-white/40">role per team</strong> on the
                Teams page. App access is not controlled here; use the permission group below (when the person has an email).
              </p>
              <Input
                {...form.register("role")}
                placeholder="e.g. Tour Manager, Actor, Sound Engineer…"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-white/30 mt-1"
              />
            </div>
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-white/50 text-xs uppercase tracking-wide">Email</Label>
              <Input
                {...form.register("email")}
                type="email"
                placeholder="email@example.com"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-white/30"
              />
              {form.formState.errors.email ? (
                <p className="text-red-400 text-xs">{form.formState.errors.email.message}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/50 text-xs uppercase tracking-wide">Phone</Label>
              <Input
                {...form.register("phone")}
                placeholder="+47 000 00 000"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-white/30"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-white/50 text-xs uppercase tracking-wide">Permission group *</Label>
            <p className="text-[10px] text-white/30 leading-snug">
              Every person must belong to one permission group. With an email on file, use{" "}
              <strong className="text-white/50">Send account login information</strong> when you are ready — nothing is emailed
              automatically when you add someone. Sign-in also has{" "}
              <strong className="text-white/50">Forgot password</strong> for any time. Groups and what they can do are edited only under{" "}
              <Link to="/roles" className="text-rose-300/90 hover:underline">
                Permission groups
              </Link>
              . Owner and Admin are system groups.
            </p>
            <Controller
              control={form.control}
              name="permissionGroupId"
              render={({ field }) => (
                <Select
                  value={field.value ?? ""}
                  onValueChange={(v) => {
                    field.onChange(v);
                    if (person?.id) autoSave.schedule();
                  }}
                  disabled={!canWriteOrg}
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue placeholder="Select a permission group…" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#16161f] border-white/10 text-white max-h-[min(50vh,320px)]">
                    {[...permissionGroupRows]
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                          {g.slug === "owner" || g.slug === "admin" ? ` (${g.slug})` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.permissionGroupId ? (
              <p className="text-red-400 text-xs">{form.formState.errors.permissionGroupId.message as string}</p>
            ) : null}
          </div>

          {person?.id && canResendAppAccess ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-3 space-y-2">
              <p className="text-[10px] uppercase tracking-wide text-white/40">App login invitation</p>
              <p className="text-xs text-white/55">
                {loginEmailSentAt ? (
                  <>
                    Login invitation sent{" "}
                    <span className="text-white/75">
                      {format(parseISO(loginEmailSentAt), "d MMM yyyy, HH:mm")}
                    </span>
                    .
                  </>
                ) : (
                  <span className="text-amber-200/80">Login invitation has not been sent yet.</span>
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/15 text-white/85 hover:bg-white/5 h-8"
                disabled={sendAppLoginMutation.isPending || mutation.isPending}
                onClick={() => sendAppLoginMutation.mutate()}
              >
                {sendAppLoginMutation.isPending
                  ? "Sending…"
                  : loginEmailSentAt
                    ? "Resend account login information"
                    : "Send account login information"}
              </Button>
            </div>
          ) : null}

            {asPage ? (
              <div className={`${cardClass} space-y-3`}>
                <p className={sectionTitle}>Profile image</p>
                {profileImageFields}
              </div>
            ) : null}
            </div>

            <div className={asPage ? "flex flex-col gap-5 min-w-0" : "contents"}>
              <div className={asPage ? `${cardClass} space-y-3` : "contents"}>
                {asPage ? <p className={sectionTitle}>Address</p> : null}
          {/* Address */}
          <div className={asPage ? "contents" : "space-y-1.5"}>
            {asPage ? null : (
              <Label className="text-white/50 text-xs uppercase tracking-wide">Address</Label>
            )}
            <AddressFields
              value={{
                street:  form.watch("addressStreet")  ?? "",
                number:  form.watch("addressNumber")  ?? "",
                zip:     form.watch("addressZip")     ?? "",
                city:    form.watch("addressCity")    ?? "",
                state:   form.watch("addressState")   ?? "",
                country: form.watch("addressCountry") ?? "",
              }}
              onChange={(addr: Address) => {
                form.setValue("addressStreet",  addr.street);
                form.setValue("addressNumber",  addr.number);
                form.setValue("addressZip",     addr.zip);
                form.setValue("addressCity",    addr.city);
                form.setValue("addressState",   addr.state);
                form.setValue("addressCountry", addr.country);
              }}
            />
          </div>
              </div>

              <div className={asPage ? `${cardClass} space-y-3` : "contents"}>
                {asPage ? (
                  <p className={`${sectionTitle} flex items-center gap-1.5`}>
                    <ShieldAlert size={11} className="text-amber-400/60" /> Emergency contact
                  </p>
                ) : null}
          {/* Emergency contact */}
          <div className={asPage ? "contents" : "space-y-1.5"}>
            {asPage ? null : (
              <Label className="text-white/50 text-xs uppercase tracking-wide flex items-center gap-1.5">
                <ShieldAlert size={11} className="text-amber-400/60" /> Emergency Contact
              </Label>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input
                {...form.register("emergencyContactName")}
                placeholder="Contact name"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-white/30"
              />
              <Input
                {...form.register("emergencyContactPhone")}
                placeholder="Contact phone"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-white/30"
              />
            </div>
          </div>
              </div>

              <div className={asPage ? `${cardClass} space-y-3 flex-1 flex flex-col min-h-[10rem]` : "contents"}>
                {asPage ? <p className={sectionTitle}>Notes</p> : null}
          <div className={asPage ? "contents flex-1 flex flex-col" : "space-y-1.5"}>
            {asPage ? null : (
              <Label className="text-white/50 text-xs uppercase tracking-wide">Notes</Label>
            )}
            <textarea
              {...form.register("notes")}
              placeholder="Notes about this person..."
              className={
                asPage
                  ? "min-h-[8rem] w-full flex-1 resize-y rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30"
                  : "min-h-[90px] w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30"
              }
            />
          </div>
              </div>
            </div>
          </div>

          <div className={asPage ? "grid grid-cols-1 gap-5 md:grid-cols-2 md:items-start" : "contents"}>
            <div className={asPage ? `${cardClass} space-y-2 min-w-0` : "contents"}>
              {asPage ? <p className={sectionTitle}>Teams</p> : null}
          <div className={asPage ? "contents space-y-2" : "space-y-2"}>
            {asPage ? null : (
              <Label className="text-white/50 text-xs uppercase tracking-wide">Teams</Label>
            )}
            {canWriteOrg ? (
              <>
                <p className="text-[11px] text-white/35">
                  Use "Edit teams" to check which teams this person belongs to.
                </p>
                {teams && teams.length > 0 ? (
                  <div className="space-y-2 rounded-md border border-white/10 bg-white/[0.02] p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-white/55">
                        {selectedTeamIds.size} team{selectedTeamIds.size === 1 ? "" : "s"} selected
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 border-white/15 text-white/85"
                        onClick={() => setTeamPickerOpen(true)}
                      >
                        Edit teams
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {watchedAssignments.map((assignment) => {
                        const team = (teams ?? []).find((t) => t.id === assignment.teamId);
                        if (!team) return null;
                        return (
                          <div key={team.id} className="rounded border border-white/5 px-2 py-2">
                            <div className="flex items-center gap-2 text-xs text-white/85">
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-full border border-white/20"
                                  style={{ backgroundColor: team.color }}
                                />
                                <span>{team.name}</span>
                            </div>
                            <Input
                              value={assignment.role ?? ""}
                              onChange={(e) => {
                                const current = form.getValues("teamAssignments");
                                form.setValue(
                                  "teamAssignments",
                                  current.map((entry) =>
                                    entry.teamId === team.id ? { ...entry, role: e.target.value } : entry
                                  ),
                                  { shouldValidate: true }
                                );
                              }}
                              placeholder="Role in this team (optional)"
                              className="mt-2 h-8 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-amber-300/70">
                    No teams yet — create teams on the Teams page, then add this person to them here.
                  </p>
                )}
              </>
            ) : (
              <p className="text-[11px] text-white/40">
                Team membership can only be changed by People admins.
              </p>
            )}
            {form.formState.errors.teamAssignments ? (
              <p className="text-red-400 text-xs">{form.formState.errors.teamAssignments.message}</p>
            ) : null}
          </div>
            </div>

            {asPage && person && canManageContracts ? (
              <div
                className={`${cardClass} space-y-4 min-w-0`}
                onBlurCapture={autoSaveBlurCapture(() => contractAutoSave.schedule(), true)}
              >
                <p className={sectionTitle}>
                  {leaveManagementEnabled ? t("time.leaveProfileTitle") : t("people.workContract")}
                </p>
                <p className="text-[11px] text-white/30">
                  {leaveManagementEnabled
                    ? t("time.leaveProfileHint")
                    : "Used for overtime and vacation tracking in time reports."}
                </p>
                <label className="flex items-start gap-2 text-xs text-white/55">
                  <Checkbox
                    className="mt-0.5"
                    checked={showInPayroll}
                    disabled={showInPayrollMutation.isPending}
                    onCheckedChange={(v) => showInPayrollMutation.mutate(v === true)}
                  />
                  <span>
                    <span className="block text-white/75">{t("time.showInPayroll")}</span>
                    <span className="block text-[11px] text-white/35 mt-0.5">
                      {t("time.showInPayrollHint")}
                    </span>
                  </span>
                </label>
                {leaveManagementEnabled ? (
                  <label className="flex items-center gap-2 text-xs text-white/55">
                    <Checkbox
                      checked={leaveUseOrgDefaults}
                      onCheckedChange={(v) => {
                        setLeaveUseOrgDefaults(v === true);
                        contractAutoSave.schedule();
                      }}
                    />
                    {t("time.leaveProfileUseOrgDefaults")}
                  </label>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-white/55 text-xs">Weekly hours</Label>
                    <Input
                      type="number"
                      min="0"
                      max="168"
                      step="0.5"
                      value={contractWeeklyHours}
                      onChange={(e) => setContractWeeklyHours(e.target.value)}
                      onBlur={() => contractAutoSave.schedule()}
                      placeholder="e.g. 37"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white/55 text-xs">Vacation days / year</Label>
                    <Input
                      type="number"
                      min="0"
                      max="365"
                      step="0.5"
                      value={contractVacationDays}
                      onChange={(e) => setContractVacationDays(e.target.value)}
                      onBlur={() => contractAutoSave.schedule()}
                      placeholder="e.g. 25"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-8 text-sm"
                    />
                  </div>
                </div>
                {leaveManagementEnabled ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-white/55 text-xs">{t("time.leaveProfileExtraVacation")}</Label>
                      <Input
                        type="number"
                        min="0"
                        value={leaveExtraVacationDays}
                        onChange={(e) => setLeaveExtraVacationDays(e.target.value)}
                        onBlur={() => contractAutoSave.schedule()}
                        placeholder="e.g. 5"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-8 text-sm"
                      />
                      <p className="text-[10px] text-white/40">{t("time.leaveProfileExtraVacationHint")}</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-white/55 text-xs">{t("time.leaveProfileMonthlyHours")}</Label>
                      <Input
                        type="number"
                        min="0"
                        value={leaveMonthlyHours}
                        onChange={(e) => setLeaveMonthlyHours(e.target.value)}
                        onBlur={() => contractAutoSave.schedule()}
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-white/55 text-xs">{t("time.leaveProfileAnnualHours")}</Label>
                      <Input
                        type="number"
                        min="0"
                        value={leaveAnnualHours}
                        onChange={(e) => setLeaveAnnualHours(e.target.value)}
                        onBlur={() => contractAutoSave.schedule()}
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-white/55 text-xs">{t("time.leaveProfileSickStatus")}</Label>
                      <Select
                        value={leaveSickStatus}
                        onValueChange={(v) => {
                          setLeaveSickStatus(v as "none" | "active");
                          contractAutoSave.schedule();
                        }}
                      >
                        <SelectTrigger className="h-8 bg-white/5 border-white/10 text-white text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#16161f] border-white/10 text-white">
                          <SelectItem value="none">{t("time.leaveProfileSickNone")}</SelectItem>
                          <SelectItem value="active">{t("time.leaveProfileSickActive")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : null}
                {leaveManagementEnabled && leaveProfileData?.leave ? (
                  <div className="rounded border border-white/8 bg-white/[0.02] px-3 py-2 text-xs text-white/50 space-y-1">
                    <p className="text-white/35 uppercase tracking-wide text-[10px]">{t("time.leaveBalancesTitle")}</p>
                    <p>
                      {t("time.leaveVacationRemaining")}:{" "}
                      <span
                        className={cn(
                          "tabular-nums font-medium",
                          leaveProfileData.leave.vacationRemainingDays > 0
                            ? "text-emerald-300"
                            : leaveProfileData.leave.vacationRemainingDays < 0
                              ? "text-red-300"
                              : "text-white/55"
                        )}
                      >
                        {leaveProfileData.leave.vacationRemainingDays > 0 ? "+" : leaveProfileData.leave.vacationRemainingDays < 0 ? "−" : ""}
                        {Math.abs(leaveProfileData.leave.vacationRemainingDays).toFixed(1)}d
                      </span>
                    </p>
                    <p>
                      {t("time.leaveExtraRemaining")}:{" "}
                      <span
                        className={cn(
                          "tabular-nums font-medium",
                          leaveProfileData.leave.extraVacationRemainingDays > 0
                            ? "text-emerald-300"
                            : leaveProfileData.leave.extraVacationRemainingDays < 0
                              ? "text-red-300"
                              : "text-white/55"
                        )}
                      >
                        {leaveProfileData.leave.extraVacationRemainingDays > 0 ? "+" : leaveProfileData.leave.extraVacationRemainingDays < 0 ? "−" : ""}
                        {Math.abs(leaveProfileData.leave.extraVacationRemainingDays).toFixed(1)}d
                      </span>
                    </p>
                    <p>
                      {t("time.leaveCompRemaining")}:{" "}
                      <span
                        className={cn(
                          "tabular-nums font-medium",
                          leaveProfileData.leave.compTimeRemainingMinutes > 0
                            ? "text-emerald-300"
                            : leaveProfileData.leave.compTimeRemainingMinutes < 0
                              ? "text-red-300"
                              : "text-white/55"
                        )}
                      >
                        {(() => {
                          const mins = Math.round(leaveProfileData.leave.compTimeRemainingMinutes);
                          const sign = mins > 0 ? "+" : mins < 0 ? "−" : "";
                          const abs = Math.abs(mins);
                          return `${sign}${Math.floor(abs / 60)}h ${abs % 60}m`;
                        })()}
                      </span>
                    </p>
                  </div>
                ) : null}
                {leaveManagementEnabled && leaveProfileData?.leave && person && canManageContracts ? (
                  <LeaveOpeningBalanceForm
                    personId={person.id}
                    leave={leaveProfileData.leave}
                    canEdit={canManageContracts}
                  />
                ) : null}
                {leaveManagementEnabled && person ? (
                  <LeaveLedgerMenu
                    personId={person.id}
                    vacationYearKey={leaveProfileData?.leave?.vacationYearKey}
                    leave={leaveProfileData?.leave}
                    canAdjust={canManageContracts}
                    showOpeningBalance={false}
                  />
                ) : null}
                {contractWeeklyHours && !isNaN(parseFloat(contractWeeklyHours)) ? (
                  <div className="grid grid-cols-3 gap-2 text-xs text-white/45">
                    {[
                      { label: t("people.hoursPerDay"), value: `${(parseFloat(contractWeeklyHours) / 5).toFixed(1)} h` },
                      { label: "Monthly", value: `${((parseFloat(contractWeeklyHours) * 52) / 12).toFixed(0)} h` },
                      { label: "Yearly", value: `${(parseFloat(contractWeeklyHours) * 52).toFixed(0)} h` },
                    ].map((item) => (
                      <div key={item.label} className="rounded bg-white/[0.03] border border-white/8 px-2 py-1.5 text-center">
                        <p className="text-[10px] text-white/30 uppercase tracking-wide">{item.label}</p>
                        <p className="font-semibold text-white/70 mt-0.5">{item.value}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {asPage && person && !canManageContracts ? (
              <div className="hidden md:block" aria-hidden />
            ) : null}
          </div>

          <Dialog open={teamPickerOpen} onOpenChange={setTeamPickerOpen}>
            <DialogContent className="bg-[#16161f] border-white/10 text-white max-w-lg">
              <DialogHeader>
                <DialogTitle>Select teams</DialogTitle>
              </DialogHeader>
              <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                {sortedTeams.map((team) => {
                  const checked = selectedTeamIds.has(team.id);
                  return (
                    <label
                      key={team.id}
                      className="flex items-center gap-2 rounded border border-white/10 bg-white/[0.02] px-2 py-2 cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const on = v === true;
                          const current = form.getValues("teamAssignments");
                          if (on) {
                            if (current.some((entry) => entry.teamId === team.id)) return;
                            form.setValue("teamAssignments", [...current, { teamId: team.id, role: "" }], {
                              shouldValidate: true,
                            });
                          } else {
                            form.setValue(
                              "teamAssignments",
                              current.filter((entry) => entry.teamId !== team.id),
                              { shouldValidate: true }
                            );
                          }
                        }}
                      />
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full border border-white/20"
                        style={{ backgroundColor: team.color }}
                      />
                      <span className="text-sm text-white/85">{team.name}</span>
                    </label>
                  );
                })}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/10 text-white/70 bg-transparent"
                  onClick={() => setTeamPickerOpen(false)}
                >
                  Done
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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
                      body: {
                        teamIds: permissionDraft.teamIds,
                        personIds: permissionDraft.personIds,
                      },
                    });
                  }}
                >
                  {updateDocPermissionsMutation.isPending ? "Saving…" : "Save permissions"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className={asPage ? "w-full min-w-0 space-y-3" : "contents"}>
            {asPage ? <p className={sectionTitle}>Documents</p> : null}
            <div
              className={
                asPage
                  ? `${cardClass} space-y-3 w-full min-w-0`
                  : "flex flex-col gap-4 w-full min-w-0"
              }
            >
            {!asPage ? (
            <div className="space-y-2 rounded-md border border-white/10 bg-white/[0.02] p-3 w-full max-w-md">
              <Label className="text-white/50 text-xs uppercase tracking-wide">Profile image</Label>
              {profileImageFields}
            </div>
            ) : null}

            <div className={asPage ? "contents space-y-2 w-full min-w-0" : "space-y-2 rounded-md border border-white/10 bg-white/[0.02] p-3 w-full min-w-0"}>
              {asPage ? null : (
              <Label className="text-white/50 text-xs uppercase tracking-wide">Documents</Label>
              )}
              <p className="text-[11px] text-white/35">
                Add passport, driver license, certificates, contracts, or other files.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  <Input
                    placeholder="Document name"
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    className="w-full bg-white/5 border-white/10 text-white placeholder:text-white/25"
                  />
                  <Select value={docType} onValueChange={(v) => setDocType(v as PersonDocumentTypeKey)}>
                    <SelectTrigger className="w-full bg-white/5 border-white/10 text-white">
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
                  <label className="flex items-center gap-2 sm:col-span-2 lg:col-span-1 text-[11px] text-white/55 cursor-pointer ">
                    <Checkbox
                      checked={docDoesNotExpire}
                      onCheckedChange={(v) => {
                        setDocDoesNotExpire(v === true);
                        if (v === true) setDocExpires("");
                      }}
                      className="border-white/30 data-[state=checked]:bg-violet-600"
                    />
                    <span>Does not expire</span>
                  </label>
                  <DateInputWithWeekday
                    value={docExpires}
                    disabled={docDoesNotExpire}
                    onChange={setDocExpires}
                    className="h-9 w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-white text-xs disabled:opacity-40"
                    weekdayClassName="text-sm text-white/45"
                  />
                  <div
                    className="w-full sm:col-span-2 rounded-md border border-dashed border-white/20 bg-white/[0.02] p-1.5"
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
                  {person ? (
                    <Button
                      type="button"
                      size="sm"
                      className="w-full sm:col-span-2 lg:col-span-4 bg-indigo-700 hover:bg-indigo-600 text-white"
                      disabled={uploadDocMutation.isPending || !docFile}
                      onClick={() => uploadDocMutation.mutate()}
                    >
                      {uploadDocMutation.isPending ? "Uploading…" : "Upload document"}
                    </Button>
                  ) : null}
              </div>
              {!person ? (
                <p className="text-[11px] text-white/35">
                  {t("people.documentAfterAdd")}
                </p>
              ) : null}
              {personDocuments && personDocuments.length > 0 ? (
                <div className="rounded border border-white/10">
                  {personDocuments.map((doc) => (
                    <PersonDocumentListRow
                      key={doc.id}
                      ref={(h) => {
                        if (h) documentRowHandleMap.current.set(doc.id, h);
                        else documentRowHandleMap.current.delete(doc.id);
                      }}
                      doc={doc}
                      canEdit={canEditPersonDocs}
                      canManagePermissions={isSoftwareOwner || isSelfPerson}
                      isSaving={
                        updateDocMutation.isPending && updateDocMutation.variables?.id === doc.id
                      }
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
          </div>
          {uploadError ? (
            <p className="text-red-400 text-xs">{uploadError}</p>
          ) : null}

        {/* Work contract — dialog layout only (page layout uses column in teams row) */}
        {!asPage && person && canManageContracts ? (
          <div
            className="rounded-lg border border-white/10 bg-white/[0.03] p-4 space-y-4"
            onBlurCapture={autoSaveBlurCapture(() => contractAutoSave.schedule(), true)}
          >
            <div>
              <p className={sectionTitle}>
                {leaveManagementEnabled ? t("time.leaveProfileTitle") : t("people.workContract")}
              </p>
              <p className="text-[11px] text-white/30 mt-0.5">
                {leaveManagementEnabled
                  ? t("time.leaveProfileHint")
                  : "Used for overtime and vacation tracking in time reports."}
              </p>
            </div>
            <label className="flex items-start gap-2 text-xs text-white/55">
              <Checkbox
                className="mt-0.5"
                checked={showInPayroll}
                disabled={showInPayrollMutation.isPending}
                onCheckedChange={(v) => showInPayrollMutation.mutate(v === true)}
              />
              <span>
                <span className="block text-white/75">{t("time.showInPayroll")}</span>
                <span className="block text-[11px] text-white/35 mt-0.5">
                  {t("time.showInPayrollHint")}
                </span>
              </span>
            </label>
            {leaveManagementEnabled ? (
              <label className="flex items-center gap-2 text-xs text-white/55">
                <Checkbox
                  checked={leaveUseOrgDefaults}
                  onCheckedChange={(v) => {
                    setLeaveUseOrgDefaults(v === true);
                    contractAutoSave.schedule();
                  }}
                />
                {t("time.leaveProfileUseOrgDefaults")}
              </label>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-white/55 text-xs">Weekly hours</Label>
                <Input
                  type="number"
                  min="0"
                  max="168"
                  step="0.5"
                  value={contractWeeklyHours}
                  onChange={(e) => setContractWeeklyHours(e.target.value)}
                  onBlur={() => contractAutoSave.schedule()}
                  placeholder="e.g. 37"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-white/55 text-xs">Vacation days / year</Label>
                <Input
                  type="number"
                  min="0"
                  max="365"
                  step="0.5"
                  value={contractVacationDays}
                  onChange={(e) => setContractVacationDays(e.target.value)}
                  onBlur={() => contractAutoSave.schedule()}
                  placeholder="e.g. 25"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-8 text-sm"
                />
              </div>
            </div>
            {leaveManagementEnabled ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-white/55 text-xs">{t("time.leaveProfileExtraVacation")}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={leaveExtraVacationDays}
                    onChange={(e) => setLeaveExtraVacationDays(e.target.value)}
                    onBlur={() => contractAutoSave.schedule()}
                    className="bg-white/5 border-white/10 text-white h-8 text-sm"
                  />
                  <p className="text-[10px] text-white/40">{t("time.leaveProfileExtraVacationHint")}</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/55 text-xs">{t("time.leaveProfileSickStatus")}</Label>
                  <Select
                    value={leaveSickStatus}
                    onValueChange={(v) => {
                      setLeaveSickStatus(v as "none" | "active");
                      contractAutoSave.schedule();
                    }}
                  >
                    <SelectTrigger className="h-8 bg-white/5 border-white/10 text-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#16161f] border-white/10 text-white">
                      <SelectItem value="none">{t("time.leaveProfileSickNone")}</SelectItem>
                      <SelectItem value="active">{t("time.leaveProfileSickActive")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}
            {/* Derived display */}
            {contractWeeklyHours && !isNaN(parseFloat(contractWeeklyHours)) && (
              <div className="grid grid-cols-3 gap-2 text-xs text-white/45">
                {[
                  { label: t("people.hoursPerDay"), value: `${(parseFloat(contractWeeklyHours) / 5).toFixed(1)} h` },
                  { label: "Monthly", value: `${((parseFloat(contractWeeklyHours) * 52) / 12).toFixed(0)} h` },
                  { label: "Yearly", value: `${(parseFloat(contractWeeklyHours) * 52).toFixed(0)} h` },
                ].map((item) => (
                  <div key={item.label} className="rounded bg-white/[0.03] border border-white/8 px-2 py-1.5 text-center">
                    <p className="text-[10px] text-white/30 uppercase tracking-wide">{item.label}</p>
                    <p className="font-semibold text-white/70 mt-0.5">{item.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
        </div>
  );

  if (asPage) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        {formBody}
        {formFooter}
      </div>
    );
  }

  return (
    <Dialog open={Boolean(open)} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#16161f] border-white/10 text-white w-[95vw] max-w-[1200px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{person ? t("people.editPerson") : t("people.addPerson")}</DialogTitle>
        </DialogHeader>
        {formBody}
        <DialogFooter>{formFooter}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { PersonFormDialog };

// ── Main page ─────────────────────────────────────────────────────────────────

export default function People() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<PeopleSortMode>("alphabetical");
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { canWrite } = usePermissions();

  const { data: people, isLoading, error } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<Person[]>("/api/people"),
  });

  const { data: orgInfo, isLoading: orgLoading } = useQuery<OrgBillingPayload>({
    queryKey: ["org"],
    queryFn: () => api.get<OrgBillingPayload>("/api/org"),
  });

  const sortedPeople = useMemo(
    () => sortPeopleList(people ?? [], sortMode),
    [people, sortMode]
  );

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/people/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people"] });
      setDeleteId(null);
    },
  });

  return (
    <div className="p-6 space-y-6">
      <BillingSummary org={orgInfo} isLoading={orgLoading} variant="compact" className="max-w-3xl" />

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-white/40">{t("people.pageSubtitle")}</p>
          <p className="text-xs text-white/25 mt-1">
            {t("people.pageHint")}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-2"
        >
          <Plus size={14} /> {t("people.addPerson")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span className="text-[10px] uppercase tracking-wide text-white/35">{t("people.sort")}</span>
        {PEOPLE_SORT_OPTIONS.map(({ mode, labelKey }) => (
          <label
            key={mode}
            className="flex items-center gap-2 cursor-pointer text-white/55 hover:text-white/85 select-none"
          >
            <Checkbox
              checked={sortMode === mode}
              onCheckedChange={(v) => {
                if (v === true) setSortMode(mode);
              }}
            />
            {t(labelKey)}
          </label>
        ))}
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg bg-white/5" />)}
          </div>
        ) : error ? (
          <div className="py-10 text-center text-red-400 text-sm">Failed to load people.</div>
        ) : sortedPeople.length === 0 ? (
          <div className="py-12 text-center">
            <User size={24} className="text-white/10 mx-auto mb-3" />
            <p className="text-white/30 text-sm">No contacts yet.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddOpen(true)}
              className="mt-3 border-white/10 text-white/50 hover:text-white gap-2"
            >
              <Plus size={13} /> Add first person
            </Button>
          </div>
        ) : (
          <div>
            {sortedPeople.map((person) => (
              (() => {
                const sessionEmail = session?.user?.email?.toLowerCase() ?? null;
                const personEmail = person.email?.toLowerCase() ?? null;
                const canEditPerson =
                  canWrite || Boolean(sessionEmail && personEmail && sessionEmail === personEmail);
                const canDeletePerson = canWrite;
                return (
              <PersonCard
                key={person.id}
                person={person}
                onEdit={() => navigate(`/people/${person.id}/edit`)}
                onDelete={() => setDeleteId(person.id)}
                canEditPerson={canEditPerson}
                canDeletePerson={canDeletePerson}
                canSeeDocumentSummaries={canWrite}
              />
                );
              })()
            ))}
            <div className="px-5 py-3 border-t border-white/5">
              <button
                onClick={() => setAddOpen(true)}
                className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1.5 transition-colors"
              >
                <Plus size={12} /> Add another person
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add dialog */}
      <PersonFormDialog open={addOpen} onOpenChange={setAddOpen} />

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent className="bg-[#16161f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete person?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              This will permanently delete the contact and remove them from all tours and events.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
              onClick={() => {
                if (!deleteId) return;
                if (!confirmDeleteAction("person")) return;
                deleteMutation.mutate(deleteId);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
