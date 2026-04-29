import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Edit2, Trash2, Plus, X, Download, Upload } from "lucide-react";
import { api, isApiError } from "@/lib/api";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import type { EventDetail, EventTeam, EventTeamNote, Person, EventPerson, Document, EventShow } from "@/lib/types";
import type { Department } from "../../../backend/src/types";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate } from "@/lib/dateUtils";
import { DateInputWithWeekday } from "@/components/DateInputWithWeekday";
import { SplitDurationHhMmInput, SplitTimeInput, type SplitTimeFieldHandle } from "@/components/SplitTimeField";
import { DatetimeScheduleFields } from "@/components/DatetimeScheduleFields";
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
import { toast } from "@/hooks/use-toast";

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
  /** Optional: events without shows may have no event-level dates. */
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(["draft", "confirmed", "cancelled"]),
  venueId: z.string().optional(),
  tags: z.string().optional(),
  contactPerson: z.string().optional(),
  actorCount: z.string().optional(),
  allergies: z.string().optional(),
  stageSize: z.string().optional(),
  getInTime: z.string().optional(),
  setupTime: z.string().optional(),
  bookingContracts: z.string().optional(),
  technicalRider: z.string().optional(),
  techCount: z.string().optional(),
  handsNeeded: z.string().optional(),
  getInDate: z.string().optional(),
  ticketingInfo: z.string().optional(),
  hospitalityInfo: z.string().optional(),
  fohNotes: z.string().optional(),
});

type EventEditValues = z.infer<typeof EventEditSchema>;
type CustomField = { key: string; value: string; departments: string[] };
type GeneralEventFields = {
  bookingContracts: string;
  technicalRider: string;
  techCount: string;
  handsNeeded: string;
  getInDate: string;
  ticketingInfo: string;
  hospitalityInfo: string;
  fohNotes: string;
};

function splitGeneralEventFields(fields: CustomField[]): {
  general: GeneralEventFields;
  rest: CustomField[];
} {
  const general: GeneralEventFields = {
    bookingContracts: "",
    technicalRider: "",
    techCount: "",
    handsNeeded: "",
    getInDate: "",
    ticketingInfo: "",
    hospitalityInfo: "",
    fohNotes: "",
  };
  const rest: CustomField[] = [];
  for (const field of fields) {
    const key = field.key?.trim();
    const value = field.value ?? "";
    if (key === "Contracts") {
      general.bookingContracts = value;
      continue;
    }
    if (key === "Technical rider") {
      general.technicalRider = value;
      continue;
    }
    if (key === "Tech count") {
      general.techCount = value;
      continue;
    }
    if (key === "Hands needed") {
      general.handsNeeded = value;
      continue;
    }
    if (key === "Get-in date") {
      general.getInDate = value;
      continue;
    }
    if (key === "Ticketing") {
      general.ticketingInfo = value;
      continue;
    }
    if (key === "Hospitality") {
      general.hospitalityInfo = value;
      continue;
    }
    if (key === "FOH notes") {
      general.fohNotes = value;
      continue;
    }
    rest.push(field);
  }
  return { general, rest };
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs text-white/40 uppercase tracking-widest mb-3 mt-6 pb-2 border-b border-white/[0.06]">
      {children}
    </div>
  );
}

function DeptBadge({
  dept,
  selected,
  onToggle,
}: {
  dept: Department;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="px-2 py-0.5 rounded text-xs font-medium border transition-all"
      style={
        selected
          ? {
              backgroundColor: dept.color + "33",
              borderColor: dept.color + "66",
              color: dept.color,
            }
          : {
              backgroundColor: "transparent",
              borderColor: "rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.35)",
            }
      }
    >
      {dept.name}
    </button>
  );
}

function DeptTag({ dept }: { dept: Department }) {
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-medium border"
      style={{
        backgroundColor: dept.color + "22",
        borderColor: dept.color + "44",
        color: dept.color,
      }}
    >
      {dept.name}
    </span>
  );
}

// ── Details Tab ──────────────────────────────────────────────────────────────

