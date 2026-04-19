import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Edit2, Trash2, Plus, X, Download, Upload } from "lucide-react";
import { api } from "@/lib/api";
import type { EventDetail, Person, EventPerson, Document } from "@/lib/types";
import type { Department } from "../../../backend/src/types";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate } from "@/lib/dateUtils";
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

const EventEditSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
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
});

type EventEditValues = z.infer<typeof EventEditSchema>;
type CustomField = { key: string; value: string; departments: string[] };

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

  const [customFields, setCustomFields] = useState<CustomField[]>(parsedCustomFields);

  const { data: venues } = useQuery({
    queryKey: ["venues"],
    queryFn: () => api.get<{ id: string; name: string }[]>("/api/venues"),
  });

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Department[]>("/api/departments"),
  });

  const depts = departments ?? [];

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
      startDate: values.startDate,
      status: values.status,
    };
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
    payload.customFields = customFields.length > 0 ? JSON.stringify(customFields) : undefined;

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
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Start</FormLabel>
                    <FormControl>
                      <Input {...field} type="datetime-local" className="bg-white/5 border-white/10 text-white focus:border-white/30 [color-scheme:dark]" />
                    </FormControl>
                    <FormMessage className="text-red-400 text-xs" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/60 text-xs uppercase tracking-wide">End</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} type="datetime-local" className="bg-white/5 border-white/10 text-white focus:border-white/30 [color-scheme:dark]" />
                    </FormControl>
                  </FormItem>
                )}
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
                      <Input {...field} value={field.value ?? ""} placeholder="e.g. 14:00" className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30" />
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
                      <Input {...field} value={field.value ?? ""} placeholder="e.g. 09:00" className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30" />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

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
        <InfoRow label="Start" value={formatDate(event.startDate)} />
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

      {parsedCustomFields.length > 0 ? (
        <div>
          <div className="text-xs text-white/40 uppercase tracking-widest mb-3 pb-2 border-b border-white/[0.06]">
            Additional Info
          </div>
          <div className="space-y-2">
            {parsedCustomFields.map((cf, idx) => {
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
              onClick={() => deleteMutation.mutate()}
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
                onClick={() => removeMutation.mutate(ep.id)}
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
              onClick={() => { if (deleteDocId) deleteMutation.mutate(deleteDocId); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
      <div className="p-6 max-w-5xl mx-auto space-y-4">
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
    <div className="p-6 max-w-5xl mx-auto space-y-6">
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
            <TabsContent value="documents" className="mt-0">
              <DocumentsTab event={event} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
