import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Event, Venue } from "@/lib/types";
import type { Department } from "../../../backend/src/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

// Frontend Zod schema (mirrors backend CreateEventSchema)
const EventFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  status: z.enum(["draft", "confirmed", "cancelled"]).default("draft"),
  venueId: z.string().optional(),
  tags: z.string().optional(),
  contactPerson: z.string().optional(),
  actorCount: z.string().optional(),
  allergies: z.string().optional(),
  stageSize: z.string().optional(),
  getInTime: z.string().optional(),
  setupTime: z.string().optional(),
});

type EventFormValues = z.infer<typeof EventFormSchema>;

type CustomField = { key: string; value: string; departments: string[] };

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

export default function NewEvent() {
  const navigate = useNavigate();
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  const { data: venues } = useQuery({
    queryKey: ["venues"],
    queryFn: () => api.get<Venue[]>("/api/venues"),
  });

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Department[]>("/api/departments"),
  });

  const form = useForm<EventFormValues>({
    resolver: zodResolver(EventFormSchema),
    defaultValues: {
      title: "",
      description: "",
      startDate: "",
      endDate: "",
      status: "draft",
      venueId: "",
      tags: "",
      contactPerson: "",
      actorCount: "",
      allergies: "",
      stageSize: "",
      getInTime: "",
      setupTime: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post<Event>("/api/events", data),
    onSuccess: (event) => {
      navigate(`/events/${event.id}`);
    },
  });

  function onSubmit(values: EventFormValues) {
    const payload: Record<string, unknown> = {
      title: values.title,
      startDate: values.startDate,
      status: values.status,
    };

    if (values.venueId && values.venueId !== "__none__") payload.venueId = values.venueId;
    if (values.endDate) payload.endDate = values.endDate;
    if (values.description) payload.description = values.description;
    if (values.tags) payload.tags = values.tags;
    if (values.contactPerson) payload.contactPerson = values.contactPerson;
    if (values.allergies) payload.allergies = values.allergies;
    if (values.stageSize) payload.stageSize = values.stageSize;
    if (values.getInTime) payload.getInTime = values.getInTime;
    if (values.setupTime) payload.setupTime = values.setupTime;
    if (values.actorCount) payload.actorCount = Number(values.actorCount);
    if (customFields.length > 0) payload.customFields = JSON.stringify(customFields);

    createMutation.mutate(payload);
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

  const depts = departments ?? [];

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/events")}
        className="text-white/40 hover:text-white gap-2 -ml-2"
      >
        <ArrowLeft size={14} /> Back to Events
      </Button>

      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-6">Create New Event</h2>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* ── Core fields ── */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/70 text-sm">Title *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g. A Midsummer Night's Dream"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
                    />
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
                  <FormLabel className="text-white/70 text-sm">Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Optional description..."
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-none"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage className="text-red-400 text-xs" />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/70 text-sm">Start Date & Time *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="datetime-local"
                        className="bg-white/5 border-white/10 text-white focus:border-white/30 [color-scheme:dark]"
                      />
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
                    <FormLabel className="text-white/70 text-sm">End Date & Time</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        type="datetime-local"
                        className="bg-white/5 border-white/10 text-white focus:border-white/30 [color-scheme:dark]"
                      />
                    </FormControl>
                    <FormMessage className="text-red-400 text-xs" />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/70 text-sm">Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white focus:border-white/30">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-[#16161f] border-white/10 text-white">
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-red-400 text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="venueId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/70 text-sm">Venue</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white focus:border-white/30">
                          <SelectValue placeholder="No venue" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-[#16161f] border-white/10 text-white">
                        <SelectItem value="__none__">No venue</SelectItem>
                        {(venues ?? []).map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-red-400 text-xs" />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/70 text-sm">Tags</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="e.g. drama, mainstage, summer"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
                    />
                  </FormControl>
                  <FormMessage className="text-red-400 text-xs" />
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
                  <FormLabel className="text-white/70 text-sm">Contact Person</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Name and phone number"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="actorCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/70 text-sm">Actor Count</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      type="number"
                      min={0}
                      placeholder="e.g. 12"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="allergies"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/70 text-sm">Allergies / Dietary Requirements</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Any allergies or dietary requirements"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-none"
                      rows={2}
                    />
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
                  <FormLabel className="text-white/70 text-sm">Stage Size</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="e.g. 12m × 8m"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField
                control={form.control}
                name="getInTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/70 text-sm">Get-in Time</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder="e.g. 14:00"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
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
                    <FormLabel className="text-white/70 text-sm">Setup Time</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        placeholder="e.g. 09:00"
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* ── Additional Info (custom fields) ── */}
            <SectionHeader>Additional Info</SectionHeader>

            <div className="space-y-3">
              {customFields.map((field, idx) => (
                <div
                  key={idx}
                  className="bg-white/[0.02] border border-white/[0.07] rounded-lg p-3 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={field.key}
                      onChange={(e) => updateCustomField(idx, { key: e.target.value })}
                      placeholder="Label"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 text-sm h-8"
                    />
                    <Input
                      value={field.value}
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
                          selected={field.departments.includes(dept.id)}
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

            {createMutation.isError && (
              <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                {createMutation.error instanceof Error
                  ? createMutation.error.message
                  : "Failed to create event."}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/events")}
                className="border-white/10 text-white/60 hover:text-white hover:border-white/20 bg-transparent"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50"
              >
                {createMutation.isPending ? "Creating..." : "Create Event"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
