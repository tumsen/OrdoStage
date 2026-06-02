import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { z } from "zod";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus, Edit2, Trash2, Phone, Mail, MapPin, ShieldAlert, User,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { usePermissions } from "@/hooks/usePermissions";
import { useAutoSaveForm } from "@/hooks/useAutoSaveForm";
import { useAutoSave, type AutoSaveStatus, autoSaveBlurCapture } from "@/hooks/useAutoSave";
import { AutoSaveStatus as AutoSaveIndicator } from "@/components/AutoSaveStatus";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import { BillingSummary, type OrgBillingPayload } from "@/components/BillingSummary";
import { DateInputWithWeekday } from "@/components/DateInputWithWeekday";
import {
  PERSON_DOCUMENT_TYPE_OPTIONS,
  personDocumentTypeLabel,
  type PersonDocumentTypeKey,
} from "@/lib/personDocumentTypes";
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

type PhotoCrop = { x: number; y: number; zoom: number };

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

function clampFocus(v: number): number {
  if (!Number.isFinite(v)) return 50;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function clampZoom(v: number): number {
  if (!Number.isFinite(v)) return 100;
  return Math.max(100, Math.min(400, Math.round(v)));
}

function normalizePhotoCrop(crop: Partial<PhotoCrop>): PhotoCrop {
  return {
    x: clampFocus(crop.x ?? 50),
    y: clampFocus(crop.y ?? 50),
    zoom: clampZoom(crop.zoom ?? 100),
  };
}

function photoCropLayout(
  containerW: number,
  containerH: number,
  naturalW: number,
  naturalH: number,
  crop: PhotoCrop
) {
  const cw = Math.max(1, containerW);
  const ch = Math.max(1, containerH);
  const nw = Math.max(1, naturalW);
  const nh = Math.max(1, naturalH);
  const coverScale = Math.max(cw / nw, ch / nh);
  const zoomFactor = crop.zoom / 100;
  const displayW = nw * coverScale * zoomFactor;
  const displayH = nh * coverScale * zoomFactor;
  const maxPanX = Math.max(0, (displayW - cw) / 2);
  const maxPanY = Math.max(0, (displayH - ch) / 2);
  const panX = ((crop.x - 50) / 50) * maxPanX;
  const panY = ((crop.y - 50) / 50) * maxPanY;
  return { displayW, displayH, panX, panY, maxPanX, maxPanY };
}

function focusFromPan(pan: number, maxPan: number): number {
  if (maxPan <= 0) return 50;
  return clampFocus(50 + (pan / maxPan) * 50);
}

function CircularPhotoEditor({
  src,
  alt,
  focusX,
  focusY,
  zoom,
  onCropChange,
  editable = true,
  sizeClassName = "h-32 w-32",
}: {
  src: string;
  alt: string;
  focusX: number;
  focusY: number;
  zoom: number;
  onCropChange?: (crop: PhotoCrop) => void;
  editable?: boolean;
  sizeClassName?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 128, h: 128 });
  const [localCrop, setLocalCrop] = useState<PhotoCrop>(() =>
    normalizePhotoCrop({ x: focusX, y: focusY, zoom })
  );
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    maxPanX: number;
    maxPanY: number;
    zoom: number;
  } | null>(null);

  useEffect(() => {
    setLocalCrop(normalizePhotoCrop({ x: focusX, y: focusY, zoom }));
  }, [focusX, focusY, zoom]);

  useEffect(() => {
    setNaturalSize(null);
  }, [src]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({ w: rect.width, h: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const layout =
    naturalSize != null
      ? photoCropLayout(
          containerSize.w,
          containerSize.h,
          naturalSize.w,
          naturalSize.h,
          localCrop
        )
      : null;

  const cropFromDrag = (
    clientX: number,
    clientY: number,
    start: NonNullable<typeof dragRef.current>
  ): PhotoCrop => {
    const deltaX = clientX - start.startX;
    const deltaY = clientY - start.startY;
    const panX = Math.max(-start.maxPanX, Math.min(start.maxPanX, start.startPanX + deltaX));
    const panY = Math.max(-start.maxPanY, Math.min(start.maxPanY, start.startPanY + deltaY));
    return {
      x: focusFromPan(panX, start.maxPanX),
      y: focusFromPan(panY, start.maxPanY),
      zoom: start.zoom,
    };
  };

  const commitCrop = (crop: PhotoCrop) => {
    const normalized = normalizePhotoCrop(crop);
    setLocalCrop(normalized);
    onCropChange?.(normalized);
  };

  const viewport = (
    <div
      ref={containerRef}
      className={`${sizeClassName} relative overflow-hidden rounded-full border border-white/15 bg-black/20 ${
        editable ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""
      }`}
      style={{ touchAction: editable ? "none" : undefined }}
      onPointerDown={(e) => {
        if (!editable || !layout) return;
        e.preventDefault();
        dragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          startPanX: layout.panX,
          startPanY: layout.panY,
          maxPanX: layout.maxPanX,
          maxPanY: layout.maxPanY,
          zoom: localCrop.zoom,
        };
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging || !dragRef.current) return;
        setLocalCrop(cropFromDrag(e.clientX, e.clientY, dragRef.current));
      }}
      onPointerUp={(e) => {
        if (!dragging) return;
        const final = dragRef.current
          ? cropFromDrag(e.clientX, e.clientY, dragRef.current)
          : localCrop;
        dragRef.current = null;
        setDragging(false);
        commitCrop(final);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
      }}
      onPointerCancel={(e) => {
        if (!dragging) return;
        const final = dragRef.current
          ? cropFromDrag(e.clientX, e.clientY, dragRef.current)
          : localCrop;
        dragRef.current = null;
        setDragging(false);
        commitCrop(final);
      }}
      onWheel={(e) => {
        if (!editable) return;
        e.preventDefault();
        const nextZoom = clampZoom(localCrop.zoom + (e.deltaY < 0 ? 8 : -8));
        const next = normalizePhotoCrop({ ...localCrop, zoom: nextZoom });
        setLocalCrop(next);
        commitCrop(next);
      }}
      title={
        editable
          ? "Drag to pan; scroll or use slider to zoom"
          : undefined
      }
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
          }
        }}
        className={`pointer-events-none max-w-none select-none ${
          layout ? "absolute left-1/2 top-1/2" : "h-full w-full object-cover"
        }`}
        style={
          layout
            ? {
                width: layout.displayW,
                height: layout.displayH,
                transform: `translate(calc(-50% + ${layout.panX}px), calc(-50% + ${layout.panY}px))`,
              }
            : undefined
        }
      />
    </div>
  );

  if (!editable) return viewport;

  return (
    <div className="space-y-2">
      {viewport}
      <label className="flex items-center gap-2 text-[10px] text-white/45">
        <span className="shrink-0 w-8">Zoom</span>
        <input
          type="range"
          min={100}
          max={400}
          step={1}
          value={localCrop.zoom}
          onChange={(e) => {
            const next = normalizePhotoCrop({ ...localCrop, zoom: Number(e.target.value) });
            setLocalCrop(next);
            commitCrop(next);
          }}
          className="h-1 flex-1 accent-white/70"
        />
      </label>
    </div>
  );
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
  const { data: session } = useSession();

  // Work contract state (separate from main form — saved independently)
  const [contractWeeklyHours, setContractWeeklyHours] = useState<string>("");
  const [contractVacationDays, setContractVacationDays] = useState<string>("");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draft aligns when permission payload / doc identity changes
  }, [permissionState, permissionsDoc?.id, permissionOptions?.teams]);

  // Sync contract fields from loaded person (after contractAutoSave is defined below)
  const syncContractFromPerson = useCallback((p: Person | undefined) => {
    const weekly = p?.weeklyContractHours != null ? String(p.weeklyContractHours) : "";
    const vacation = p?.vacationDaysPerYear != null ? String(p.vacationDaysPerYear) : "";
    setContractWeeklyHours(weekly);
    setContractVacationDays(vacation);
    return { contractWeeklyHours: weekly, contractVacationDays: vacation };
  }, []);

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
        if (!asPage) toast({ title: "Changes saved" });
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
      setPhotoFocus(normalizePhotoCrop({ x: 50, y: 50, zoom: 100 }));
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

  const photoFocusMutation = useMutation({
    mutationFn: async (crop: PhotoCrop) => {
      if (!person?.id) return;
      await updatePersonPhotoFocus(person.id, crop);
    },
    onSuccess: async () => {
      if (!person?.id) return;
      await queryClient.invalidateQueries({ queryKey: ["people", person.id] });
      await queryClient.invalidateQueries({ queryKey: ["people"] });
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
    setPhotoFocus(
      normalizePhotoCrop({
        x: person?.photoFocusX ?? 50,
        y: person?.photoFocusY ?? 50,
        zoom: person?.photoZoom ?? 100,
      })
    );
  }, [person?.id, person?.photoFocusX, person?.photoFocusY, person?.photoZoom]);

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
      if (!silent) toast({ title: "Changes saved" });
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
    getSnapshot: () => ({ contractWeeklyHours, contractVacationDays }),
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
    const status =
      autoSave.status === "error" || contractAutoSave.status === "error"
        ? "error"
        : autoSave.status === "saving" || contractAutoSave.status === "saving"
          ? "saving"
          : autoSave.status === "pending" || contractAutoSave.status === "pending"
            ? "pending"
            : autoSave.status === "saved" || contractAutoSave.status === "saved"
              ? "saved"
              : "idle";
    const error = autoSave.error ?? contractAutoSave.error;
    onAutoSaveState({ status, error });
  }, [
    asPage,
    onAutoSaveState,
    autoSave.status,
    autoSave.error,
    contractAutoSave.status,
    contractAutoSave.error,
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
          : "You can pick an image now; it uploads right after you click Add Person."}
      </p>
      {profileImageSrc ? (
        <div className="space-y-2">
          <CircularPhotoEditor
            src={profileImageSrc}
            alt={person ? `${person.name} profile` : "Profile preview"}
            focusX={photoFocus.x}
            focusY={photoFocus.y}
            zoom={photoFocus.zoom}
            onCropChange={(crop) => {
              setPhotoFocus(crop);
              if (person?.id) {
                photoFocusMutation.mutate(crop);
              }
            }}
            editable
          />
          <p className="text-[10px] text-white/40">
            Drag in any direction to pan. Scroll on the photo or use the zoom slider to scale, then drag to fit inside the circle.
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
            {mutation.isPending ? "Adding…" : "Add Person"}
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
                <p className={sectionTitle}>Work contract</p>
                <p className="text-[11px] text-white/30">
                  Used for overtime and vacation tracking in time reports.
                </p>
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
                {contractWeeklyHours && !isNaN(parseFloat(contractWeeklyHours)) ? (
                  <div className="grid grid-cols-3 gap-2 text-xs text-white/45">
                    {[
                      { label: "Hours/day", value: `${(parseFloat(contractWeeklyHours) / 5).toFixed(1)} h` },
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
              <p className={sectionTitle}>Work contract</p>
              <p className="text-[11px] text-white/30 mt-0.5">
                Used for overtime and vacation tracking in time reports.
              </p>
            </div>
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
            {/* Derived display */}
            {contractWeeklyHours && !isNaN(parseFloat(contractWeeklyHours)) && (
              <div className="grid grid-cols-3 gap-2 text-xs text-white/45">
                {[
                  { label: "Hours/day", value: `${(parseFloat(contractWeeklyHours) / 5).toFixed(1)} h` },
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
          <DialogTitle>{person ? "Edit Person" : "Add Person"}</DialogTitle>
        </DialogHeader>
        {formBody}
        <DialogFooter>{formFooter}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { PersonFormDialog };

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
          <CircularPhotoEditor
            src={`${import.meta.env.VITE_BACKEND_URL || ""}/api/people/${person.id}/photo?ts=${person.photoUpdatedAt ?? ""}`}
            alt={person.name}
            focusX={person.photoFocusX ?? 50}
            focusY={person.photoFocusY ?? 50}
            zoom={person.photoZoom ?? 100}
            editable={false}
            sizeClassName="h-14 w-14"
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
          <p className="text-sm text-white/40">Cast, crew and contacts.</p>
          <p className="text-xs text-white/25 mt-1">
            Add people first; send login invitations when you are ready from each person&apos;s profile.
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
