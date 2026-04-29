import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { DatetimeScheduleFields } from "@/components/DatetimeScheduleFields";
import { DateInputWithWeekday } from "@/components/DateInputWithWeekday";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Frontend Zod schema (mirrors backend CreateEventSchema)
const EventFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  startDate: z.string().optional(),
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
  bookingContracts: z.string().optional(),
  technicalRider: z.string().optional(),
  techCount: z.string().optional(),
  handsNeeded: z.string().optional(),
  getInDate: z.string().optional(),
  ticketingInfo: z.string().optional(),
  hospitalityInfo: z.string().optional(),
  fohNotes: z.string().optional(),
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
      bookingContracts: "",
      technicalRider: "",
      techCount: "",
      handsNeeded: "",
      getInDate: "",
      ticketingInfo: "",
      hospitalityInfo: "",
      fohNotes: "",
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
      status: values.status,
    };
    if (values.startDate?.trim()) payload.startDate = values.startDate;

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
    if (mergedCustomFields.length > 0) payload.customFields = JSON.stringify(mergedCustomFields);

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
                Shows
              </TabsTrigger>
              <TabsTrigger
                value="teams"
                className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-red-500 text-white/40 rounded-none h-12 px-4"
              >
                Teams
              </TabsTrigger>
              <TabsTrigger
                value="people"
                className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-red-500 text-white/40 rounded-none h-12 px-4"
              >
                People
              </TabsTrigger>
              <TabsTrigger
                value="documents"
                className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-red-500 text-white/40 rounded-none h-12 px-4"
              >
                Documents
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="p-6">
            <TabsContent value="details" className="mt-0">
              <h2 className="text-base font-semibold text-white mb-6">Create New Event</h2>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <Tabs defaultValue="booking" className="w-full">
              <TabsList className="grid grid-cols-3 w-full bg-white/[0.02] border border-white/10 p-1 h-auto">
                <TabsTrigger value="booking" className="data-[state=active]:bg-red-900 data-[state=active]:text-white text-white/60">Booking</TabsTrigger>
                <TabsTrigger value="technical" className="data-[state=active]:bg-red-900 data-[state=active]:text-white text-white/60">Technical</TabsTrigger>
                <TabsTrigger value="foh" className="data-[state=active]:bg-red-900 data-[state=active]:text-white text-white/60">FOH</TabsTrigger>
              </TabsList>

              <TabsContent value="booking" className="space-y-5 mt-5">
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem><FormLabel className="text-white/70 text-sm">Title *</FormLabel><FormControl><Input {...field} placeholder="e.g. A Midsummer Night's Dream" className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30" /></FormControl><FormMessage className="text-red-400 text-xs" /></FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem><FormLabel className="text-white/70 text-sm">Description</FormLabel><FormControl><Textarea {...field} value={field.value ?? ""} placeholder="General event description..." className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-none" rows={3} /></FormControl></FormItem>
                )} />
                <p className="text-sm text-white/40">
                  You add date, time, and venue for each <strong className="text-white/60">show</strong> on the Next tab. Optionally set a
                  general event window here.
                </p>
                <div className="space-y-2">
                  <FormLabel className="text-white/70 text-sm">Event window (optional)</FormLabel>
                  <DatetimeScheduleFields
                    startValue={form.watch("startDate") || ""}
                    endValue={form.watch("endDate") ?? ""}
                    onStartChange={(v) => form.setValue("startDate", v, { shouldDirty: true, shouldValidate: true })}
                    onEndChange={(v) => form.setValue("endDate", v, { shouldDirty: true })}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem><FormLabel className="text-white/70 text-sm">Status</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger className="bg-white/5 border-white/10 text-white focus:border-white/30"><SelectValue /></SelectTrigger></FormControl><SelectContent className="bg-[#16161f] border-white/10 text-white"><SelectItem value="draft">Draft</SelectItem><SelectItem value="confirmed">Confirmed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></FormItem>
                  )} />
                  <FormField control={form.control} name="venueId" render={({ field }) => (
                    <FormItem><FormLabel className="text-white/70 text-sm">Default venue</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value ?? ""}><FormControl><SelectTrigger className="bg-white/5 border-white/10 text-white focus:border-white/30"><SelectValue placeholder="No venue" /></SelectTrigger></FormControl><SelectContent className="bg-[#16161f] border-white/10 text-white"><SelectItem value="__none__">No venue</SelectItem>{(venues ?? []).map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="tags" render={({ field }) => (
                  <FormItem><FormLabel className="text-white/70 text-sm">Tags</FormLabel><FormControl><Input {...field} value={field.value ?? ""} placeholder="e.g. drama, mainstage, summer" className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30" /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="bookingContracts" render={({ field }) => (
                  <FormItem><FormLabel className="text-white/70 text-sm">Contracts (general)</FormLabel><FormControl><Textarea {...field} value={field.value ?? ""} placeholder="Contract status and key booking terms..." className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-none" rows={2} /></FormControl></FormItem>
                )} />
              </TabsContent>

              <TabsContent value="technical" className="space-y-5 mt-5">
                <SectionHeader>General technical info (all shows)</SectionHeader>
                <FormField control={form.control} name="contactPerson" render={({ field }) => (
                  <FormItem><FormLabel className="text-white/70 text-sm">Contact person</FormLabel><FormControl><Input {...field} value={field.value ?? ""} placeholder="Name and phone number" className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30" /></FormControl></FormItem>
                )} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FormField control={form.control} name="actorCount" render={({ field }) => (
                    <FormItem><FormLabel className="text-white/70 text-sm">Actor count</FormLabel><FormControl><Input {...field} value={field.value ?? ""} type="number" min={0} placeholder="e.g. 12" className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30" /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="techCount" render={({ field }) => (
                    <FormItem><FormLabel className="text-white/70 text-sm">Tech count</FormLabel><FormControl><Input {...field} value={field.value ?? ""} type="number" min={0} placeholder="e.g. 6" className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30" /></FormControl></FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <FormField control={form.control} name="handsNeeded" render={({ field }) => (
                    <FormItem><FormLabel className="text-white/70 text-sm">Hands needed (get-in)</FormLabel><FormControl><Input {...field} value={field.value ?? ""} type="number" min={0} placeholder="e.g. 4" className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30" /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="getInDate" render={({ field }) => (
                    <FormItem><FormLabel className="text-white/70 text-sm">Get-in date</FormLabel><FormControl><DateInputWithWeekday value={field.value ?? ""} onChange={field.onChange} className="bg-white/5 border-white/10 text-white focus:border-white/30" /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="getInTime" render={({ field }) => (
                    <FormItem><FormLabel className="text-white/70 text-sm">Get-in time</FormLabel><FormControl><Input {...field} value={field.value ?? ""} placeholder="HH:mm" className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 max-w-[8rem]" /></FormControl></FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FormField control={form.control} name="setupTime" render={({ field }) => (
                    <FormItem><FormLabel className="text-white/70 text-sm">Setup time</FormLabel><FormControl><Input {...field} value={field.value ?? ""} placeholder="HH:mm" className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 max-w-[8rem]" /></FormControl></FormItem>
                  )} />
                  <FormField control={form.control} name="stageSize" render={({ field }) => (
                    <FormItem><FormLabel className="text-white/70 text-sm">Stage size</FormLabel><FormControl><Input {...field} value={field.value ?? ""} placeholder="e.g. 12m × 8m" className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30" /></FormControl></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="technicalRider" render={({ field }) => (
                  <FormItem><FormLabel className="text-white/70 text-sm">Tech-rider (general)</FormLabel><FormControl><Textarea {...field} value={field.value ?? ""} placeholder="General technical rider information for all shows" className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-none" rows={3} /></FormControl></FormItem>
                )} />
              </TabsContent>

              <TabsContent value="foh" className="space-y-5 mt-5">
                <SectionHeader>FOH (general for all shows)</SectionHeader>
                <FormField control={form.control} name="ticketingInfo" render={({ field }) => (
                  <FormItem><FormLabel className="text-white/70 text-sm">Ticketing info</FormLabel><FormControl><Textarea {...field} value={field.value ?? ""} placeholder="Doors, scanning, seating, audience flow..." className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-none" rows={2} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="hospitalityInfo" render={({ field }) => (
                  <FormItem><FormLabel className="text-white/70 text-sm">Bar / hospitality info</FormLabel><FormControl><Textarea {...field} value={field.value ?? ""} placeholder="Bar opening, guest care, hospitality flow..." className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-none" rows={2} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="allergies" render={({ field }) => (
                  <FormItem><FormLabel className="text-white/70 text-sm">Allergies / dietary requirements</FormLabel><FormControl><Textarea {...field} value={field.value ?? ""} placeholder="Allergy and dietary notes" className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-none" rows={2} /></FormControl></FormItem>
                )} />
                <FormField control={form.control} name="fohNotes" render={({ field }) => (
                  <FormItem><FormLabel className="text-white/70 text-sm">FOH notes</FormLabel><FormControl><Textarea {...field} value={field.value ?? ""} placeholder="Anything else FOH should know" className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-none" rows={2} /></FormControl></FormItem>
                )} />

                <SectionHeader>Additional info fields</SectionHeader>
                <div className="space-y-3">
                  {customFields.map((field, idx) => (
                    <div key={idx} className="bg-white/[0.02] border border-white/[0.07] rounded-lg p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <Input value={field.key} onChange={(e) => updateCustomField(idx, { key: e.target.value })} placeholder="Label" className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 text-sm h-8" />
                        <Input value={field.value} onChange={(e) => updateCustomField(idx, { value: e.target.value })} placeholder="Value" className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 text-sm h-8" />
                        <button type="button" onClick={() => removeCustomField(idx)} className="text-white/25 hover:text-red-400 transition-colors flex-shrink-0 p-1"><X size={14} /></button>
                      </div>
                      {depts.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-xs text-white/30 self-center mr-1">Departments:</span>
                          {depts.map((dept) => (
                            <DeptBadge key={dept.id} dept={dept} selected={field.departments.includes(dept.id)} onToggle={() => toggleDept(idx, dept.id)} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  <button type="button" onClick={addCustomField} className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors py-1"><Plus size={13} /> Add Field</button>
                </div>
              </TabsContent>
                  </Tabs>

                  {createMutation.isError ? (
                    <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                      {createMutation.error instanceof Error ? createMutation.error.message : "Failed to create event."}
                    </div>
                  ) : null}

                  <div className="flex gap-3 pt-2">
                    <Button type="button" variant="outline" onClick={() => navigate("/events")} className="border-white/10 text-white/60 hover:text-white hover:border-white/20 bg-transparent">
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending} className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50">
                      {createMutation.isPending ? "Creating..." : "Create Event"}
                    </Button>
                  </div>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="shows" className="mt-0">
              <div className="py-10 text-center text-white/35 text-sm">
                Create the event first, then add shows here.
              </div>
            </TabsContent>
            <TabsContent value="teams" className="mt-0">
              <div className="py-10 text-center text-white/35 text-sm">
                Create the event first, then manage teams here.
              </div>
            </TabsContent>
            <TabsContent value="people" className="mt-0">
              <div className="py-10 text-center text-white/35 text-sm">
                Create the event first, then assign people here.
              </div>
            </TabsContent>
            <TabsContent value="documents" className="mt-0">
              <div className="py-10 text-center text-white/35 text-sm">
                Create the event first, then upload documents here.
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
