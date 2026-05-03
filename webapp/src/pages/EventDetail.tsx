import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useMatch } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Edit2,
  Trash2,
  Plus,
  X,
  Download,
  Upload,
} from "lucide-react";
import { api, isApiError } from "@/lib/api";
import { invalidateWorkAnnouncementBar } from "@/lib/invalidateWorkAnnouncementBar";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import type {
  Event,
  EventDetail,
  EventTeam,
  EventTeamNote,
  Person,
  EventPerson,
  Document,
  EventShow,
  Venue,
} from "@/lib/types";
import {
  decodeToFormFields,
  formDimsToStageSize,
  requiredStageTotalsMetersFromStrings,
  venueRecordToMeters,
  venueSmallerThanStageWarnings,
} from "@/lib/stageSize";
import { cn } from "@/lib/utils";
import type { Department } from "../../../backend/src/types";
import { formatDate } from "@/lib/dateUtils";
import { DateInputWithWeekday } from "@/components/DateInputWithWeekday";
import { SplitDurationHhMmInput, SplitTimeInput, type SplitTimeFieldHandle } from "@/components/SplitTimeField";
import { ShowJobsEditor } from "@/components/event/ShowJobsEditor";
import { durationMinutesBetween, endTimeFromStartAndDuration } from "@/lib/showTiming";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import { AddressFields, type Address } from "@/components/AddressFields";
import { ContactFieldsOneRowNote } from "@/components/event/ContactFieldsOneRowNote";
import {
  emptyContactRowFields,
  migrateContactRowFields,
  parseStoredContactRow,
  serializeContactRow,
  type EventContactRowFields,
} from "@/lib/eventContactRow";
import { parseEventCustomFieldsJson, type EventCustomField } from "@/lib/eventCustomFields";

type TeamDocument = {
  id: string;
  eventId: string;
  teamId: string;
  name: string;
  type: string;
  filename: string;
  mimeType: string;
  createdByUserId: string | null;
  createdAt: string;
};

const EventEditSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z.enum(["draft", "confirmed", "cancelled"]),
  venueId: z.string().optional(),
  primaryContactRole: z.string().optional(),
  primaryContactName: z.string().optional(),
  primaryContactPhone: z.string().optional(),
  primaryContactEmail: z.string().optional(),
  primaryContactNote: z.string().optional(),
  actorCount: z.string().optional(),
  allergies: z.string().optional(),
  stageWidth: z.string().optional(),
  stageDepth: z.string().optional(),
  stageHeight: z.string().optional(),
  getInDate: z.string().optional(),
  getInStart: z.string().optional(),
  getInEnd: z.string().optional(),
  getInDuration: z.string().optional(),
  smokeFx: z.boolean().optional(),
  hazeFx: z.boolean().optional(),
  strobeFx: z.boolean().optional(),
  fohNotes: z.string().optional(),
  technicalContactRole: z.string().optional(),
  technicalContactName: z.string().optional(),
  technicalContactPhone: z.string().optional(),
  technicalContactEmail: z.string().optional(),
  technicalContactNote: z.string().optional(),
  contractNotes: z.string().optional(),
  companyLegalName: z.string().optional(),
  companyVat: z.string().optional(),
  companyStreet: z.string().optional(),
  companyNumber: z.string().optional(),
  companyZip: z.string().optional(),
  companyCity: z.string().optional(),
  companyState: z.string().optional(),
  companyCountry: z.string().optional(),
});

type EventEditValues = z.infer<typeof EventEditSchema>;

function emptyEventFormValues(): EventEditValues {
  return {
    title: "",
    description: "",
    status: "draft",
    venueId: "",
    primaryContactRole: "",
    primaryContactName: "",
    primaryContactPhone: "",
    primaryContactEmail: "",
    primaryContactNote: "",
    actorCount: "",
    allergies: "",
    ...decodeToFormFields(null),
    getInDate: "",
    getInStart: "",
    getInEnd: "",
    getInDuration: "",
    smokeFx: false,
    hazeFx: false,
    strobeFx: false,
    fohNotes: "",
    technicalContactRole: "",
    technicalContactName: "",
    technicalContactPhone: "",
    technicalContactEmail: "",
    technicalContactNote: "",
    contractNotes: "",
    companyLegalName: "",
    companyVat: "",
    companyStreet: "",
    companyNumber: "",
    companyZip: "",
    companyCity: "",
    companyState: "",
    companyCountry: "",
  };
}

/** Extra contact persons (same columns as primary / technical). */
type ContactRow = EventContactRowFields;

type GeneralEventFields = {
  smokeFx: boolean;
  hazeFx: boolean;
  strobeFx: boolean;
  fohNotes: string;
  contacts: ContactRow[];
  getInDate: string;
  getInStart: string;
  getInEnd: string;
  getInDuration: string;
  technicalContactInfo: string;
  contractNotes: string;
  companyLegalName: string;
  companyVat: string;
  companyStreet: string;
  companyNumber: string;
  companyZip: string;
  companyCity: string;
  companyState: string;
  companyCountry: string;
};

function normalizeEventStatus(s: string | undefined): "draft" | "confirmed" | "cancelled" {
  if (s === "confirmed" || s === "cancelled" || s === "draft") return s;
  return "draft";
}

function formValuesFromEvent(e: EventDetail, g: GeneralEventFields): EventEditValues {
  const primary = parseStoredContactRow(e.contactPerson);
  const technical = parseStoredContactRow(g.technicalContactInfo);
  return {
    title: e.title,
    description: e.description ?? "",
    status: normalizeEventStatus(e.status),
    venueId: e.venueId ?? "",
    primaryContactRole: primary.role,
    primaryContactName: primary.name,
    primaryContactPhone: primary.phone,
    primaryContactEmail: primary.email,
    primaryContactNote: primary.note,
    actorCount: e.actorCount != null ? String(e.actorCount) : "",
    allergies: e.allergies ?? "",
    ...decodeToFormFields(e.stageSize),
    getInDate: g.getInDate,
    getInStart: g.getInStart || (e.getInTime ?? ""),
    getInEnd: g.getInEnd,
    getInDuration: g.getInDuration,
    smokeFx: g.smokeFx,
    hazeFx: g.hazeFx,
    strobeFx: g.strobeFx,
    fohNotes: g.fohNotes,
    technicalContactRole: technical.role,
    technicalContactName: technical.name,
    technicalContactPhone: technical.phone,
    technicalContactEmail: technical.email,
    technicalContactNote: technical.note,
    contractNotes: g.contractNotes ?? "",
    companyLegalName: g.companyLegalName ?? "",
    companyVat: g.companyVat ?? "",
    companyStreet: g.companyStreet ?? "",
    companyNumber: g.companyNumber ?? "",
    companyZip: g.companyZip ?? "",
    companyCity: g.companyCity ?? "",
    companyState: g.companyState ?? "",
    companyCountry: g.companyCountry ?? "",
  };
}

function splitGeneralEventFields(fields: EventCustomField[]): {
  general: GeneralEventFields;
  rest: EventCustomField[];
} {
  const general: GeneralEventFields = {
    smokeFx: false,
    hazeFx: false,
    strobeFx: false,
    fohNotes: "",
    contacts: [],
    getInDate: "",
    getInStart: "",
    getInEnd: "",
    getInDuration: "",
    technicalContactInfo: "",
    contractNotes: "",
    companyLegalName: "",
    companyVat: "",
    companyStreet: "",
    companyNumber: "",
    companyZip: "",
    companyCity: "",
    companyState: "",
    companyCountry: "",
  };
  const rest: EventCustomField[] = [];
  for (const field of fields) {
    const key = field.key?.trim();
    const value = field.value ?? "";
    if (key === "FOH notes") {
      general.fohNotes = value;
      continue;
    }
    if (key === "Use smoke fx") {
      general.smokeFx = value === "true";
      continue;
    }
    if (key === "Use haze fx") {
      general.hazeFx = value === "true";
      continue;
    }
    if (key === "Use strobe fx") {
      general.strobeFx = value === "true";
      continue;
    }
    if (key === "Contacts") {
      try {
        const parsed = JSON.parse(value) as unknown[];
        if (Array.isArray(parsed)) {
          general.contacts = parsed.map((row) => migrateContactRowFields(row));
          continue;
        }
      } catch {
        // keep legacy values in rest
      }
    }
    if (key === "Get-in date") {
      general.getInDate = value;
      continue;
    }
    if (key === "Get-in start") {
      general.getInStart = value;
      continue;
    }
    if (key === "Get-in end") {
      general.getInEnd = value;
      continue;
    }
    if (key === "Get-in duration") {
      general.getInDuration = value;
      continue;
    }
    if (key === "Technical contact info") {
      general.technicalContactInfo = value;
      continue;
    }
    if (key === "Company legal name") {
      general.companyLegalName = value;
      continue;
    }
    if (key === "Company VAT") {
      general.companyVat = value;
      continue;
    }
    if (key === "Company address") {
      try {
        const a = JSON.parse(value) as Partial<Address>;
        general.companyStreet = String(a.street ?? "");
        general.companyNumber = String(a.number ?? "");
        general.companyZip = String(a.zip ?? "");
        general.companyCity = String(a.city ?? "");
        general.companyState = String(a.state ?? "");
        general.companyCountry = String(a.country ?? "");
      } catch {
        /* ignore */
      }
      continue;
    }
    if (key === "Company info") {
      if (!general.companyLegalName.trim()) general.companyLegalName = value;
      continue;
    }
    if (key === "Contract booking notes") {
      general.contractNotes = value;
      continue;
    }
    rest.push(field);
  }
  return { general, rest };
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "text-[10px] text-white/40 uppercase tracking-widest mb-2 mt-4 pb-1.5 border-b border-white/[0.06]",
        className
      )}
    >
      {children}
    </div>
  );
}

