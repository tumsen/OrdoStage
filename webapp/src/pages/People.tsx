import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus, Edit2, Trash2, Phone, Mail, MapPin, ShieldAlert, User,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import { BillingSummary, type OrgBillingPayload } from "@/components/BillingSummary";
import { DateInputWithWeekday } from "@/components/DateInputWithWeekday";
import type { Person, PersonDocument } from "../../../backend/src/types";
import { AddressFields, appleMapsUrl, formatAddress, googleMapsUrl, type Address } from "@/components/AddressFields";
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

const PRESET_ROLES = ["Tour Manager", "Actor", "Tech"] as const;
const SOFTWARE_OWNER_EMAIL = "tumsen@gmail.com";

const PersonFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  affiliation: z.enum(["internal", "external"], {
    required_error: "Choose internal or external",
  }),
  rolePreset: z.string().optional(),
  roleCustom: z.string().optional(),
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

function resolveRole(values: PersonFormValues): string | undefined {
  if (!values.rolePreset || values.rolePreset === "") return undefined;
  if (values.rolePreset === "other") return values.roleCustom || undefined;
  return values.rolePreset;
}

function roleToFormValues(role: string | null): { rolePreset: string; roleCustom: string } {
  if (!role) return { rolePreset: "", roleCustom: "" };
  if ((PRESET_ROLES as readonly string[]).includes(role)) return { rolePreset: role, roleCustom: "" };
  return { rolePreset: "other", roleCustom: role };
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

// ── Role badge ────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  "Tour Manager": "bg-purple-900/40 text-purple-300 border-purple-700/30",
  "Actor": "bg-red-900/40 text-red-300 border-red-700/30",
  "Tech": "bg-blue-900/40 text-blue-300 border-blue-700/30",
};

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return <span className="text-white/25 text-xs">—</span>;
  const cls = ROLE_COLORS[role] ?? "bg-white/5 text-white/50 border-white/10";
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      {role}
    </span>
  );
}