function DetailsTab({ event, onDeleted }: { event: EventDetail; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const parsedCustomFields: CustomField[] = (() => {
    try {
      return event.customFields ? (JSON.parse(event.customFields) as CustomField[]) : [];
    } catch {
      return [];
    }
  })();
  const splitFields = splitGeneralEventFields(parsedCustomFields);
  const [customFields, setCustomFields] = useState<CustomField[]>(splitFields.rest);

  const { data: venues } = useQuery({
    queryKey: ["venues"],
    queryFn: () => api.get<{ id: string; name: string }[]>("/api/venues"),
  });

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Department[]>("/api/departments"),
  });

  const depts = departments ?? [];
  const setupTimeFieldRef = useRef<SplitTimeFieldHandle>(null);

  const form = useForm<EventEditValues>({
    resolver: zodResolver(EventEditSchema),
    values: {
      title: event.title,
      description: event.description ?? "",
      startDate: event.startDate ? event.startDate.slice(0, 16) : "",
      endDate: event.endDate ? event.endDate.slice(0, 16) : "",
      status: event.status,
      venueId: event.venueId ?? "",
      tags: event.tags ?? "",
      contactPerson: event.contactPerson ?? "",
      actorCount: event.actorCount != null ? String(event.actorCount) : "",
      allergies: event.allergies ?? "",
      stageSize: event.stageSize ?? "",
      getInTime: event.getInTime ?? "",
      setupTime: event.setupTime ?? "",
      bookingContracts: splitFields.general.bookingContracts,
      technicalRider: splitFields.general.technicalRider,
      techCount: splitFields.general.techCount,
      handsNeeded: splitFields.general.handsNeeded,
      getInDate: splitFields.general.getInDate,
      ticketingInfo: splitFields.general.ticketingInfo,
      hospitalityInfo: splitFields.general.hospitalityInfo,
      fohNotes: splitFields.general.fohNotes,
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.put(`/api/events/${event.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", event.id] });
      setEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/events/${event.id}`),
    onSuccess: onDeleted,
  });

  function onSubmit(values: EventEditValues) {
    const payload: Record<string, unknown> = {
      title: values.title,
      status: values.status,
    };
    if (values.startDate?.trim()) payload.startDate = values.startDate;
    else payload.startDate = null;
    if (values.venueId && values.venueId !== "__none__") payload.venueId = values.venueId;
    else payload.venueId = undefined;
    if (values.endDate) payload.endDate = values.endDate;
    if (values.description) payload.description = values.description;
    if (values.tags) payload.tags = values.tags;
    if (values.contactPerson) payload.contactPerson = values.contactPerson;
    if (values.allergies) payload.allergies = values.allergies;
    if (values.stageSize) payload.stageSize = values.stageSize;
    if (values.getInTime) payload.getInTime = values.getInTime;
    if (values.setupTime) payload.setupTime = values.setupTime;
    if (values.actorCount) payload.actorCount = Number(values.actorCount);
    const normalizedCustomFields = customFields.filter((f) => f.key.trim() || f.value.trim());
    const generalFields = [
      { key: "Contracts", value: values.bookingContracts?.trim() || "" },
      { key: "Technical rider", value: values.technicalRider?.trim() || "" },
      { key: "Tech count", value: values.techCount?.trim() || "" },
      { key: "Hands needed", value: values.handsNeeded?.trim() || "" },
      { key: "Get-in date", value: values.getInDate?.trim() || "" },
      { key: "Ticketing", value: values.ticketingInfo?.trim() || "" },
      { key: "Hospitality", value: values.hospitalityInfo?.trim() || "" },
      { key: "FOH notes", value: values.fohNotes?.trim() || "" },
    ]
      .filter((row) => row.value)
      .map((row) => ({ ...row, departments: [] as string[] }));
    const mergedCustomFields = [...normalizedCustomFields, ...generalFields];
    payload.customFields = mergedCustomFields.length > 0 ? JSON.stringify(mergedCustomFields) : undefined;

    updateMutation.mutate(payload);
  }

  function addCustomField() {
    setCustomFields((prev) => [...prev, { key: "", value: "", departments: [] }]);
  }

  function removeCustomField(idx: number) {
    setCustomFields((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateCustomField(idx: number, patch: Partial<CustomField>) {
    setCustomFields((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, ...patch } : f))
    );
  }

  function toggleDept(fieldIdx: number, deptId: string) {
    setCustomFields((prev) =>
      prev.map((f, i) => {
        if (i !== fieldIdx) return f;
        const already = f.departments.includes(deptId);
        return {
          ...f,
          departments: already
            ? f.departments.filter((d) => d !== deptId)
            : [...f.departments, deptId],
        };
      })
    );
  }

  if (editing) {
    return (
      <div className="space-y-5">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
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
                  <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} className="bg-white/5 border-white/10 text-white focus:border-white/30 resize-none" rows={3} />
                  </FormControl>
                </FormItem>
              )}
            />
            <p className="text-sm text-white/40">
              Show date, time, and venue are set per show in the <strong className="text-white/60">Shows</strong> tab. You can
              optionally set a rough event window here for the list and calendar.
            </p>
            <div className="space-y-2">
              <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Event window (optional)</FormLabel>
              <DatetimeScheduleFields
                startValue={form.watch("startDate") || ""}
                endValue={form.watch("endDate") ?? ""}
                onStartChange={(v) => form.setValue("startDate", v, { shouldDirty: true, shouldValidate: true })}
                onEndChange={(v) => form.setValue("endDate", v, { shouldDirty: true })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
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
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Venue</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white">
                          <SelectValue placeholder="No venue" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-[#16161f] border-white/10 text-white">
                        <SelectItem value="__none__">No venue</SelectItem>
                        {(venues ?? []).map((v) => (
                          <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Tags</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} className="bg-white/5 border-white/10 text-white focus:border-white/30" />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* ── Production Info ── */}
            <SectionHeader>Production Info</SectionHeader>

            <FormField
              control={form.control}
              name="contactPerson"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Contact Person</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} placeholder="Name and phone number" className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30" />
                  </FormControl>
                </FormItem>
              )}
            />

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

            {/* ── Technical ── */}
            <SectionHeader>Technical</SectionHeader>

            <FormField
              control={form.control}
              name="stageSize"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Stage Size</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} placeholder="e.g. 12m × 8m" className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30" />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="getInTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Get-in Time</FormLabel>
                    <FormControl>
                      <SplitTimeInput
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        nextFieldRef={setupTimeFieldRef}
                        aria-label="Get-in time"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="setupTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Setup Time</FormLabel>
                    <FormControl>
                      <SplitTimeInput
                        ref={setupTimeFieldRef}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        aria-label="Setup time"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <SectionHeader>Booking / Technical / FOH (General)</SectionHeader>

            <FormField
              control={form.control}
              name="bookingContracts"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Contracts</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} className="bg-white/5 border-white/10 text-white focus:border-white/30" />
                  </FormControl>
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="technicalRider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Technical Rider</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} className="bg-white/5 border-white/10 text-white focus:border-white/30" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="techCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Tech Count</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} className="bg-white/5 border-white/10 text-white focus:border-white/30" />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="handsNeeded"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Hands Needed</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} className="bg-white/5 border-white/10 text-white focus:border-white/30" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="getInDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Get-in Date</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} className="bg-white/5 border-white/10 text-white focus:border-white/30" />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="ticketingInfo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Ticketing</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} className="bg-white/5 border-white/10 text-white focus:border-white/30" />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="hospitalityInfo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Hospitality</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} className="bg-white/5 border-white/10 text-white focus:border-white/30" />
                  </FormControl>
                </FormItem>
              )}
            />
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

            {/* ── Additional Info ── */}
            <SectionHeader>Additional Info</SectionHeader>

            <div className="space-y-3">
              {customFields.map((cf, idx) => (
                <div
                  key={idx}
                  className="bg-white/[0.02] border border-white/[0.07] rounded-lg p-3 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={cf.key}
                      onChange={(e) => updateCustomField(idx, { key: e.target.value })}
                      placeholder="Label"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 text-sm h-8"
                    />
                    <Input
                      value={cf.value}
                      onChange={(e) => updateCustomField(idx, { value: e.target.value })}
                      placeholder="Value"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 text-sm h-8"
                    />
                    <button
                      type="button"
                      onClick={() => removeCustomField(idx)}
                      className="text-white/25 hover:text-red-400 transition-colors flex-shrink-0 p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {depts.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs text-white/30 self-center mr-1">Departments:</span>
                      {depts.map((dept) => (
                        <DeptBadge
                          key={dept.id}
                          dept={dept}
                          selected={cf.departments.includes(dept.id)}
                          onToggle={() => toggleDept(idx, dept.id)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}

              <button
                type="button"
                onClick={addCustomField}
                className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors py-1"
              >
                <Plus size={13} /> Add Field
              </button>
            </div>

            {updateMutation.isError && (
              <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                {updateMutation.error instanceof Error
                  ? updateMutation.error.message
                  : "Failed to save changes."}
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={updateMutation.isPending} className="bg-red-900 hover:bg-red-800 text-white border-red-700/50">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(false)} className="border-white/10 text-white/60 hover:text-white bg-transparent">
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </div>
    );
  }

  // ── View mode ────────────────────────────────────────────────────────────

  const hasProductionInfo =
    event.contactPerson || event.actorCount != null || event.allergies;
  const hasTechnical = event.stageSize || event.getInTime || event.setupTime;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-white">{event.title}</h2>
          {event.description ? (
            <p className="text-white/50 text-sm leading-relaxed">{event.description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={event.status} />
          <Button variant="ghost" size="icon" onClick={() => setEditing(true)} className="h-8 w-8 text-white/40 hover:text-white">
            <Edit2 size={14} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <InfoRow label="Event window" value={formatDate(event.startDate)} />
        <InfoRow label="End" value={formatDate(event.endDate)} />
        <InfoRow label="Venue" value={event.venue?.name ?? "—"} />
        <InfoRow label="Tags" value={event.tags ?? "—"} />
      </div>

      {hasProductionInfo ? (
        <div>
          <div className="text-xs text-white/40 uppercase tracking-widest mb-3 pb-2 border-b border-white/[0.06]">
            Production Info
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {event.contactPerson ? (
              <InfoRow label="Contact Person" value={event.contactPerson} />
            ) : null}
            {event.actorCount != null ? (
              <InfoRow label="Actor Count" value={String(event.actorCount)} />
            ) : null}
            {event.allergies ? (
              <div className="sm:col-span-2">
                <InfoRow label="Allergies / Dietary" value={event.allergies} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasTechnical ? (
        <div>
          <div className="text-xs text-white/40 uppercase tracking-widest mb-3 pb-2 border-b border-white/[0.06]">
            Technical
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {event.stageSize ? (
              <InfoRow label="Stage Size" value={event.stageSize} />
            ) : null}
            {event.getInTime ? (
              <InfoRow label="Get-in Time" value={event.getInTime} />
            ) : null}
            {event.setupTime ? (
              <InfoRow label="Setup Time" value={event.setupTime} />
            ) : null}
          </div>
        </div>
      ) : null}

      {splitFields.rest.length > 0 ? (
        <div>
          <div className="text-xs text-white/40 uppercase tracking-widest mb-3 pb-2 border-b border-white/[0.06]">
            Additional Info
          </div>
          <div className="space-y-2">
            {splitFields.rest.map((cf, idx) => {
              const fieldDepts = depts.filter((d) => cf.departments.includes(d.id));
              return (
                <div
                  key={idx}
                  className="bg-white/[0.02] border border-white/[0.07] rounded-lg px-4 py-3 flex items-start justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-white/35 uppercase tracking-wide mb-0.5">{cf.key}</div>
                    <div className="text-sm text-white/80">{cf.value}</div>
                  </div>
                  {fieldDepts.length > 0 ? (
                    <div className="flex flex-wrap gap-1 flex-shrink-0">
                      {fieldDepts.map((d) => (
                        <DeptTag key={d.id} dept={d} />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {(splitFields.general.bookingContracts ||
        splitFields.general.technicalRider ||
        splitFields.general.techCount ||
        splitFields.general.handsNeeded ||
        splitFields.general.getInDate ||
        splitFields.general.ticketingInfo ||
        splitFields.general.hospitalityInfo ||
        splitFields.general.fohNotes) ? (
        <div>
          <div className="text-xs text-white/40 uppercase tracking-widest mb-3 pb-2 border-b border-white/[0.06]">
            Booking / Technical / FOH (General)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {splitFields.general.bookingContracts ? <InfoRow label="Contracts" value={splitFields.general.bookingContracts} /> : null}
            {splitFields.general.technicalRider ? <InfoRow label="Technical rider" value={splitFields.general.technicalRider} /> : null}
            {splitFields.general.techCount ? <InfoRow label="Tech count" value={splitFields.general.techCount} /> : null}
            {splitFields.general.handsNeeded ? <InfoRow label="Hands needed" value={splitFields.general.handsNeeded} /> : null}
            {splitFields.general.getInDate ? <InfoRow label="Get-in date" value={splitFields.general.getInDate} /> : null}
            {splitFields.general.ticketingInfo ? <InfoRow label="Ticketing" value={splitFields.general.ticketingInfo} /> : null}
            {splitFields.general.hospitalityInfo ? <InfoRow label="Hospitality" value={splitFields.general.hospitalityInfo} /> : null}
            {splitFields.general.fohNotes ? <InfoRow label="FOH notes" value={splitFields.general.fohNotes} /> : null}
          </div>
        </div>
      ) : null}

      <div className="pt-2 border-t border-white/10">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmDelete(true)}
          className="text-red-400/70 hover:text-red-400 hover:bg-red-500/10 gap-2"
        >
          <Trash2 size={13} /> Delete Event
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
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/[0.02] border border-white/8 rounded-lg px-4 py-3">
      <div className="text-xs text-white/35 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm text-white/80">{value}</div>
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
          className="w-[10.5rem] min-w-[10.5rem] bg-white/5 border-white/10 text-white [color-scheme:dark]"
          weekdayClassName="text-[10px] text-white/45"
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

function DocumentsTab({ event }: { event: EventDetail }) {
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
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

function ShowEventCard({
  eventId,
  show,
  venues,
  people,
  updateShow,
  deleteShow,
}: {
  eventId: string;
  show: EventShow;
  venues: { id: string; name: string }[] | undefined;
  people: Person[] | undefined;
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

      <ShowJobsEditor eventId={eventId} show={show} venues={venues} people={people} />
    </div>
  );
}

function ShowsTab({ event }: { event: EventDetail }) {
  const queryClient = useQueryClient();
  const { data: venues } = useQuery({
    queryKey: ["venues"],
    queryFn: () => api.get<{ id: string; name: string }[]>("/api/venues"),
  });
  const { data: people } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<Person[]>("/api/people"),
  });
  const [creating, setCreating] = useState(false);
  const [newShow, setNewShow] = useState<NewShowFormState>({
    showDate: "",
    showTime: "",
    endTime: "",
    durationMinutes: "120",
    venueId: "",
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
      setNewShow({ showDate: "", showTime: "", endTime: "", durationMinutes: "120", venueId: "" });
      queryClient.invalidateQueries({ queryKey: ["event", event.id] });
    },
  });

  const updateShow = useMutation({
    mutationFn: ({ showId, body }: { showId: string; body: Record<string, unknown> }) =>
      api.put(`/api/events/${event.id}/shows/${showId}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event", event.id] }),
  });

  const deleteShow = useMutation({
    mutationFn: (showId: string) => api.delete(`/api/events/${event.id}/shows/${showId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["event", event.id] }),
  });


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/45">{event.shows.length} show{event.shows.length === 1 ? "" : "s"}</p>
        <Button size="sm" className="bg-white/5 border border-white/10 hover:bg-white/10 text-white" onClick={() => setCreating((v) => !v)}>
          <Plus size={13} className="mr-1" /> Add show
        </Button>
      </div>
      {creating ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <FieldLabel>Date</FieldLabel>
              <DateInputWithWeekday
                value={newShow.showDate}
                onChange={(v) => setNewShow((s) => mergeNewShowState(s, { showDate: v }))}
                className="w-[10.5rem] min-w-[10.5rem] bg-white/5 border-white/10 text-white [color-scheme:dark]"
                weekdayClassName="text-[10px] text-white/45"
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

      {event.shows.length === 0 ? (
        <div className="text-center text-white/35 text-sm py-10">No shows yet. Add the first show to start planning technical, FOH, and team staffing.</div>
      ) : (
        <div className="space-y-3">
          {event.shows.map((show: EventShow) => (
            <ShowEventCard
              key={show.id}
              eventId={event.id}
              show={show}
              venues={venues}
              people={people}
              updateShow={updateShow}
              deleteShow={deleteShow}
            />
          ))}
        </div>
      )}
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
                {t.team.name} {t.isOwner ? "(owner)" : ""}
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
                  {d.name}
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
            Active team tab: <span className="text-white/75">{selectedTeamRow.team.name}</span>
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
                  {t.team.name}
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
                    {t.team.name}
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
                    {teamNameByEventTeamId.get(n.fromTeamId) || "Unknown"} {"->"} {teamNameByEventTeamId.get(n.toTeamId) || "Unknown"}
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

  const { data: event, isLoading, error } = useQuery({
    queryKey: ["event", id],
    queryFn: () => api.get<EventDetail>(`/api/events/${id}`),
    enabled: !!id,
  });

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
                Shows ({event.shows.length})
              </TabsTrigger>
              <TabsTrigger
                value="teams"
                className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-red-500 text-white/40 rounded-none h-12 px-4"
              >
                Teams ({event.teams?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger
                value="people"
                className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-red-500 text-white/40 rounded-none h-12 px-4"
              >
                People ({event.people.length})
              </TabsTrigger>
              <TabsTrigger
                value="documents"
                className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-red-500 text-white/40 rounded-none h-12 px-4"
              >
                Documents ({event.documents.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-6">
            <TabsContent value="details" className="mt-0">
              <DetailsTab event={event} onDeleted={() => navigate("/events")} />
            </TabsContent>
            <TabsContent value="people" className="mt-0">
              <PeopleTab event={event} />
            </TabsContent>
            <TabsContent value="shows" className="mt-0">
              <ShowsTab event={event} />
            </TabsContent>
            <TabsContent value="teams" className="mt-0">
              <TeamsTab event={event} />
            </TabsContent>
            <TabsContent value="documents" className="mt-0">
              <DocumentsTab event={event} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
