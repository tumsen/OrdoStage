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
import { CreditsSummary, type OrgCreditsPayload } from "@/components/CreditsSummary";
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

interface Team {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

// ── Form schema ───────────────────────────────────────────────────────────────

const PRESET_ROLES = ["Tour Manager", "Actor", "Tech"] as const;

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
  /** App access: RoleDefinition id from GET /api/org/role-definitions. Required if email is set. */
  permissionGroupId: z.string().optional(),
  teamAssignments: z
    .array(
      z.object({
        teamId: z.string().optional(),
        newTeamName: z.string().optional(),
        role: z.string().optional(),
      })
    )
    .min(1, "Pick at least one team")
    .superRefine((rows, ctx) => {
      let ok = false;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r) continue;
        const hasId = Boolean(r.teamId?.trim());
        const hasNew = Boolean(r.newTeamName?.trim());
        if (hasId && hasNew) {
          ctx.addIssue({
            code: "custom",
            message: "Use either an existing team or a new name per row",
            path: ["teamAssignments", i],
          });
          continue;
        }
        if (hasId || hasNew) ok = true;
      }
      if (!ok) ctx.addIssue({ code: "custom", message: "Select or add at least one team", path: ["teamAssignments"] });
    }),
})
  .superRefine((data, ctx) => {
    if (data.email?.trim() && !data.permissionGroupId?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Select a permission group (required for app access when the person has an email).",
        path: ["permissionGroupId"],
      });
    }
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
              newTeamName: "",
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

  const [newTeamDraft, setNewTeamDraft] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [docExpires, setDocExpires] = useState("");
  const [docDoesNotExpire, setDocDoesNotExpire] = useState(false);
  const [docType, setDocType] = useState<(typeof PERSON_DOCUMENT_TYPE_OPTIONS)[number]>("other");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const canEditPersonDocs =
    canWriteOrg ||
    Boolean(
      person?.email?.trim() &&
        session?.user?.email?.toLowerCase() === person.email?.trim().toLowerCase()
    );

  const { data: personDocuments } = useQuery<PersonDocument[]>({
    queryKey: ["people", person?.id, "documents"],
    queryFn: () => api.get<PersonDocument[]>(`/api/people/${person!.id}/documents`),
    enabled: Boolean(person?.id),
  });

  useEffect(() => {
    if (!open || person || !teams?.length) return;
    const cur = form.getValues("teamAssignments");
    if (cur.length === 0) {
      form.setValue("teamAssignments", [{ teamId: teams[0].id, newTeamName: "", role: "" }]);
    }
  }, [open, person, teams, form]);

  const rolePreset = form.watch("rolePreset");

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
        teamAssignments: values.teamAssignments.map((assignment) => ({
          teamId: assignment.teamId?.trim() || undefined,
          newTeamName: assignment.newTeamName?.trim() || undefined,
          role: assignment.role?.trim() || undefined,
        })),
      };
      return person
        ? api.put(`/api/people/${person.id}`, payload)
        : api.post<Person>("/api/people", payload);
    },
    onSuccess: async (result) => {
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
      setUploadError(e.message || "Could not save person.");
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
            <Label className="text-white/50 text-xs uppercase tracking-wide">
              Permission group{form.watch("email")?.trim() ? " *" : ""}
            </Label>
            <p className="text-[10px] text-white/30 leading-snug">
              If this person has an email, you must select a group so their login works. Groups and what they can do are edited
              only under{" "}
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
            <Label className="text-white/50 text-xs uppercase tracking-wide">Teams *</Label>
            <p className="text-[11px] text-white/35">
              Pick existing teams or add a new name — we create the team if it does not exist. Optional{" "}
              <strong className="text-white/45">role in team</strong> below can differ from the default role above.
            </p>
            <div className="flex gap-2 flex-wrap">
              <Input
                value={newTeamDraft}
                onChange={(e) => setNewTeamDraft(e.target.value)}
                placeholder="New team name…"
                className="flex-1 min-w-[140px] bg-white/5 border-white/10 text-white placeholder:text-white/25 h-9 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/15 text-white/80 shrink-0"
                onClick={() => {
                  const name = newTeamDraft.trim();
                  if (!name) return;
                  const current = form.getValues("teamAssignments");
                  form.setValue(
                    "teamAssignments",
                    [...current, { newTeamName: name, teamId: "", role: "" }],
                    { shouldValidate: true }
                  );
                  setNewTeamDraft("");
                }}
              >
                Add team
              </Button>
            </div>
            {teams && teams.length > 0 ? (
              <div className="space-y-2 rounded-md border border-white/10 bg-white/[0.02] p-2">
                {teams.map((team) => {
                  const assignments = form.watch("teamAssignments");
                  const selected = assignments.some((assignment) => assignment.teamId === team.id);
                  const assignment = assignments.find((entry) => entry.teamId === team.id);
                  return (
                    <div key={team.id} className="rounded border border-white/5 px-2 py-2">
                      <label className="flex items-center gap-2 text-xs text-white/80 hover:text-white cursor-pointer">
                        <Checkbox
                          checked={selected}
                          onCheckedChange={(checked) => {
                            const current = form.getValues("teamAssignments");
                            form.setValue(
                              "teamAssignments",
                              checked
                                ? [...current, { teamId: team.id, newTeamName: "", role: "" }]
                                : current.filter((entry) => entry.teamId !== team.id),
                              { shouldValidate: true }
                            );
                          }}
                        />
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full border border-white/20"
                          style={{ backgroundColor: team.color }}
                        />
                        <span>{team.name}</span>
                      </label>
                      {selected ? (
                        <Input
                          value={assignment?.role ?? ""}
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
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-amber-300/70">
                No teams yet — use &quot;Add team&quot; with a name above, or create teams on the Team page.
              </p>
            )}
            {form.formState.errors.teamAssignments ? (
              <p className="text-red-400 text-xs">{form.formState.errors.teamAssignments.message}</p>
            ) : null}
          </div>

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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Input
                  placeholder="Document name"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  className="sm:col-span-2 bg-white/5 border-white/10 text-white placeholder:text-white/25"
                />
                <Select value={docType} onValueChange={(v) => setDocType(v as (typeof PERSON_DOCUMENT_TYPE_OPTIONS)[number])}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
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
                <div className="sm:col-span-3 space-y-2">
                  <label className="flex items-center gap-2 text-[11px] text-white/55 cursor-pointer">
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
                  <div className="space-y-1">
                    <Label className="text-white/40 text-[10px]">Expiration (optional)</Label>
                    <input
                      type="date"
                      value={docExpires}
                      disabled={docDoesNotExpire}
                      onChange={(e) => setDocExpires(e.target.value)}
                      className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-white text-xs disabled:opacity-40"
                    />
                  </div>
                </div>
                <Input
                  type="file"
                  onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                  className="sm:col-span-3 bg-white/5 border-white/10 text-white file:text-white"
                />
              </div>
              {person ? (
                <Button
                  type="button"
                  size="sm"
                  className="bg-indigo-700 hover:bg-indigo-600 text-white"
                  disabled={uploadDocMutation.isPending || !docFile}
                  onClick={() => uploadDocMutation.mutate()}
                >
                  {uploadDocMutation.isPending ? "Uploading…" : "Upload document now"}
                </Button>
              ) : (
                <p className="text-[11px] text-white/35">
                  For new people, the selected document is uploaded after you click Add Person.
                </p>
              )}
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
                      isSaving={
                        updateDocMutation.isPending && updateDocMutation.variables?.id === doc.id
                      }
                      isDeleting={deleteDocMutation.isPending && deleteDocMutation.variables === doc.id}
                      onSave={async (id, body) => {
                        await updateDocMutation.mutateAsync({ id, body });
                      }}
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

        <DialogFooter>
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
  deactivateCreditCost,
  creditsBalance,
  unlimitedCredits,
}: {
  person: Person;
  onEdit: () => void;
  onDelete: () => void;
  canEditPerson: boolean;
  canDeletePerson: boolean;
  deactivateCreditCost: number;
  creditsBalance: number;
  unlimitedCredits: boolean;
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
    if (!unlimitedCredits && creditsBalance < deactivateCreditCost) {
      toast({
        title: "Not enough credits",
        description: `Deactivating costs ${deactivateCreditCost} credits. Top up under Billing.`,
        variant: "destructive",
      });
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
        <PersonListDocumentChips items={person.documentSummaries} />
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
              {!unlimitedCredits ? (
                <p className="text-amber-200/90">
                  This action uses <strong>{deactivateCreditCost}</strong> credits from your organisation balance
                  (currently {creditsBalance}).
                </p>
              ) : (
                <p className="text-white/45">Your organisation has unlimited credits.</p>
              )}
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
              {activeMutation.isPending ? "Working…" : `Deactivate (${deactivateCreditCost} credits)`}
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

  const { data: orgCredits, isLoading: orgLoading } = useQuery({
    queryKey: ["org"],
    queryFn: () =>
      api.get<OrgCreditsPayload & { deactivatePersonCredits?: number }>("/api/org"),
  });

  const deactivateCost = orgCredits?.deactivatePersonCredits ?? 20;
  const creditBal = orgCredits?.credits ?? 0;
  const orgUnlimited = Boolean(orgCredits?.unlimitedCredits);

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
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <CreditsSummary org={orgCredits} isLoading={orgLoading} variant="compact" className="max-w-3xl" />

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
                deactivateCreditCost={deactivateCost}
                creditsBalance={creditBal}
                unlimitedCredits={orgUnlimited}
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