// ── Details Tab ──────────────────────────────────────────────────────────────

function DetailsTab({
  event,
  isNew,
  onCreated,
  onDeleted,
}: {
  event: EventDetail | null;
  isNew: boolean;
  onCreated: (id: string) => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(true);

  const eventId = event?.id ?? null;
  const customFieldsRaw = event?.customFields ?? null;

  const parsedCustomFields = useMemo(
    () => parseEventCustomFieldsJson(customFieldsRaw),
    [customFieldsRaw]
  );
  const splitFields = useMemo(() => splitGeneralEventFields(parsedCustomFields), [parsedCustomFields]);
  const customFields = splitFields.rest;
  const [contacts, setContacts] = useState<ContactRow[]>(() =>
    eventId
      ? splitGeneralEventFields(parseEventCustomFieldsJson(customFieldsRaw)).general.contacts
      : []
  );

  const { data: venues } = useQuery({
    queryKey: ["venues"],
    queryFn: () => api.get<Venue[]>("/api/venues"),
  });

  const getInEndFieldRef = useRef<SplitTimeFieldHandle>(null);
  const getInDurFieldRef = useRef<SplitTimeFieldHandle>(null);

  const formValues = useMemo((): EventEditValues => {
    if (isNew || !event) return emptyEventFormValues();
    const s = splitGeneralEventFields(parseEventCustomFieldsJson(event.customFields));
    return formValuesFromEvent(event, s.general);
  }, [isNew, event]);

  const form = useForm<EventEditValues>({
    resolver: zodResolver(EventEditSchema),
    values: formValues,
  });

  useEffect(() => {
    if (!eventId) {
      setContacts([]);
      return;
    }
    setContacts(splitGeneralEventFields(parseEventCustomFieldsJson(customFieldsRaw)).general.contacts);
  }, [eventId, customFieldsRaw]);

  const vId = form.watch("venueId");
  const sW = form.watch("stageWidth");
  const sD = form.watch("stageDepth");
  const sH = form.watch("stageHeight");

  const venueSizeWarnings = useMemo(() => {
    if (!venues?.length) return null;
    if (!vId || vId === "__none__") return null;
    const v = venues.find((x) => x.id === vId);
    if (!v) return null;
    const tot = requiredStageTotalsMetersFromStrings({
      stageWidth: sW ?? "",
      stageDepth: sD ?? "",
      stageHeight: sH ?? "",
    });
    return venueSmallerThanStageWarnings(tot, venueRecordToMeters(v));
  }, [venues, vId, sW, sD, sH]);

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post<Event>("/api/events", data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      void invalidateWorkAnnouncementBar(queryClient);
      onCreated(created.id);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => {
      if (!event) throw new Error("Event missing");
      return api.put(`/api/events/${event.id}`, data);
    },
    onSuccess: () => {
      if (event) {
        queryClient.invalidateQueries({ queryKey: ["event", event.id] });
        void invalidateWorkAnnouncementBar(queryClient);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!event) throw new Error("Event missing");
      return api.delete(`/api/events/${event.id}`);
    },
    onSuccess: () => {
      void invalidateWorkAnnouncementBar(queryClient);
      onDeleted();
    },
  });

  function onSubmit(values: EventEditValues) {
    const normalizedCustomFields = customFields.filter((f) => f.key.trim() || f.value.trim());
    const validContacts = contacts
      .map((row) => ({
        role: row.role.trim(),
        name: row.name.trim(),
        phone: row.phone.trim(),
        email: row.email.trim(),
        note: row.note.trim(),
      }))
      .filter((row) => row.role || row.name || row.phone || row.email || row.note);
    const audienceFxNote =
      values.smokeFx || values.hazeFx || values.strobeFx
        ? "Audience announcement required: This performance uses smoke/haze/strobe effects."
        : "";
    const baseFoh = (values.fohNotes ?? "").trim();
    const mergedFohNotes =
      audienceFxNote && !baseFoh.includes(audienceFxNote)
        ? [baseFoh, audienceFxNote].filter(Boolean).join("\n")
        : baseFoh;
    const generalFields = [
      { key: "Use smoke fx", value: values.smokeFx ? "true" : "false" },
      { key: "Use haze fx", value: values.hazeFx ? "true" : "false" },
      { key: "Use strobe fx", value: values.strobeFx ? "true" : "false" },
      { key: "FOH notes", value: mergedFohNotes },
      { key: "Contacts", value: validContacts.length > 0 ? JSON.stringify(validContacts) : "" },
      { key: "Get-in date", value: values.getInDate?.trim() || "" },
      { key: "Get-in start", value: values.getInStart?.trim() || "" },
      { key: "Get-in end", value: values.getInEnd?.trim() || "" },
      { key: "Get-in duration", value: values.getInDuration?.trim() || "" },
      {
        key: "Technical contact info",
        value: serializeContactRow({
          role: values.technicalContactRole ?? "",
          name: values.technicalContactName ?? "",
          phone: values.technicalContactPhone ?? "",
          email: values.technicalContactEmail ?? "",
          note: values.technicalContactNote ?? "",
        }),
      },
      { key: "Company legal name", value: values.companyLegalName?.trim() || "" },
      { key: "Company VAT", value: values.companyVat?.trim() || "" },
      {
        key: "Company address",
        value: (() => {
          const a = {
            street: values.companyStreet?.trim() ?? "",
            number: values.companyNumber?.trim() ?? "",
            zip: values.companyZip?.trim() ?? "",
            city: values.companyCity?.trim() ?? "",
            state: values.companyState?.trim() ?? "",
            country: values.companyCountry?.trim() ?? "",
          };
          return Object.values(a).some(Boolean) ? JSON.stringify(a) : "";
        })(),
      },
      { key: "Contract booking notes", value: values.contractNotes?.trim() || "" },
    ]
      .filter((row) => row.value)
      .map((row) => ({ ...row, departments: [] as string[] }));
    const mergedCustomFields = [...normalizedCustomFields, ...generalFields];

    const stageEnc = formDimsToStageSize({
      stageWidth: values.stageWidth ?? "",
      stageDepth: values.stageDepth ?? "",
      stageHeight: values.stageHeight ?? "",
    });

    const primaryContactSerialized = serializeContactRow({
      role: values.primaryContactRole ?? "",
      name: values.primaryContactName ?? "",
      phone: values.primaryContactPhone ?? "",
      email: values.primaryContactEmail ?? "",
      note: values.primaryContactNote ?? "",
    });

    if (isNew) {
      const payload: Record<string, unknown> = {
        title: values.title,
        status: values.status,
      };
      if (values.venueId && values.venueId !== "__none__") payload.venueId = values.venueId;
      if (values.description) payload.description = values.description;
      if (primaryContactSerialized) payload.contactPerson = primaryContactSerialized;
      if (values.allergies) payload.allergies = values.allergies;
      if (stageEnc) payload.stageSize = stageEnc;
      if (values.getInStart) payload.getInTime = values.getInStart;
      if (values.getInDuration) payload.setupTime = values.getInDuration;
      if (values.actorCount) payload.actorCount = Number(values.actorCount);
      if (mergedCustomFields.length > 0) payload.customFields = JSON.stringify(mergedCustomFields);
      createMutation.mutate(payload);
      return;
    }

    const payload: Record<string, unknown> = {
      title: values.title,
      status: values.status,
    };
    payload.startDate = null;
    payload.endDate = null;
    if (values.venueId && values.venueId !== "__none__") payload.venueId = values.venueId;
    else payload.venueId = undefined;
    if (values.description) payload.description = values.description;
    if (primaryContactSerialized) payload.contactPerson = primaryContactSerialized;
    if (values.allergies) payload.allergies = values.allergies;
    payload.stageSize = stageEnc ?? null;
    if (values.getInStart) payload.getInTime = values.getInStart;
    if (values.getInDuration) payload.setupTime = values.getInDuration;
    if (values.actorCount) payload.actorCount = Number(values.actorCount);
    payload.customFields = mergedCustomFields.length > 0 ? JSON.stringify(mergedCustomFields) : undefined;
    updateMutation.mutate(payload);
  }

  function addContact() {
    setContacts((prev) => [...prev, emptyContactRowFields()]);
  }

  function removeContact(idx: number) {
    setContacts((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateContact(idx: number, patch: Partial<ContactRow>) {
    setContacts((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  const saving = createMutation.isPending || updateMutation.isPending;
  const saveError = isNew ? createMutation.isError : updateMutation.isError;
  const saveErrorMsg = isNew
    ? createMutation.error instanceof Error
      ? createMutation.error.message
      : "Failed to create event."
    : updateMutation.error instanceof Error
      ? updateMutation.error.message
      : "Failed to save changes.";

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-white">{isNew ? "New event" : "Details"}</h2>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
          {/* ── Core fields ── */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Title</FormLabel>
                  <FormControl>
                    <Input {...field} className="bg-white/5 border-white/10 text-white focus:border-white/30" />
                  </FormControl>
                  <FormMessage className="text-red-400 text-xs" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <Collapsible open={descriptionOpen} onOpenChange={setDescriptionOpen}>
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-left hover:bg-white/[0.06]"
                      >
                        <span className="text-white/60 text-xs uppercase tracking-wide">Description</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 text-white/45 transition-transform",
                            descriptionOpen && "rotate-180"
                          )}
                        />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value ?? ""}
                          id="event-description"
                          className="bg-white/5 border-white/10 text-white focus:border-white/30 resize-y min-h-[200px] text-sm leading-relaxed"
                          rows={12}
                          placeholder="Show summary, audience, notes for the team…"
                        />
                      </FormControl>
                    </CollapsibleContent>
                  </Collapsible>
                </FormItem>
              )}
            />
            <p className="text-xs text-white/40">
              Schedule and duration are per show (below). Default venue is for reference; each show can use a different venue.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Status</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={normalizeEventStatus(field.value)}
                    >
                      <FormControl>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-[#16161f] border-white/10 text-white">
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="venueId"
                render={({ field }) => {
                  const vid = field.value ?? "";
                  const venueIds = new Set((venues ?? []).map((x) => x.id));
                  const orphan =
                    Boolean(vid && vid !== "__none__" && !venueIds.has(vid));
                  const selectValue = orphan ? vid : vid || "__none__";
                  return (
                    <FormItem>
                      <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Venue</FormLabel>
                      <Select onValueChange={field.onChange} value={selectValue}>
                        <FormControl>
                          <SelectTrigger className="bg-white/5 border-white/10 text-white">
                            <SelectValue placeholder="No venue" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-[#16161f] border-white/10 text-white">
                          <SelectItem value="__none__">No venue</SelectItem>
                          {orphan ? (
                            <SelectItem value={vid}>Unavailable venue (re-select or clear)</SelectItem>
                          ) : null}
                          {(venues ?? []).map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  );
                }}
              />
            </div>
            {venueSizeWarnings && venueSizeWarnings.length > 0 ? (
              <div
                role="status"
                className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100/95 space-y-0.5"
              >
                {venueSizeWarnings.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : null}

            {/* ── Production Info ── */}
            <SectionHeader>Production Info</SectionHeader>

            <FormField
              control={form.control}
              name="actorCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Actor Count</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} type="number" min={0} placeholder="e.g. 12" className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30" />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="allergies"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Allergies / Dietary Requirements</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} placeholder="Any allergies or dietary requirements" className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-none" rows={2} />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* ── Booking & contract ── */}
            <SectionHeader>Booking &amp; contract</SectionHeader>
            <p className="text-xs text-white/45 -mt-1 mb-2">
              Booker contact details, company, technical liaison, and contract notes for confirming the engagement.
            </p>

            <FormItem>
              <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Primary / contract contact</FormLabel>
              <ContactFieldsOneRowNote
                row={{
                  role: form.watch("primaryContactRole") ?? "",
                  name: form.watch("primaryContactName") ?? "",
                  phone: form.watch("primaryContactPhone") ?? "",
                  email: form.watch("primaryContactEmail") ?? "",
                  note: form.watch("primaryContactNote") ?? "",
                }}
                onChange={(patch) => {
                  if (patch.role !== undefined) form.setValue("primaryContactRole", patch.role);
                  if (patch.name !== undefined) form.setValue("primaryContactName", patch.name);
                  if (patch.phone !== undefined) form.setValue("primaryContactPhone", patch.phone);
                  if (patch.email !== undefined) form.setValue("primaryContactEmail", patch.email);
                  if (patch.note !== undefined) form.setValue("primaryContactNote", patch.note);
                }}
                notePlaceholder="Booking lead: availability, preferred channel…"
              />
            </FormItem>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="companyLegalName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Company legal name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder="Registered company name"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="companyVat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/60 text-xs uppercase tracking-wide">VAT / org number</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder="VAT, CVR, EIN…"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs uppercase tracking-wide">Company address</Label>
              <AddressFields
                value={{
                  street: form.watch("companyStreet") ?? "",
                  number: form.watch("companyNumber") ?? "",
                  zip: form.watch("companyZip") ?? "",
                  city: form.watch("companyCity") ?? "",
                  state: form.watch("companyState") ?? "",
                  country: form.watch("companyCountry") ?? "",
                }}
                onChange={(addr) => {
                  form.setValue("companyStreet", addr.street);
                  form.setValue("companyNumber", addr.number);
                  form.setValue("companyZip", addr.zip);
                  form.setValue("companyCity", addr.city);
                  form.setValue("companyState", addr.state);
                  form.setValue("companyCountry", addr.country);
                }}
              />
            </div>

            <FormItem>
              <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Technical contact</FormLabel>
              <ContactFieldsOneRowNote
                row={{
                  role: form.watch("technicalContactRole") ?? "",
                  name: form.watch("technicalContactName") ?? "",
                  phone: form.watch("technicalContactPhone") ?? "",
                  email: form.watch("technicalContactEmail") ?? "",
                  note: form.watch("technicalContactNote") ?? "",
                }}
                onChange={(patch) => {
                  if (patch.role !== undefined) form.setValue("technicalContactRole", patch.role);
                  if (patch.name !== undefined) form.setValue("technicalContactName", patch.name);
                  if (patch.phone !== undefined) form.setValue("technicalContactPhone", patch.phone);
                  if (patch.email !== undefined) form.setValue("technicalContactEmail", patch.email);
                  if (patch.note !== undefined) form.setValue("technicalContactNote", patch.note);
                }}
                notePlaceholder="Technical lead on booker side: channel, rider links…"
              />
            </FormItem>

            <FormField
              control={form.control}
              name="contractNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Contract &amp; booking notes</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Deal terms, references, special clauses…"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-y min-h-[72px]"
                      rows={3}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] text-white/50 uppercase tracking-wide">Contact persons</p>
                  <p className="text-xs text-white/40 mt-0.5 max-w-md">
                    Add as many people as you need for this event (e.g. tour manager, agent, production). Use the
                    button for each new person.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={addContact}
                  className="shrink-0 bg-ordo-violet/30 hover:bg-ordo-violet/40 text-white border border-white/10"
                >
                  <Plus size={15} className="mr-1.5" />
                  Add contact person
                </Button>
              </div>

              {contacts.length === 0 ? (
                <p className="text-sm text-white/35 rounded-md border border-dashed border-white/15 bg-white/[0.02] px-3 py-4 text-center">
                  No contact persons yet. Click &ldquo;Add contact person&rdquo; to add the first one.
                </p>
              ) : null}

              {contacts.map((row, idx) => (
                <div
                  key={idx}
                  className="rounded-md border border-white/10 bg-white/[0.02] p-3 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-white/50">Person {idx + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeContact(idx)}
                      className="h-7 text-red-400/80 hover:text-red-400 hover:bg-red-500/10 -mr-1"
                    >
                      <X size={14} className="mr-1" />
                      Remove
                    </Button>
                  </div>
                  <ContactFieldsOneRowNote
                    row={row}
                    onChange={(patch) => updateContact(idx, patch)}
                    notePlaceholder="Availability, preferred channel, extra context…"
                  />
                </div>
              ))}

              {contacts.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full sm:w-auto border-white/15 text-white/85 hover:bg-white/[0.06]"
                  onClick={addContact}
                >
                  <Plus size={15} className="mr-1.5" />
                  Add another contact person
                </Button>
              ) : null}
            </div>

            {/* ── Technical ── */}
            <SectionHeader>Technical</SectionHeader>

            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-3">
              <div className="flex flex-nowrap items-end gap-x-4 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
                {(
                  [
                    { label: "Width", name: "stageWidth" as const },
                    { label: "Depth", name: "stageDepth" as const },
                    { label: "Height", name: "stageHeight" as const },
                  ] as const
                ).map((row) => (
                  <FormField
                    key={row.name}
                    control={form.control}
                    name={row.name}
                    render={({ field }) => (
                      <FormItem className="shrink-0 space-y-1.5 w-[5.75rem]">
                        <FormLabel className="text-white/60 text-xs uppercase tracking-wide">{row.label}</FormLabel>
                        <div className="flex items-center gap-1.5">
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value ?? ""}
                              inputMode="decimal"
                              maxLength={7}
                              placeholder="0"
                              autoComplete="off"
                              aria-label={`Stage ${row.label.toLowerCase()} (m)`}
                              className="h-9 w-[4.5rem] min-w-[4.5rem] bg-white/5 border-white/10 text-white tabular-nums text-sm"
                            />
                          </FormControl>
                          <span className="text-[10px] text-white/35 shrink-0">m</span>
                        </div>
                      </FormItem>
                    )}
                  />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 border-t border-white/[0.06]">
                <Label className="text-white/60 text-xs uppercase tracking-wide shrink-0">Effects</Label>
                <FormField
                  control={form.control}
                  name="smokeFx"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-1.5 space-y-0">
                      <FormControl>
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 accent-ordo-yellow"
                          checked={Boolean(field.value)}
                          onChange={(e) => field.onChange(e.target.checked)}
                        />
                      </FormControl>
                      <FormLabel className="text-white/70 text-xs font-normal cursor-pointer">Smoke</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hazeFx"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-1.5 space-y-0">
                      <FormControl>
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 accent-ordo-yellow"
                          checked={Boolean(field.value)}
                          onChange={(e) => field.onChange(e.target.checked)}
                        />
                      </FormControl>
                      <FormLabel className="text-white/70 text-xs font-normal cursor-pointer">Haze</FormLabel>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="strobeFx"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-1.5 space-y-0">
                      <FormControl>
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-white/20 bg-white/5 accent-ordo-yellow"
                          checked={Boolean(field.value)}
                          onChange={(e) => field.onChange(e.target.checked)}
                        />
                      </FormControl>
                      <FormLabel className="text-white/70 text-xs font-normal cursor-pointer">Strobe</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[auto_auto_auto_auto] gap-3 items-end">
              <FormField
                control={form.control}
                name="getInDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Get-in date</FormLabel>
                    <FormControl>
                      <DateInputWithWeekday
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        className="bg-white/5 border-white/10 text-white [color-scheme:dark]"
                        weekdayClassName="text-sm text-white/45"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="getInStart"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Start</FormLabel>
                    <FormControl>
                      <SplitTimeInput
                        value={field.value ?? ""}
                        nextFieldRef={getInEndFieldRef}
                        aria-label="Get-in start"
                        onChange={(v) => {
                          field.onChange(v);
                          const d = Number(form.getValues("getInDuration"));
                          if (!Number.isNaN(d) && d >= 1 && v) {
                            form.setValue("getInEnd", endTimeFromStartAndDuration(v, d));
                          } else {
                            const end = form.getValues("getInEnd");
                            if (v && end) {
                              const dm = durationMinutesBetween(v, end);
                              if (dm) form.setValue("getInDuration", String(dm));
                            }
                          }
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="getInEnd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/60 text-xs uppercase tracking-wide">End</FormLabel>
                    <FormControl>
                      <SplitTimeInput
                        ref={getInEndFieldRef}
                        value={field.value ?? ""}
                        nextFieldRef={getInDurFieldRef}
                        aria-label="Get-in end"
                        disabled={!/^\d{2}:\d{2}$/.test(form.getValues("getInStart") || "")}
                        onChange={(v) => {
                          field.onChange(v);
                          const start = form.getValues("getInStart");
                          if (start && v) {
                            const dm = durationMinutesBetween(start, v);
                            if (dm) form.setValue("getInDuration", String(dm));
                          }
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="getInDuration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Duration</FormLabel>
                    <FormControl>
                      <SplitDurationHhMmInput
                        ref={getInDurFieldRef}
                        valueMinutes={Number(field.value) || 0}
                        aria-label="Get-in duration"
                        disabled={!/^\d{2}:\d{2}$/.test(form.getValues("getInStart") || "")}
                        onChangeMinutes={(m) => {
                          field.onChange(String(m));
                          const start = form.getValues("getInStart");
                          if (m >= 1 && start) form.setValue("getInEnd", endTimeFromStartAndDuration(start, m));
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <SectionHeader>FOH</SectionHeader>
            <FormField
              control={form.control}
              name="fohNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/60 text-xs uppercase tracking-wide">FOH Notes</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} className="bg-white/5 border-white/10 text-white focus:border-white/30" />
                  </FormControl>
                </FormItem>
              )}
            />
            {(form.watch("smokeFx") || form.watch("hazeFx") || form.watch("strobeFx")) ? (
              <p className="text-xs rounded border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-amber-100/95">
                FOH audience announcement note will be added automatically when saving.
              </p>
            ) : null}

            {!isNew && event ? <EventDocumentsSection event={event} /> : null}

            {saveError ? (
              <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                {saveErrorMsg}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={saving} className="bg-red-900 hover:bg-red-800 text-white border-red-700/50">
                {isNew ? (saving ? "Creating…" : "Create event") : saving ? "Saving…" : "Save"}
              </Button>
              {isNew ? (
                <Button type="button" variant="outline" onClick={() => navigate("/events")} className="border-white/10 text-white/60 hover:text-white bg-transparent">
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </Form>

        {!isNew && event ? (
          <>
            <div className="pt-2 border-t border-white/10">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                className="text-red-400/70 hover:text-red-400 hover:bg-red-500/10 gap-2"
              >
                <Trash2 size={13} /> Delete event
              </Button>
            </div>
            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
              <AlertDialogContent className="bg-[#16161f] border-white/10 text-white">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this event?</AlertDialogTitle>
                  <AlertDialogDescription className="text-white/50">
                    This will permanently delete the event and all associated documents.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
                    onClick={() => {
                      if (!confirmDeleteAction(`event "${event.title}"`)) return;
                      deleteMutation.mutate();
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Label className="text-white/60 text-xs uppercase tracking-wide block mb-1.5">{children}</Label>;
}

type NewShowFormState = {
  showDate: string;
  showTime: string;
  endTime: string;
  durationMinutes: string;
  venueId: string;
};

function mergeNewShowState(prev: NewShowFormState, patch: Partial<NewShowFormState>): NewShowFormState {
  const next: NewShowFormState = { ...prev, ...patch };
  const durN = Number(next.durationMinutes);
  const durOk = !Number.isNaN(durN) && durN >= 1;

  if (patch.durationMinutes !== undefined && durOk && next.showTime) {
    next.endTime = endTimeFromStartAndDuration(next.showTime, durN);
  } else if (patch.endTime !== undefined && next.showTime && next.endTime) {
    const dm = durationMinutesBetween(next.showTime, next.endTime);
    if (dm) next.durationMinutes = String(dm);
  } else if (patch.showTime !== undefined) {
    if (durOk && next.showTime) {
      next.endTime = endTimeFromStartAndDuration(next.showTime, durN);
    } else if (next.showTime && next.endTime) {
      const dm = durationMinutesBetween(next.showTime, next.endTime);
      if (dm) next.durationMinutes = String(dm);
    }
  }
  return next;
}

function ShowTimeEditor({
  show,
  venues,
  onUpdate,
}: {
  show: EventShow;
  venues: { id: string; name: string }[] | undefined;
  onUpdate: (body: Record<string, unknown>) => void;
}) {
  const [showDate, setShowDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [dur, setDur] = useState("");
  const refStart = useRef<SplitTimeFieldHandle>(null);
  const refEnd = useRef<SplitTimeFieldHandle>(null);
  const refDur = useRef<SplitTimeFieldHandle>(null);

  useEffect(() => {
    setShowDate(show.showDate.slice(0, 10));
    setStart(show.showTime);
    setDur(String(show.durationMinutes));
    setEnd(endTimeFromStartAndDuration(show.showTime, show.durationMinutes));
  }, [show.id, show.showDate, show.showTime, show.durationMinutes, show.updatedAt]);
  const hasStartTime = /^\d{2}:\d{2}$/.test(start);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <FieldLabel>Date</FieldLabel>
        <DateInputWithWeekday
          value={showDate}
          onChange={(v) => {
            setShowDate(v);
            onUpdate({ showDate: v });
          }}
          className="bg-white/5 border-white/10 text-white [color-scheme:dark]"
          weekdayClassName="text-sm text-white/45"
        />
      </div>
      <div>
        <FieldLabel>Start</FieldLabel>
        <SplitTimeInput
          ref={refStart}
          value={start}
          nextFieldRef={refEnd}
          aria-label="Start"
          onChange={(v) => {
            setStart(v);
            const d = Number(dur);
            if (!Number.isNaN(d) && d >= 1) {
              setEnd(endTimeFromStartAndDuration(v, d));
              onUpdate({ showTime: v });
            } else if (v && end) {
              const dm = durationMinutesBetween(v, end);
              if (dm) {
                setDur(String(dm));
                onUpdate({ showTime: v, durationMinutes: dm });
              } else {
                onUpdate({ showTime: v });
              }
            } else {
              onUpdate({ showTime: v });
            }
          }}
        />
      </div>
      <div>
        <FieldLabel>End</FieldLabel>
        <SplitTimeInput
          ref={refEnd}
          value={end}
          nextFieldRef={refDur}
          aria-label="End"
          disabled={!hasStartTime}
          onChange={(v) => {
            setEnd(v);
            if (start && v) {
              const dm = durationMinutesBetween(start, v);
              if (dm) {
                setDur(String(dm));
                onUpdate({ durationMinutes: dm });
              }
            }
          }}
        />
      </div>
      <div>
        <FieldLabel>Duration</FieldLabel>
        <SplitDurationHhMmInput
          ref={refDur}
          valueMinutes={Number(dur) || 0}
          aria-label="Duration"
          disabled={!hasStartTime}
          onChangeMinutes={(m) => {
            setDur(String(m));
            if (m >= 1 && start) setEnd(endTimeFromStartAndDuration(start, m));
            if (m >= 1) onUpdate({ durationMinutes: m });
          }}
        />
      </div>
      <div className="min-w-0 flex-1 max-w-xs">
        <FieldLabel>Venue</FieldLabel>
        <Select
          value={show.venueId}
          onValueChange={(v) => onUpdate({ venueId: v })}
        >
          <SelectTrigger className="bg-white/5 border-white/10 text-white w-full min-w-0">
            <SelectValue placeholder="Venue" />
          </SelectTrigger>
          <SelectContent className="bg-[#16161f] border-white/10 text-white">
            {(venues ?? []).map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ── People Tab ───────────────────────────────────────────────────────────────

function PeopleTab({ event }: { event: EventDetail }) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [role, setRole] = useState("");

  const { data: allPeople } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<Person[]>("/api/people"),
  });

  const assignMutation = useMutation({
    mutationFn: ({ personId, role }: { personId: string; role?: string }) =>
      api.post(`/api/events/${event.id}/people`, { personId, role: role || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", event.id] });
      setAddOpen(false);
      setSelectedPersonId("");
      setRole("");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (assignmentId: string) =>
      api.delete(`/api/events/${event.id}/people/${assignmentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", event.id] });
    },
  });

  const assignedIds = new Set(event.people.map((ep) => ep.personId));
  const available = (allPeople ?? []).filter((p) => !assignedIds.has(p.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/40">{event.people.length} assigned</span>
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          className="bg-white/5 hover:bg-white/10 text-white border border-white/10 gap-2 h-8"
        >
          <Plus size={13} /> Add Person
        </Button>
      </div>

      {event.people.length === 0 ? (
        <div className="py-8 text-center text-white/30 text-sm">No people assigned yet.</div>
      ) : (
        <div className="space-y-2">
          {event.people.map((ep: EventPerson) => (
            <div key={ep.id} className="flex items-center justify-between bg-white/[0.03] border border-white/8 rounded-lg px-4 py-3">
              <div>
                <div className="text-sm font-medium text-white/90">{ep.person.name}</div>
                <div className="text-xs text-white/40 mt-0.5">
                  {ep.role ? ep.role : ep.person.role ? ep.person.role : "No role"}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (!confirmDeleteAction(`person assignment "${ep.person.name}"`)) return;
                  removeMutation.mutate(ep.id);
                }}
                className="h-7 w-7 text-white/25 hover:text-red-400"
              >
                <X size={13} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-[#16161f] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Add Person to Event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-white/60 text-xs uppercase tracking-wide">Person</Label>
              <Select value={selectedPersonId} onValueChange={setSelectedPersonId}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Select a person..." />
                </SelectTrigger>
                <SelectContent className="bg-[#16161f] border-white/10 text-white">
                  {available.length === 0 ? (
                    <SelectItem value="__empty__" disabled>All people already assigned</SelectItem>
                  ) : (
                    available.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}{p.role ? ` — ${p.role}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-white/60 text-xs uppercase tracking-wide">Role for this event (optional)</Label>
              <Input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Director, Stage Manager..."
                className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} className="border-white/10 text-white/60 hover:text-white bg-transparent">
              Cancel
            </Button>
            <Button
              disabled={!selectedPersonId || assignMutation.isPending}
              onClick={() => assignMutation.mutate({ personId: selectedPersonId, role })}
              className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
            >
              {assignMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Documents Tab ────────────────────────────────────────────────────────────

function EventDocumentsSection({ event }: { event: EventDetail }) {
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState("other");
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("No file selected");
      const form = new FormData();
      form.append("file", file);
      form.append("name", docName || file.name);
      form.append("type", docType);
      return api.post(`/api/events/${event.id}/documents`, form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", event.id] });
      setUploadOpen(false);
      setFile(null);
      setDocName("");
      setDocType("other");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => api.delete(`/api/documents/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", event.id] });
      setDeleteDocId(null);
    },
  });

  const backendBase = import.meta.env.VITE_BACKEND_URL || "";

  return (
    <div className="space-y-4 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-white/45">Documents</p>
        <span className="text-xs text-white/40">{event.documents.length} document{event.documents.length !== 1 ? "s" : ""}</span>
        <Button
          size="sm"
          onClick={() => setUploadOpen(true)}
          className="bg-white/5 hover:bg-white/10 text-white border border-white/10 gap-2 h-8"
        >
          <Upload size={13} /> Upload
        </Button>
      </div>

      {event.documents.length === 0 ? (
        <div className="py-8 text-center text-white/30 text-sm">No documents uploaded yet.</div>
      ) : (
        <div className="space-y-2">
          {event.documents.map((doc: Document) => (
            <div key={doc.id} className="flex items-center justify-between bg-white/[0.03] border border-white/8 rounded-lg px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white/90 truncate">{doc.name}</div>
                <div className="text-xs text-white/40 mt-0.5 capitalize">{doc.type} · {formatDate(doc.createdAt)}</div>
              </div>
              <div className="flex items-center gap-1 ml-3">
                <a
                  href={`${backendBase}/api/documents/${doc.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-white/25 hover:text-white">
                    <Download size={13} />
                  </Button>
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteDocId(doc.id)}
                  className="h-7 w-7 text-white/25 hover:text-red-400"
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="bg-[#16161f] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-white/60 text-xs uppercase tracking-wide">File</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !docName) setDocName(f.name.replace(/\.[^.]+$/, ""));
                }}
                className="bg-white/5 border-white/10 text-white file:text-white/60 file:bg-white/10 file:border-0 file:rounded file:px-2 file:py-1 file:mr-3 file:text-xs cursor-pointer"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/60 text-xs uppercase tracking-wide">Name</Label>
              <Input
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="Document name"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/60 text-xs uppercase tracking-wide">Type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#16161f] border-white/10 text-white">
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="tech_rider">Tech Rider</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {uploadMutation.isError && (
              <div className="text-red-400 text-sm">
                {uploadMutation.error instanceof Error ? uploadMutation.error.message : "Upload failed"}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)} className="border-white/10 text-white/60 hover:text-white bg-transparent">
              Cancel
            </Button>
            <Button
              disabled={!file || uploadMutation.isPending}
              onClick={() => uploadMutation.mutate()}
              className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteDocId !== null} onOpenChange={(o) => { if (!o) setDeleteDocId(null); }}>
        <AlertDialogContent className="bg-[#16161f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
              onClick={() => {
                if (!deleteDocId) return;
                if (!confirmDeleteAction("document")) return;
                deleteMutation.mutate(deleteDocId);
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

function ShowStaffingSections({
  eventId,
  show,
  eventTeams,
  venues,
  people,
}: {
  eventId: string;
  show: EventShow;
  eventTeams: EventTeam[];
  venues: { id: string; name: string }[] | undefined;
  people: Person[];
}) {
  const queryClient = useQueryClient();
  const [openDeptIds, setOpenDeptIds] = useState<Record<string, boolean>>({});
  const [addedDeptIds, setAddedDeptIds] = useState<string[]>([]);

  const upsertStaffing = useMutation({
    mutationFn: (args: { personId: string; departmentId: string; isLead?: boolean }) =>
      api.post(`/api/events/${eventId}/shows/${show.id}/staffing`, {
        personId: args.personId,
        departmentId: args.departmentId,
        isLead: args.isLead ?? false,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event", eventId] }),
  });

  const removeStaffing = useMutation({
    mutationFn: (personId: string) =>
      api.delete(`/api/events/${eventId}/shows/${show.id}/staffing/${personId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event", eventId] }),
  });

  const departments = eventTeams.map((t) => t.team);
  const staffedDepartmentIds = new Set(
    (show.jobs ?? [])
      .map((j) => j.departmentId)
      .filter((id): id is string => Boolean(id))
  );
  for (const s of show.staffing ?? []) {
    if (s.departmentId) staffedDepartmentIds.add(s.departmentId);
  }
  const visibleDepartmentIds = new Set<string>([...Array.from(staffedDepartmentIds), ...addedDeptIds]);
  const visibleDepartments = departments.filter((d) => visibleDepartmentIds.has(d.id));
  const addableDepartments = departments.filter((d) => !visibleDepartmentIds.has(d.id));

  function setDeptOpen(deptId: string, open: boolean) {
    setOpenDeptIds((prev) => ({ ...prev, [deptId]: open }));
  }

  function addDepartmentSection(deptId: string) {
    setAddedDeptIds((prev) => (prev.includes(deptId) ? prev : [...prev, deptId]));
    setDeptOpen(deptId, true);
  }

  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-white/45">Show staffing</p>
        <Select
          value="__none__"
          onValueChange={(deptId) => {
            if (deptId === "__none__") return;
            addDepartmentSection(deptId);
          }}
          disabled={addableDepartments.length === 0}
        >
          <SelectTrigger className="h-8 w-[13rem] bg-white/5 border-white/10 text-white text-xs">
            <SelectValue placeholder="Add Team Job Section" />
          </SelectTrigger>
          <SelectContent className="bg-[#16161f] border-white/10 text-white">
            <SelectItem value="__none__" disabled>
              Add Team Job Section
            </SelectItem>
            {addableDepartments.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {visibleDepartments.length === 0 ? (
        <p className="text-xs text-white/35">No team sections added for this show yet.</p>
      ) : (
        <div className="space-y-3">
          {visibleDepartments.map((dept) => {
            const deptStaffing = (show.staffing ?? []).filter((s) => s.departmentId === dept.id);
            const lead = deptStaffing.find((s) => s.isLead) ?? null;
            const leadValue = lead?.personId ?? "__none__";
            const isOpen = openDeptIds[dept.id] ?? true;

            return (
              <div key={dept.id} className="rounded-md border border-white/10 bg-white/[0.02] p-3 space-y-3">
                <button
                  type="button"
                  onClick={() => setDeptOpen(dept.id, !isOpen)}
                  className="w-full flex items-center justify-between gap-2 text-left"
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown size={14} className="text-white/50" /> : <ChevronRight size={14} className="text-white/50" />}
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: dept.color }} />
                    <span className="text-sm font-medium text-white/85">{dept.name}</span>
                  </div>
                  <span className="text-xs text-white/45">{(show.jobs ?? []).filter((j) => j.departmentId === dept.id).length} jobs</span>
                </button>

                {isOpen ? (
                  <>
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[14rem]">
                        <FieldLabel>{dept.name} lead</FieldLabel>
                        <Select
                          value={leadValue}
                          onValueChange={(personId) => {
                            if (personId === "__none__") {
                              if (lead) removeStaffing.mutate(lead.personId);
                              return;
                            }
                            upsertStaffing.mutate({ personId, departmentId: dept.id, isLead: true });
                          }}
                        >
                          <SelectTrigger className="bg-white/5 border-white/10 text-white h-10">
                            <SelectValue placeholder="Unassigned lead" />
                          </SelectTrigger>
                          <SelectContent className="bg-[#16161f] border-white/10 text-white">
                            <SelectItem value="__none__">Unassigned lead</SelectItem>
                            {people.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <ShowJobsEditor
                      eventId={eventId}
                      show={show}
                      venues={venues}
                      people={people}
                      departmentId={dept.id}
                      title={`${dept.name} jobs`}
                    />
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ShowEventCard({
  eventId,
  show,
  eventTeams,
  venues,
  people,
  updateShow,
  deleteShow,
}: {
  eventId: string;
  show: EventShow;
  eventTeams: EventTeam[];
  venues: { id: string; name: string }[] | undefined;
  people: Person[];
  updateShow: { mutate: (a: { showId: string; body: Record<string, unknown> }) => void };
  deleteShow: { mutate: (id: string) => void };
}) {
  const patch = (body: Record<string, unknown>) => updateShow.mutate({ showId: show.id, body });

  /** Local note text: controlled value must not track the query on every keystroke or saves race and drop characters. */
  const [technicalNotes, setTechnicalNotes] = useState(() => show.technicalNotes ?? "");
  const [fohNotes, setFohNotes] = useState(() => show.fohNotes ?? "");
  const techDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fohDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTechnicalNotes(show.technicalNotes ?? "");
    setFohNotes(show.fohNotes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notes stay local until save; reset only on show row change
  }, [show.id]);

  useEffect(
    () => () => {
      if (techDebounce.current) clearTimeout(techDebounce.current);
      if (fohDebounce.current) clearTimeout(fohDebounce.current);
    },
    []
  );

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <ShowTimeEditor show={show} venues={venues} onUpdate={patch} />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-white/30 hover:text-red-400"
          onClick={() => {
            if (!confirmDeleteAction("show")) return;
            deleteShow.mutate(show.id);
          }}
        >
          <Trash2 size={13} />
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <FieldLabel>Technical tab notes</FieldLabel>
          <Textarea
            value={technicalNotes}
            placeholder="Lx, rigger, power, load in..."
            onChange={(e) => {
              const v = e.target.value;
              setTechnicalNotes(v);
              if (techDebounce.current) clearTimeout(techDebounce.current);
              techDebounce.current = setTimeout(() => {
                patch({ technicalNotes: v });
                techDebounce.current = null;
              }, 400);
            }}
            onBlur={(e) => {
              if (techDebounce.current) {
                clearTimeout(techDebounce.current);
                techDebounce.current = null;
                patch({ technicalNotes: e.currentTarget.value });
              }
            }}
            className="bg-white/5 border-white/10 text-white min-h-[90px]"
          />
        </div>
        <div>
          <FieldLabel>FOH tab notes</FieldLabel>
          <Textarea
            value={fohNotes}
            placeholder="Tickets, bar, hospitality…"
            onChange={(e) => {
              const v = e.target.value;
              setFohNotes(v);
              if (fohDebounce.current) clearTimeout(fohDebounce.current);
              fohDebounce.current = setTimeout(() => {
                patch({ fohNotes: v });
                fohDebounce.current = null;
              }, 400);
            }}
            onBlur={(e) => {
              if (fohDebounce.current) {
                clearTimeout(fohDebounce.current);
                fohDebounce.current = null;
                patch({ fohNotes: e.currentTarget.value });
              }
            }}
            className="bg-white/5 border-white/10 text-white min-h-[90px]"
          />
        </div>
      </div>

      <ShowStaffingSections
        eventId={eventId}
        show={show}
        eventTeams={eventTeams}
        venues={venues}
        people={people}
      />
    </div>
  );
}

function ShowsTab({ event }: { event: EventDetail }) {
  const queryClient = useQueryClient();
  const { data: venues } = useQuery({
    queryKey: ["venues"],
    queryFn: () => api.get<Venue[]>("/api/venues"),
  });
  const { data: allPeople = [] } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<Person[]>("/api/people"),
  });
  const [creating, setCreating] = useState(false);
  const [newShow, setNewShow] = useState<NewShowFormState>({
    showDate: "",
    showTime: "",
    endTime: "",
    durationMinutes: "120",
    venueId: event.venueId ?? "",
  });
  const newStartRef = useRef<SplitTimeFieldHandle>(null);
  const newEndRef = useRef<SplitTimeFieldHandle>(null);
  const newDurRef = useRef<SplitTimeFieldHandle>(null);

  const createShow = useMutation({
    mutationFn: () =>
      api.post(`/api/events/${event.id}/shows`, {
        showDate: newShow.showDate,
        showTime: newShow.showTime,
        durationMinutes: Number(newShow.durationMinutes),
        venueId: newShow.venueId,
      }),
    onSuccess: () => {
      setCreating(false);
      setNewShow({ showDate: "", showTime: "", endTime: "", durationMinutes: "120", venueId: event.venueId ?? "" });
      queryClient.invalidateQueries({ queryKey: ["event", event.id] });
      void invalidateWorkAnnouncementBar(queryClient);
    },
  });

  const updateShow = useMutation({
    mutationFn: ({ showId, body }: { showId: string; body: Record<string, unknown> }) =>
      api.put(`/api/events/${event.id}/shows/${showId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", event.id] });
      void invalidateWorkAnnouncementBar(queryClient);
    },
  });

  const deleteShow = useMutation({
    mutationFn: (showId: string) => api.delete(`/api/events/${event.id}/shows/${showId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", event.id] });
      void invalidateWorkAnnouncementBar(queryClient);
    },
  });

  const sortedShows = useMemo(
    () =>
      [...event.shows].sort((a, b) => {
        const d = a.showDate.localeCompare(b.showDate);
        if (d !== 0) return d;
        return a.showTime.localeCompare(b.showTime);
      }),
    [event.shows]
  );

  useEffect(() => {
    setNewShow((prev) =>
      prev.venueId
        ? prev
        : { ...prev, venueId: event.venueId ?? "" }
    );
  }, [event.venueId]);

  const previousShow = sortedShows.length > 0 ? sortedShows[sortedShows.length - 1] : null;
  const availablePeople = allPeople;

  const copyPreviousShow = useMutation({
    mutationFn: () => {
      if (!previousShow) throw new Error("No previous show available");
      const base = new Date(previousShow.showDate);
      const shifted = new Date(base.getTime());
      shifted.setUTCDate(shifted.getUTCDate() + 1);
      const nextDate = shifted.toISOString().slice(0, 10);
      return api.post(`/api/events/${event.id}/shows`, {
        showDate: nextDate,
        showTime: previousShow.showTime,
        durationMinutes: previousShow.durationMinutes,
        venueId: previousShow.venueId,
        technicalNotes: previousShow.technicalNotes ?? undefined,
        fohNotes: previousShow.fohNotes ?? undefined,
        ticketNotes: previousShow.ticketNotes ?? undefined,
        hospitalityNotes: previousShow.hospitalityNotes ?? undefined,
        teamResponsibleId: previousShow.teamResponsibleId ?? undefined,
        notes: previousShow.notes ?? undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", event.id] });
      void invalidateWorkAnnouncementBar(queryClient);
    },
  });


  return (
    <div className="space-y-4">
      {creating ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-3">
          <div className="flex flex-nowrap items-end gap-3 min-w-0 overflow-x-auto pb-0.5">
            <div>
              <FieldLabel>Date</FieldLabel>
              <DateInputWithWeekday
                value={newShow.showDate}
                onChange={(v) => setNewShow((s) => mergeNewShowState(s, { showDate: v }))}
                className="bg-white/5 border-white/10 text-white [color-scheme:dark]"
                weekdayClassName="text-sm text-white/45"
              />
            </div>
            <div>
              <FieldLabel>Start</FieldLabel>
              <SplitTimeInput
                ref={newStartRef}
                value={newShow.showTime}
                nextFieldRef={newEndRef}
                aria-label="Start"
                onChange={(v) => setNewShow((s) => mergeNewShowState(s, { showTime: v }))}
              />
            </div>
            <div>
              <FieldLabel>End</FieldLabel>
              <SplitTimeInput
                ref={newEndRef}
                value={newShow.endTime}
                nextFieldRef={newDurRef}
                aria-label="End"
                disabled={!/^\d{2}:\d{2}$/.test(newShow.showTime)}
                onChange={(v) => setNewShow((s) => mergeNewShowState(s, { endTime: v }))}
              />
            </div>
            <div>
              <FieldLabel>Duration</FieldLabel>
              <SplitDurationHhMmInput
                ref={newDurRef}
                valueMinutes={Number(newShow.durationMinutes) || 0}
                aria-label="Duration"
                disabled={!/^\d{2}:\d{2}$/.test(newShow.showTime)}
                onChangeMinutes={(m) => {
                  setNewShow((s) => mergeNewShowState(s, { durationMinutes: String(m) }));
                }}
              />
            </div>
            <div className="min-w-0 flex-1 max-w-xs">
              <FieldLabel>Venue</FieldLabel>
              <Select value={newShow.venueId} onValueChange={(v) => setNewShow((s) => mergeNewShowState(s, { venueId: v }))}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white w-full min-w-0">
                  <SelectValue placeholder="Venue" />
                </SelectTrigger>
                <SelectContent className="bg-[#16161f] border-white/10 text-white">
                  {(venues ?? []).map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              className="bg-red-900 hover:bg-red-800 text-white"
              disabled={!newShow.showDate || !newShow.showTime || !newShow.durationMinutes || !newShow.venueId || createShow.isPending}
              onClick={() => createShow.mutate()}
            >
              {createShow.isPending ? "Adding..." : "Create show"}
            </Button>
            <Button size="sm" variant="outline" className="border-white/10 text-white/70 bg-transparent" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
      ) : null}

      {sortedShows.length === 0 ? (
        <div className="text-center text-white/35 text-sm py-10">No shows yet. Add the first show to start planning technical, FOH, and team staffing.</div>
      ) : (
        <div className="space-y-3">
          {sortedShows.map((show: EventShow) => (
            <ShowEventCard
              key={show.id}
              eventId={event.id}
              show={show}
              eventTeams={event.teams ?? []}
              venues={venues}
              people={availablePeople}
              updateShow={updateShow}
              deleteShow={deleteShow}
            />
          ))}
        </div>
      )}
      <div className="space-y-2 pt-1">
        <p className="text-xs text-white/45">{sortedShows.length} show{sortedShows.length === 1 ? "" : "s"}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="bg-white/5 border border-white/10 hover:bg-white/10 text-white" onClick={() => setCreating((v) => !v)}>
            <Plus size={13} className="mr-1" /> Add show
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-white/10 text-white/80 bg-transparent"
            onClick={() => copyPreviousShow.mutate()}
            disabled={!previousShow || copyPreviousShow.isPending}
          >
            {copyPreviousShow.isPending ? "Copying..." : "Copy previous +1 day"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TeamsTab({ event }: { event: EventDetail }) {
  const queryClient = useQueryClient();
  const backendBase = import.meta.env.VITE_BACKEND_URL || "";
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [addTeamId, setAddTeamId] = useState("");
  const [noteToTeamId, setNoteToTeamId] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteBody, setEditingNoteBody] = useState("");
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadType, setUploadType] = useState("other");

  function errMsg(e: unknown, fallback: string) {
    if (isApiError(e)) return e.message;
    if (e instanceof Error && e.message) return e.message;
    return fallback;
  }

  const { data: allDepartments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Department[]>("/api/departments"),
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["event", event.id, "teams"],
    queryFn: () => api.get<EventTeam[]>(`/api/events/${event.id}/teams`),
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["event", event.id, "team-notes"],
    queryFn: () => api.get<EventTeamNote[]>(`/api/events/${event.id}/team-notes`),
  });

  const { data: documents = [] } = useQuery({
    queryKey: ["event", event.id, "team-docs", selectedTeam],
    queryFn: () => api.get<TeamDocument[]>(`/api/events/${event.id}/teams/${selectedTeam}/documents`),
    enabled: Boolean(selectedTeam),
  });

  const addTeamMutation = useMutation({
    mutationFn: (teamId: string) => api.post(`/api/events/${event.id}/teams`, { teamId }),
    onSuccess: () => {
      setAddTeamId("");
      queryClient.invalidateQueries({ queryKey: ["event", event.id, "teams"] });
      queryClient.invalidateQueries({ queryKey: ["event", event.id] });
    },
    onError: (e) =>
      toast({ title: "Could not add team", description: errMsg(e, "Save failed"), variant: "destructive" }),
  });

  const removeTeamMutation = useMutation({
    mutationFn: (teamId: string) => api.delete(`/api/events/${event.id}/teams/${teamId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", event.id, "teams"] });
      queryClient.invalidateQueries({ queryKey: ["event", event.id] });
    },
    onError: (e) =>
      toast({ title: "Could not remove team", description: errMsg(e, "Remove failed"), variant: "destructive" }),
  });

  const createNoteMutation = useMutation({
    mutationFn: (payload: { fromTeamId: string; toTeamId: string; body: string }) =>
      api.post(`/api/events/${event.id}/team-notes`, payload),
    onSuccess: () => {
      setNoteBody("");
      queryClient.invalidateQueries({ queryKey: ["event", event.id, "team-notes"] });
      queryClient.invalidateQueries({ queryKey: ["event", event.id] });
    },
    onError: (e) =>
      toast({ title: "Could not add note", description: errMsg(e, "Save failed"), variant: "destructive" }),
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ noteId, body }: { noteId: string; body: string }) =>
      api.patch(`/api/events/${event.id}/team-notes/${noteId}`, { body }),
    onSuccess: () => {
      setEditingNoteId(null);
      setEditingNoteBody("");
      queryClient.invalidateQueries({ queryKey: ["event", event.id, "team-notes"] });
      queryClient.invalidateQueries({ queryKey: ["event", event.id] });
    },
    onError: (e) =>
      toast({ title: "Could not update note", description: errMsg(e, "Save failed"), variant: "destructive" }),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: string) => api.delete(`/api/events/${event.id}/team-notes/${noteId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", event.id, "team-notes"] });
      queryClient.invalidateQueries({ queryKey: ["event", event.id] });
    },
    onError: (e) =>
      toast({ title: "Could not delete note", description: errMsg(e, "Delete failed"), variant: "destructive" }),
  });

  const uploadTeamDocMutation = useMutation({
    mutationFn: () => {
      if (!selectedTeam || !uploadFile) throw new Error("Select team and file");
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("name", uploadName || uploadFile.name);
      form.append("type", uploadType || "other");
      return api.post(`/api/events/${event.id}/teams/${selectedTeam}/documents`, form);
    },
    onSuccess: () => {
      setUploadFile(null);
      setUploadName("");
      setUploadType("other");
      queryClient.invalidateQueries({ queryKey: ["event", event.id, "team-docs", selectedTeam] });
    },
    onError: (e) =>
      toast({ title: "Could not upload document", description: errMsg(e, "Upload failed"), variant: "destructive" }),
  });

  const deleteTeamDocMutation = useMutation({
    mutationFn: (docId: string) => api.delete(`/api/events/${event.id}/team-documents/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", event.id, "team-docs", selectedTeam] });
    },
    onError: (e) =>
      toast({ title: "Could not delete document", description: errMsg(e, "Delete failed"), variant: "destructive" }),
  });

  const teamByEventTeamId = new Map(teams.map((t) => [t.id, t.team]));
  const teamNameByEventTeamId = new Map(teams.map((t) => [t.id, t.team.name]));

  const availableTeams = allDepartments.filter((d) => !teams.some((t) => t.team.id === d.id));
  const selectedTeamRow = teams.find((t) => t.id === selectedTeam) ?? null;
  const visibleNotes = showAllNotes
    ? notes
    : notes.filter((n) => n.fromTeamId === selectedTeam || n.toTeamId === selectedTeam);

  useEffect(() => {
    if (!selectedTeam && teams.length > 0) {
      setSelectedTeam(teams[0].id);
      return;
    }
    if (selectedTeam && !teams.some((t) => t.id === selectedTeam)) {
      setSelectedTeam(teams[0]?.id ?? "");
    }
  }, [selectedTeam, teams]);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <p className="text-xs uppercase tracking-wide text-white/45">Event teams</p>
        <Tabs value={selectedTeam || undefined} onValueChange={setSelectedTeam}>
          <TabsList className="bg-transparent h-auto gap-1 p-0 flex-wrap justify-start">
            {teams.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="data-[state=active]:bg-white/15 data-[state=active]:text-white border border-white/15 text-white/65"
              >
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: t.team.color }} />
                  {t.team.name} {t.isOwner ? "(owner)" : ""}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
          <Select value={addTeamId} onValueChange={setAddTeamId}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="Add team to event..." />
            </SelectTrigger>
            <SelectContent className="bg-[#16161f] border-white/10 text-white">
              {availableTeams.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                    {d.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!addTeamId || addTeamMutation.isPending}
            className="bg-red-900 hover:bg-red-800 text-white"
            onClick={() => addTeamMutation.mutate(addTeamId)}
          >
            Add team
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!selectedTeam || removeTeamMutation.isPending}
            className="border-white/10 text-white/70 bg-transparent"
            onClick={() => {
              if (!selectedTeam) return;
              const teamName = teamNameByEventTeamId.get(selectedTeam) || "team";
              if (!confirmDeleteAction(`team "${teamName}" from event`)) return;
              removeTeamMutation.mutate(selectedTeam);
            }}
          >
            Remove selected
          </Button>
        </div>
        {selectedTeamRow ? (
          <p className="text-xs text-white/45">
            Active team tab:{" "}
            <span className="inline-flex items-center gap-1.5 text-white/75">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: selectedTeamRow.team.color }} />
              {selectedTeamRow.team.name}
            </span>
          </p>
        ) : null}
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <p className="text-xs uppercase tracking-wide text-white/45">Directed notes</p>
        <div className="flex items-center justify-between">
          <p className="text-xs text-white/45">
            {showAllNotes ? "Showing all notes" : "Showing notes for selected team"}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-white/10 text-white/70 bg-transparent"
            onClick={() => setShowAllNotes((v) => !v)}
          >
            {showAllNotes ? "Show selected team" : "Show all"}
          </Button>
        </div>
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <Select value={selectedTeam} onValueChange={setSelectedTeam}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="From team" />
            </SelectTrigger>
            <SelectContent className="bg-[#16161f] border-white/10 text-white">
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: t.team.color }} />
                    {t.team.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={noteToTeamId} onValueChange={setNoteToTeamId}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="To team" />
            </SelectTrigger>
            <SelectContent className="bg-[#16161f] border-white/10 text-white">
              {teams
                .filter((t) => t.id !== selectedTeam)
                .map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: t.team.color }} />
                      {t.team.name}
                    </span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!selectedTeam || !noteToTeamId || !noteBody.trim() || createNoteMutation.isPending}
            className="bg-red-900 hover:bg-red-800 text-white"
            onClick={() =>
              createNoteMutation.mutate({
                fromTeamId: selectedTeam,
                toTeamId: noteToTeamId,
                body: noteBody.trim(),
              })
            }
          >
            Add note
          </Button>
        </div>
        <Textarea
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          placeholder="Write note to another department/team..."
          className="bg-white/5 border-white/10 text-white min-h-[80px]"
        />
        <div className="space-y-2">
          {visibleNotes.length === 0 ? (
            <p className="text-sm text-white/35">No team notes yet.</p>
          ) : (
            visibleNotes.map((n) => (
              <div key={n.id} className="flex items-start justify-between gap-3 rounded border border-white/10 bg-white/[0.03] p-3">
                <div className="min-w-0">
                  <p className="text-xs text-white/45">
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: teamByEventTeamId.get(n.fromTeamId)?.color ?? "rgba(255,255,255,0.3)" }}
                      />
                      {teamNameByEventTeamId.get(n.fromTeamId) || "Unknown"}
                    </span>{" "}
                    {"->"}{" "}
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: teamByEventTeamId.get(n.toTeamId)?.color ?? "rgba(255,255,255,0.3)" }}
                      />
                      {teamNameByEventTeamId.get(n.toTeamId) || "Unknown"}
                    </span>
                  </p>
                  {editingNoteId === n.id ? (
                    <div className="space-y-2 mt-1">
                      <Textarea
                        value={editingNoteBody}
                        onChange={(e) => setEditingNoteBody(e.target.value)}
                        className="bg-white/5 border-white/10 text-white min-h-[70px]"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="bg-red-900 hover:bg-red-800 text-white"
                          disabled={!editingNoteBody.trim() || updateNoteMutation.isPending}
                          onClick={() => updateNoteMutation.mutate({ noteId: n.id, body: editingNoteBody.trim() })}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-white/10 text-white/70 bg-transparent"
                          onClick={() => {
                            setEditingNoteId(null);
                            setEditingNoteBody("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-white/85 whitespace-pre-wrap">{n.body}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/30 hover:text-white"
                    onClick={() => {
                      setEditingNoteId(n.id);
                      setEditingNoteBody(n.body);
                    }}
                  >
                    <Edit2 size={13} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/30 hover:text-red-400"
                    onClick={() => {
                      if (!confirmDeleteAction("team note")) return;
                      deleteNoteMutation.mutate(n.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-3">
        <p className="text-xs uppercase tracking-wide text-white/45">Team documents</p>
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
          <Input
            type="file"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            className="bg-white/5 border-white/10 text-white file:text-white"
          />
          <Input
            value={uploadName}
            onChange={(e) => setUploadName(e.target.value)}
            placeholder="Document name"
            className="bg-white/5 border-white/10 text-white"
          />
          <Input
            value={uploadType}
            onChange={(e) => setUploadType(e.target.value)}
            placeholder="Type"
            className="bg-white/5 border-white/10 text-white"
          />
          <Button
            size="sm"
            disabled={!selectedTeam || !uploadFile || uploadTeamDocMutation.isPending}
            className="bg-red-900 hover:bg-red-800 text-white"
            onClick={() => uploadTeamDocMutation.mutate()}
          >
            Upload
          </Button>
        </div>
        <div className="space-y-2">
          {!selectedTeam ? (
            <p className="text-sm text-white/35">Select a team to view documents.</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-white/35">No documents for selected team.</p>
          ) : (
            documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between rounded border border-white/10 bg-white/[0.03] px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-white/85 truncate">{doc.name}</p>
                  <p className="text-xs text-white/45">{doc.type} · {formatDate(doc.createdAt)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <a href={`${backendBase}/api/events/${event.id}/team-documents/${doc.id}/download`} target="_blank" rel="noreferrer">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-white/25 hover:text-white">
                      <Download size={13} />
                    </Button>
                  </a>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/25 hover:text-red-400"
                    onClick={() => {
                      if (!confirmDeleteAction("team document")) return;
                      deleteTeamDocMutation.mutate(doc.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = useMatch({ path: "/events/new", end: true }) !== null;

  const { data: event, isLoading, error } = useQuery({
    queryKey: ["event", id],
    queryFn: () => api.get<EventDetail>(`/api/events/${id}`),
    enabled: !isNew && !!id,
  });

  if (!isNew) {
    if (isLoading) {
      return (
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-48 bg-white/5" />
          <Skeleton className="h-64 w-full rounded-xl bg-white/5" />
        </div>
      );
    }

    if (error || !event) {
      return (
        <div className="p-6 text-center text-red-400">
          Failed to load event.{" "}
          <button onClick={() => navigate("/events")} className="underline text-white/50 hover:text-white">
            Go back
          </button>
        </div>
      );
    }
  }

  const ev = isNew ? null : (event as EventDetail);

  return (
    <div className="p-6 space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/events")}
        className="text-white/40 hover:text-white gap-2 -ml-2"
      >
        <ArrowLeft size={14} /> Back to Events
      </Button>

      <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        <Tabs defaultValue="details">
          <div className="border-b border-white/10 px-6">
            <TabsList className="bg-transparent h-12 gap-1 p-0">
              <TabsTrigger
                value="details"
                className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-red-500 text-white/40 rounded-none h-12 px-4"
              >
                Details
              </TabsTrigger>
              <TabsTrigger
                value="shows"
                className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-red-500 text-white/40 rounded-none h-12 px-4"
              >
                Shows ({ev?.shows?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger
                value="teams"
                className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-red-500 text-white/40 rounded-none h-12 px-4"
              >
                Teams ({ev?.teams?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger
                value="people"
                className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-red-500 text-white/40 rounded-none h-12 px-4"
              >
                People ({ev?.people?.length ?? 0})
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-6">
            <TabsContent value="details" className="mt-0">
              <DetailsTab
                key={isNew ? "new" : ev!.id}
                event={isNew ? null : ev!}
                isNew={isNew}
                onCreated={(newId) => navigate(`/events/${newId}`)}
                onDeleted={() => navigate("/events")}
              />
            </TabsContent>
            <TabsContent value="shows" className="mt-0">
              {isNew ? (
                <div className="py-10 text-center text-white/35 text-sm">Create the event on the Details tab, then add shows here.</div>
              ) : (
                <ShowsTab event={ev!} />
              )}
            </TabsContent>
            <TabsContent value="people" className="mt-0">
              {isNew ? (
                <div className="py-10 text-center text-white/35 text-sm">Create the event on the Details tab, then assign people here.</div>
              ) : (
                <PeopleTab event={ev!} />
              )}
            </TabsContent>
            <TabsContent value="teams" className="mt-0">
              {isNew ? (
                <div className="py-10 text-center text-white/35 text-sm">Create the event on the Details tab, then manage teams here.</div>
              ) : (
                <TeamsTab event={ev!} />
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