function AffiliationBadge({ affiliation }: { affiliation: Person["affiliation"] }) {
  const internal = affiliation === "internal";
  return (
    <span
      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
        internal
          ? "bg-emerald-950/50 text-emerald-300/90 border-emerald-700/25"
          : "bg-amber-950/40 text-amber-200/85 border-amber-700/25"
      }`}
    >
      {internal ? "Internal" : "External"}
    </span>
  );
}

function formatDocumentTypeForList(t: string | undefined) {
  if (!t) return "";
  return t.replace(/_/g, " ");
}

/** Compact document cards for the people list (smaller than role / affiliation). */
function PersonListDocumentChips({ items }: { items: Person["documentSummaries"] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-2 pt-2 border-t border-white/[0.06] w-full min-w-0">
      <p className="text-[9px] uppercase tracking-wide text-white/30 mb-1">Documents</p>
      <div className="flex flex-wrap gap-1">
        {items.map((d, i) => {
          const typeLabel = formatDocumentTypeForList("type" in d ? d.type : undefined);
          const typeSeg = typeLabel ? `${typeLabel} · ` : "";
          if ("forever" in d && d.forever) {
            return (
              <div
                key={`${d.name}-${i}`}
                className="inline-flex flex-col max-w-full rounded border border-violet-500/40 bg-violet-950/35 px-1.5 py-0.5"
                title={`${d.name} — does not expire`}
              >
                <span className="text-[9px] font-medium text-violet-100/95 leading-tight truncate">
                  {d.name}
                </span>
                <span className="text-[8px] text-white/45 leading-tight">
                  {typeSeg}∞
                </span>
              </div>
            );
          }
          if ("noExpiry" in d && d.noExpiry) {
            return (
              <div
                key={`${d.name}-${i}`}
                className="inline-flex flex-col max-w-full rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5"
                title={`${d.name} — no date set`}
              >
                <span className="text-[9px] font-medium text-white/75 leading-tight truncate">
                  {d.name}
                </span>
                <span className="text-[8px] text-white/35 leading-tight">
                  {typeSeg}No date
                </span>
              </div>
            );
          }
          if ("expired" in d && d.expired) {
            return (
              <div
                key={`${d.name}-${i}`}
                className="inline-flex flex-col max-w-full rounded border border-red-500/45 bg-red-950/30 px-1.5 py-0.5"
                title={`${d.name} — expired (${d.daysLeft < 0 ? `${-d.daysLeft}d ago` : "last day"})`}
              >
                <span className="text-[9px] font-medium text-red-100/90 leading-tight truncate">
                  {d.name}
                </span>
                <span className="text-[8px] text-red-200/50 leading-tight">
                  {typeSeg}Expired
                </span>
              </div>
            );
          }
          if ("daysLeft" in d) {
            return (
              <div
                key={`${d.name}-${i}`}
                className="inline-flex flex-col max-w-full rounded border border-emerald-500/40 bg-emerald-950/25 px-1.5 py-0.5"
                title={`${d.name} — ${d.daysLeft === 0 ? "last day" : `${d.daysLeft}d left`}`}
              >
                <span className="text-[9px] font-medium text-emerald-100/90 leading-tight truncate">
                  {d.name}
                </span>
                <span className="text-[8px] text-emerald-200/50 leading-tight">
                  {typeSeg}
                  {d.daysLeft === 0 ? "Last day" : `${d.daysLeft}d left`}
                </span>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

const PEOPLE_SORT_OPTIONS: { mode: PeopleSortMode; label: string }[] = [
  { mode: "alphabetical", label: "Alphabetically" },
  { mode: "teams", label: "Teams" },
  { mode: "internal", label: "Internal" },
  { mode: "external", label: "External" },
];

const PERSON_DOCUMENT_TYPE_OPTIONS = [
  "passport",
  "driver_license",
  "certificate",
  "visa",
  "contract",
  "medical",
  "other",
] as const;

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
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  person?: Person;
  onSuccess?: () => void;
  /** Called after a successful **edit** save (dialog stays open). */
  onPersonUpdated?: (p: Person) => void;
}) {
  const documentRowHandleMap = useRef(new Map<string, PersonDocumentListRowHandle>());
  const queryClient = useQueryClient();
  const { canWrite: canWriteOrg } = usePermissions();
  const { data: session } = useSession();
  const { data: teams } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Team[]>("/api/departments"),
  });

  const { data: permissionGroupRows = [] } = useQuery({
    queryKey: ["role-definitions"],
    queryFn: () => api.get<RoleDefRow[]>("/api/org/role-definitions"),
    enabled: open,
  });
  const { data: mePerson } = useQuery<Person | null>({
    queryKey: ["people", "me"],
    queryFn: () => api.get<Person | null>("/api/people/me"),
    enabled: open,
  });

  const { rolePreset: defaultPreset, roleCustom: defaultCustom } = useMemo(
    () => roleToFormValues(person?.role ?? null),
    [person?.role]
  );

  const form = useForm<PersonFormValues>({
    resolver: zodResolver(PersonFormSchema),
    values: person
      ? {
          name: person.name,
          affiliation: person.affiliation ?? "internal",
          rolePreset: defaultPreset,
          roleCustom: defaultCustom,
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
          rolePreset: "",
          roleCustom: "",
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
  }, [permissionState, permissionsDoc?.id, permissionOptions?.teams]);

  const rolePreset = form.watch("rolePreset");
  const watchedAssignments = form.watch("teamAssignments");
  const selectedTeamIds = new Set((watchedAssignments ?? []).map((a) => a.teamId).filter(Boolean));
  const sortedTeams = [...(teams ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  const canResendAppAccess =
    canWriteOrg && Boolean(person?.id && form.watch("email")?.trim() && form.watch("permissionGroupId")?.trim());

  const resendAppAccessMutation = useMutation({
    mutationFn: () => {
      if (!person?.id) throw new Error("No person");
      return api.post<{ accountSetupEmail: { status: "sent"; createdUser?: boolean } }>(
        `/api/people/${person.id}/resend-app-access-email`
      );
    },
    onSuccess: () => {
      toast({ title: "Login email sent", description: "They can set a password using the link we sent." });
    },
    onError: (e: Error) => {
      toast({ title: "Could not resend email", description: e.message, variant: "destructive" });
    },
  });

  const mutation = useMutation({
    mutationFn: (values: PersonFormValues) => {
      const payload = {
        name: values.name,
        affiliation: values.affiliation,
        role: resolveRole(values),
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
      const saved = result as Person & { accountSetupEmail?: { status: string; error?: string } };
      if (saved.accountSetupEmail?.status === "sent") {
        toast({ title: "Login email sent", description: "They can set a password from the link in their inbox (valid about one hour)." });
      } else if (saved.accountSetupEmail?.status === "failed") {
        toast({
          title: "Account saved, but the login email failed to send",
          description: saved.accountSetupEmail.error ?? "Try resend or check that email and Resend are configured.",
          variant: "destructive",
        });
      }
      const personId = person?.id ?? (result as Person).id;
      if (personId && photoFile) {
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
      queryClient.invalidateQueries({ queryKey: ["people"] });
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
        toast({ title: "Changes saved" });
      } else {
        onOpenChange(false);
        form.reset();
      }
      onSuccess?.();
    },
    onError: (e: Error) => {
      const friendly = toFriendlyPeopleSaveError(e.message || "");
      setUploadError(friendly);
      toast({ title: "Could not save person", description: friendly, variant: "destructive" });
    },
  });

  const removePhotoMutation = useMutation({
    mutationFn: () => api.delete(`/api/people/${person!.id}/photo`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people"] });
    },
  });

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

  async function handleSubmit(values: PersonFormValues) {
    setUploadError(null);
    if (documentRowHandleMap.current.size > 0) {
      const handles = [...documentRowHandleMap.current.values()];
      try {
        await Promise.all(handles.map((h) => h.saveIfDirty()));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not update document(s)";
        toast({ title: msg, variant: "destructive" });
        return;
      }
    }
    mutation.mutate(values);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#16161f] border-white/10 text-white w-[95vw] max-w-[1200px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{person ? "Edit Person" : "Add Person"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
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
                  <Select value={field.value} onValueChange={field.onChange}>
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
                Team page. App access is not controlled here; use the permission group below (when the person has an email).
              </p>
              <Controller
                control={form.control}
                name="rolePreset"
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white mt-1">
                      <SelectValue placeholder="Select default role…" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#16161f] border-white/10 text-white">
                      {PRESET_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                      <SelectItem value="other">Other...</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Custom role input */}
          {rolePreset === "other" ? (
            <div className="space-y-1.5">
              <Label className="text-white/50 text-xs uppercase tracking-wide">Custom default role</Label>
              <Input
                {...form.register("roleCustom")}
                placeholder="e.g. Sound Engineer, Driver..."
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-white/30"
              />
            </div>
          ) : null}

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
              Every person must belong to one permission group. If they have an email, we send a
              <strong className="text-white/50"> one-time link to set a password</strong> when you add them, or you can resend
              it when editing. Sign-in also has <strong className="text-white/50">Forgot password</strong> for any time. Groups
              and what they can do are edited only under{" "}
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
                  onValueChange={field.onChange}
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

          {/* Address */}
          <div className="space-y-1.5">
            <Label className="text-white/50 text-xs uppercase tracking-wide">Address</Label>
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

          {/* Emergency contact */}
          <div className="space-y-1.5">
            <Label className="text-white/50 text-xs uppercase tracking-wide flex items-center gap-1.5">
              <ShieldAlert size={11} className="text-amber-400/60" /> Emergency Contact
            </Label>
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

          <div className="space-y-1.5">
            <Label className="text-white/50 text-xs uppercase tracking-wide">Notes</Label>
            <textarea
              {...form.register("notes")}
              placeholder="Notes about this person..."
              className="min-h-[90px] w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/30"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white/50 text-xs uppercase tracking-wide">Teams</Label>
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
                    No teams yet — create teams on the Team page, then add this person to them here.
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

          <div className="flex flex-col gap-4 w-full min-w-0">
            <div className="space-y-2 rounded-md border border-white/10 bg-white/[0.02] p-3 w-full max-w-md">
              <Label className="text-white/50 text-xs uppercase tracking-wide">Profile image</Label>
              <p className="text-[11px] text-white/35">
                Upload a profile image (jpg/png/webp). For new people, the image is uploaded right after you click Add Person.
              </p>
              {person?.hasPhoto ? (
                <img
                  src={`${import.meta.env.VITE_BACKEND_URL || ""}/api/people/${person.id}/photo?ts=${person.photoUpdatedAt ?? ""}`}
                  alt={`${person.name} profile`}
                  className="h-24 w-24 rounded-md object-cover border border-white/10"
                />
              ) : null}
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
                className="bg-white/5 border-white/10 text-white file:text-white"
              />
              {person?.hasPhoto ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-white/15 text-white/70"
                  disabled={removePhotoMutation.isPending}
                  onClick={() => removePhotoMutation.mutate()}
                >
                  {removePhotoMutation.isPending ? "Deleting…" : "Delete image"}
                </Button>
              ) : null}
            </div>

            <div className="space-y-2 rounded-md border border-white/10 bg-white/[0.02] p-3 w-full min-w-0">
              <Label className="text-white/50 text-xs uppercase tracking-wide">Documents</Label>
              <p className="text-[11px] text-white/35">
                Add passport, driver license, certificates, contracts, or other files.
              </p>
              <div className="overflow-x-auto">
                <div className="flex items-center gap-2 min-w-[980px]">
                  <Input
                    placeholder="Document name"
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    className="w-[220px] bg-white/5 border-white/10 text-white placeholder:text-white/25"
                  />
                  <Select value={docType} onValueChange={(v) => setDocType(v as (typeof PERSON_DOCUMENT_TYPE_OPTIONS)[number])}>
                    <SelectTrigger className="w-[170px] bg-white/5 border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#16161f] border-white/10 text-white">
                      {PERSON_DOCUMENT_TYPE_OPTIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {value.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2 text-[11px] text-white/55 cursor-pointer whitespace-nowrap">
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
                    className="h-9 w-[170px] rounded border border-white/10 bg-white/5 px-2 py-1.5 text-white text-xs disabled:opacity-40"
                    weekdayClassName="text-[10px] text-white/45"
                  />
                  <Input
                    type="file"
                    onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                    className="w-[230px] bg-white/5 border-white/10 text-white file:text-white"
                  />
                  {person ? (
                    <Button
                      type="button"
                      size="sm"
                      className="ml-auto bg-indigo-700 hover:bg-indigo-600 text-white whitespace-nowrap"
                      disabled={uploadDocMutation.isPending || !docFile}
                      onClick={() => uploadDocMutation.mutate()}
                    >
                      {uploadDocMutation.isPending ? "Uploading…" : "Upload document"}
                    </Button>
                  ) : null}
                </div>
              </div>
              {!person ? (
                <p className="text-[11px] text-white/35">
                  For new people, the selected document is uploaded after you click Add Person.
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
          {uploadError ? (
            <p className="text-red-400 text-xs">{uploadError}</p>
          ) : null}
        </div>

        <DialogFooter className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
          {canResendAppAccess ? (
            <Button
              type="button"
              variant="outline"
              className="border-white/10 text-white/80 hover:text-white bg-transparent mr-auto"
              disabled={resendAppAccessMutation.isPending || mutation.isPending}
              onClick={() => resendAppAccessMutation.mutate()}
            >
              {resendAppAccessMutation.isPending ? "Sending…" : "Resend login email"}
            </Button>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-white/10 text-white/60 hover:text-white bg-transparent"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={mutation.isPending}
              onClick={form.handleSubmit(handleSubmit)}
              className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
            >
              {mutation.isPending ? "Saving..." : person ? "Save Changes" : "Add Person"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Person card (list item) ───────────────────────────────────────────────────

function PersonCard({
  person,
  onEdit,
  onDelete,
  canEditPerson,
  canDeletePerson,
  canSeeDocumentSummaries,
}: {
  person: Person;
  onEdit: () => void;
  onDelete: () => void;
  canEditPerson: boolean;
  canDeletePerson: boolean;
  canSeeDocumentSummaries: boolean;
}) {
  const queryClient = useQueryClient();
  const { canWrite } = usePermissions();
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const activeMutation = useMutation({
    mutationFn: (nextActive: boolean) =>
      api.patch(`/api/people/${person.id}/active`, { active: nextActive }),
    onSuccess: (_, nextActive) => {
      queryClient.invalidateQueries({ queryKey: ["people"] });
      queryClient.invalidateQueries({ queryKey: ["org"] });
      setDeactivateOpen(false);
      toast({
        title: nextActive ? "Person activated" : "Person deactivated",
      });
    },
    onError: (e: Error) => {
      toast({
        title: e.message || "Could not update status",
        variant: "destructive",
      });
    },
  });

  const isActive = person.isActive !== false;

  function onActiveSwitch(checked: boolean) {
    if (!canWrite) return;
    if (checked) {
      activeMutation.mutate(true);
      return;
    }
    setDeactivateOpen(true);
  }

  return (
    <div
      className={`flex items-start gap-4 px-5 py-4 border-b border-white/5 group hover:bg-white/[0.02] transition-colors ${
        !isActive ? "opacity-70" : ""
      }`}
    >
      {/* Avatar */}
      <div className="w-14 h-14 rounded-full overflow-hidden bg-white/[0.06] border border-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        {person.hasPhoto ? (
          <img
            src={`${import.meta.env.VITE_BACKEND_URL || ""}/api/people/${person.id}/photo?ts=${person.photoUpdatedAt ?? ""}`}
            alt={person.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <User size={21} className="text-white/30" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-white/90">{person.name}</span>
          <AffiliationBadge affiliation={person.affiliation ?? "internal"} />
          <RoleBadge role={person.role} />
          {!isActive ? (
            <span className="text-[10px] uppercase tracking-wide text-white/35 border border-white/10 rounded px-1.5 py-0">
              Inactive
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
          {person.teams && person.teams.length > 0 ? (
            <span className="text-xs text-white/35">
              Teams: {person.teams.map((team) => {
                const membership = person.teamMemberships?.find((entry) => entry.teamId === team.id);
                return membership?.role ? `${team.name} (${membership.role})` : team.name;
              }).join(", ")}
            </span>
          ) : null}
          {person.email ? (
            <a href={`mailto:${person.email}`} className="text-xs text-white/40 hover:text-blue-400 flex items-center gap-1 transition-colors">
              <Mail size={10} />{person.email}
            </a>
          ) : null}
          {person.phone ? (
            <a href={`tel:${person.phone}`} className="text-xs text-white/40 hover:text-blue-400 flex items-center gap-1 transition-colors">
              <Phone size={10} />{person.phone}
            </a>
          ) : null}
          {(person.addressStreet || person.addressCity || person.addressCountry) ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/30">
              <span className="flex items-center gap-1">
                <MapPin size={10} />
                {formatAddress({
                  street: person.addressStreet,
                  number: person.addressNumber,
                  zip: person.addressZip,
                  city: person.addressCity,
                  state: person.addressState,
                  country: person.addressCountry,
                })}
              </span>
              <a
                href={googleMapsUrl({
                  street: person.addressStreet,
                  number: person.addressNumber,
                  zip: person.addressZip,
                  city: person.addressCity,
                  state: person.addressState,
                  country: person.addressCountry,
                })}
                target="_blank"
                rel="noreferrer"
                className="text-blue-300 hover:text-blue-200"
              >
                Google Maps
              </a>
              <a
                href={appleMapsUrl({
                  street: person.addressStreet,
                  number: person.addressNumber,
                  zip: person.addressZip,
                  city: person.addressCity,
                  state: person.addressState,
                  country: person.addressCountry,
                })}
                target="_blank"
                rel="noreferrer"
                className="text-blue-300 hover:text-blue-200"
              >
                Apple Maps
              </a>
            </div>
          ) : null}
        </div>
        {(person.emergencyContactName || person.emergencyContactPhone) ? (
          <div className="mt-1 text-xs text-white/25 flex items-center gap-1.5">
            <ShieldAlert size={10} className="text-amber-400/40" />
            Emergency: {[person.emergencyContactName, person.emergencyContactPhone].filter(Boolean).join(" · ")}
          </div>
        ) : null}
        {person.notes ? (
          <div className="mt-1 text-xs text-white/35 line-clamp-2">
            Notes: {person.notes}
          </div>
        ) : null}
        {canSeeDocumentSummaries ? <PersonListDocumentChips items={person.documentSummaries} /> : null}
      </div>

      {/* Active + actions */}
      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/35 uppercase tracking-wide hidden sm:inline">Active</span>
          <Switch
            checked={isActive}
            disabled={!canWrite || activeMutation.isPending}
            onCheckedChange={onActiveSwitch}
            aria-label={isActive ? "Deactivate person" : "Activate person"}
          />
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canEditPerson ? (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/30 hover:text-white" onClick={onEdit}>
              <Edit2 size={13} />
            </Button>
          ) : null}
          {canDeletePerson ? (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/30 hover:text-red-400" onClick={onDelete}>
              <Trash2 size={13} />
            </Button>
          ) : null}
        </div>
      </div>

      <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <AlertDialogContent className="bg-[#16161f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {person.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50 space-y-2">
              <p>
                Inactive contacts stay in your directory but are marked inactive. Reactivating is free.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50"
              disabled={activeMutation.isPending}
              onClick={() => activeMutation.mutate(false)}
            >
              {activeMutation.isPending ? "Working…" : "Deactivate"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function People() {
  const [addOpen, setAddOpen] = useState(false);
  const [editPerson, setEditPerson] = useState<Person | null>(null);
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
          <p className="text-sm text-white/40">Cast, crew and contacts.</p>
          <p className="text-xs text-white/25 mt-1">
            To invite someone to log in and use the app, use{" "}
            <Link to="/team" className="text-white/45 hover:text-white/70 underline underline-offset-2">
              Team
            </Link>
            .
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-2"
        >
          <Plus size={14} /> Add Person
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span className="text-[10px] uppercase tracking-wide text-white/35">Sort</span>
        {PEOPLE_SORT_OPTIONS.map(({ mode, label }) => (
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
            {label}
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
                onEdit={() => setEditPerson(person)}
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

      {/* Edit dialog */}
      {editPerson ? (
        <PersonFormDialog
          open={!!editPerson}
          onOpenChange={(v) => { if (!v) setEditPerson(null); }}
          person={editPerson}
          onPersonUpdated={setEditPerson}
        />
      ) : null}

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
