import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import { toast } from "@/hooks/use-toast";
import { DatetimeScheduleFields } from "@/components/DatetimeScheduleFields";
import type { CalendarItem } from "./scheduleUtils";
import type {
  EventDetail,
  InternalBookingDetail,
  Venue,
  Person,
} from "../../../../backend/src/types";

interface EditItemSheetProps {
  item: CalendarItem | null;
  onClose: () => void;
  venues: Venue[];
  people: Person[];
}

function EventScheduleSummary({
  event,
  selectedShowId,
  onOpenEvent,
}: {
  event: EventDetail;
  selectedShowId: string | null;
  onOpenEvent: () => void;
}) {
  const shows = [...(event.shows ?? [])].sort((a, b) => {
    const d = a.showDate.localeCompare(b.showDate);
    if (d !== 0) return d;
    return a.showTime.localeCompare(b.showTime);
  });

  const orderedShows =
    selectedShowId && shows.some((s) => s.id === selectedShowId)
      ? [
          ...shows.filter((s) => s.id === selectedShowId),
          ...shows.filter((s) => s.id !== selectedShowId),
        ]
      : shows;

  return (
    <div className="space-y-4 mt-4 pb-6">
      <p className="text-xs text-white/45">
        {shows.length} show{shows.length === 1 ? "" : "s"} in this event.
      </p>
      <div className="space-y-3">
        {orderedShows.map((show) => {
          const jobAssignments = (show.jobs ?? []).filter((j) => j.person);
          return (
            <div key={show.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-white/85 font-medium">
                  {new Date(show.showDate).toLocaleDateString("en-GB", {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </div>
                <div className="text-xs text-white/50">
                  {show.showTime} ({show.durationMinutes} min)
                </div>
              </div>
              {show.venue?.name ? (
                <p className="text-xs text-white/45">Venue: {show.venue.name}</p>
              ) : null}
              {jobAssignments.length === 0 ? (
                <p className="text-xs text-white/35">No job assignments yet.</p>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-white/50">Job assignments</p>
                  {jobAssignments.map((job) => (
                    <p key={job.id} className="text-xs text-white/80">
                      {job.title}: <span className="text-white/95">{job.person?.name}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="pt-2 border-t border-white/10">
        <Button className="bg-indigo-700 hover:bg-indigo-600 text-white border-0" onClick={onOpenEvent}>
          Edit Event
        </Button>
      </div>
    </div>
  );
}

function isEvent(raw: EventDetail | InternalBookingDetail): raw is EventDetail {
  return "status" in raw;
}

function toLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Delete confirmation (type "DELETE" to confirm) ──────────────────────────

function DeleteConfirmInline({
  label,
  onConfirm,
  onCancel,
}: {
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const ready = value.trim() === "DELETE";
  return (
    <div className="rounded-lg border border-red-800/50 bg-red-950/30 p-4 space-y-3">
      <p className="text-sm text-red-300 font-medium">Delete {label}?</p>
      <p className="text-xs text-white/50">
        This cannot be undone. Type <span className="font-semibold text-white/70">DELETE</span> to confirm.
      </p>
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="DELETE"
        className="w-full h-9 px-3 text-sm bg-black/30 border border-red-800/50 rounded-md text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/70"
      />
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" className="text-white/50 hover:text-white h-8" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="bg-red-700 hover:bg-red-600 text-white border-0 h-8 gap-1.5 disabled:opacity-40"
          disabled={!ready}
          onClick={onConfirm}
        >
          <Trash2 size={13} />
          Delete
        </Button>
      </div>
    </div>
  );
}

// ─── Event edit form ──────────────────────────────────────────────────────────

interface EventFormProps {
  event: EventDetail;
  venues: Venue[];
  people: Person[];
  onSaved: () => void;
  onClose: () => void;
}

function EventForm({ event, venues, people, onSaved, onClose }: EventFormProps) {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? "");
  const [startDate, setStartDate] = useState(toLocal(event.startDate));
  const [endDate, setEndDate] = useState(toLocal(event.endDate));
  const [status, setStatus] = useState<"draft" | "confirmed" | "cancelled">(
    (event.status as "draft" | "confirmed" | "cancelled") ?? "draft"
  );
  const [venueId, setVenueId] = useState(event.venue?.id ?? "none");
  const [tags, setTags] = useState(event.tags ?? "");
  const [contactPerson, setContactPerson] = useState(event.contactPerson ?? "");
  const [getInTime, setGetInTime] = useState(event.getInTime ?? "");
  const [setupTime, setSetupTime] = useState(event.setupTime ?? "");
  const [assignedPeople, setAssignedPeople] = useState<{ id: string; personId: string; role: string; person: Person }[]>(
    (event.people ?? []).map((ep) => ({ id: ep.id, personId: ep.personId, role: ep.role ?? "", person: ep.person as unknown as Person }))
  );
  const [newPersonId, setNewPersonId] = useState("");
  const [newPersonRole, setNewPersonRole] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/events/${event.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast({ title: "Event deleted" });
      onClose();
    },
    onError: () => toast({ title: "Failed to delete event", variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/events/${event.id}`, {
        title: title.trim(),
        description: description.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        status,
        venueId: venueId === "none" ? undefined : venueId,
        tags: tags.trim() || undefined,
        contactPerson: contactPerson.trim() || undefined,
        getInTime: getInTime.trim() || undefined,
        setupTime: setupTime.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["event", event.id] });
      toast({ title: "Event saved" });
      onSaved();
    },
    onError: () => toast({ title: "Failed to save event", variant: "destructive" }),
  });

  const assignMutation = useMutation({
    mutationFn: ({ personId, role }: { personId: string; role: string }) =>
      api.post(`/api/events/${event.id}/people`, { personId, role: role || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      setNewPersonId("");
      setNewPersonRole("");
    },
    onError: () => toast({ title: "Failed to add person", variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: (assignmentId: string) =>
      api.delete(`/api/events/${event.id}/people/${assignmentId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["schedule"] }),
    onError: () => toast({ title: "Failed to remove person", variant: "destructive" }),
  });

  const unassigned = people.filter((p) => !assignedPeople.some((ap) => ap.personId === p.id));

  const inp = "bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 h-9";
  const lbl = "text-white/50 text-xs uppercase tracking-wide";

  return (
    <div className="space-y-5 mt-4 pb-8">
      <div>
        <Label className={lbl}>Title</Label>
        <Input className={`${inp} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div>
        <Label className={lbl}>Schedule</Label>
        <div className="mt-1">
          <DatetimeScheduleFields
            startValue={startDate}
            endValue={endDate}
            onStartChange={setStartDate}
            onEndChange={setEndDate}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className={lbl}>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as "draft" | "confirmed" | "cancelled")}>
            <SelectTrigger className={`${inp} mt-1`}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-[#16161f] border-white/10 text-white">
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className={lbl}>Venue</Label>
          <Select value={venueId} onValueChange={setVenueId}>
            <SelectTrigger className={`${inp} mt-1`}><SelectValue placeholder="No venue" /></SelectTrigger>
            <SelectContent className="bg-[#16161f] border-white/10 text-white">
              <SelectItem value="none">No venue</SelectItem>
              {venues.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className={lbl}>Description</Label>
        <Textarea className="bg-white/5 border-white/10 text-white placeholder:text-white/25 resize-none min-h-[80px] mt-1" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description…" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className={lbl}>Get-in time</Label>
          <Input className={`${inp} mt-1`} value={getInTime} onChange={(e) => setGetInTime(e.target.value)} placeholder="e.g. 08:00" />
        </div>
        <div>
          <Label className={lbl}>Setup time</Label>
          <Input className={`${inp} mt-1`} value={setupTime} onChange={(e) => setSetupTime(e.target.value)} placeholder="e.g. 10:00" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className={lbl}>Contact person</Label>
          <Input className={`${inp} mt-1`} value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
        </div>
        <div>
          <Label className={lbl}>Tags</Label>
          <Input className={`${inp} mt-1`} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma separated" />
        </div>
      </div>

      {/* People */}
      <div className="space-y-2">
        <Label className={lbl}>People</Label>
        {assignedPeople.map((ap) => (
          <div key={ap.id} className="flex items-center gap-2">
            <div className="flex-1 text-sm text-white/80 bg-white/5 rounded-md px-3 py-1.5 truncate">
              {ap.person?.name ?? ap.personId}
              {ap.role ? <span className="text-white/40 ml-2 text-xs">{ap.role}</span> : null}
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/30 hover:text-red-400 flex-shrink-0"
              onClick={() => {
                if (!confirmDeleteAction(`person assignment "${ap.person?.name ?? ap.personId}"`)) return;
                setAssignedPeople((prev) => prev.filter((p) => p.id !== ap.id));
                removeMutation.mutate(ap.id);
              }}>
              <X size={13} />
            </Button>
          </div>
        ))}
        {unassigned.length > 0 && (
          <div className="flex items-center gap-2">
            <Select value={newPersonId} onValueChange={setNewPersonId}>
              <SelectTrigger className="flex-1 bg-white/5 border-white/10 text-white text-sm h-8"><SelectValue placeholder="Add person…" /></SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white">
                {unassigned.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Role" value={newPersonRole} onChange={(e) => setNewPersonRole(e.target.value)}
              className="w-24 bg-white/5 border-white/10 text-white placeholder:text-white/25 h-8 text-sm" />
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white/50 hover:text-white flex-shrink-0"
              disabled={!newPersonId}
              onClick={() => {
                if (!newPersonId) return;
                const p = people.find((x) => x.id === newPersonId)!;
                setAssignedPeople((prev) => [...prev, { id: `tmp-${Date.now()}`, personId: newPersonId, role: newPersonRole, person: p }]);
                assignMutation.mutate({ personId: newPersonId, role: newPersonRole });
              }}>
              <Plus size={14} />
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3 pt-3 border-t border-white/10">
        {showDelete ? (
          <DeleteConfirmInline
            label={`"${event.title}"`}
            onConfirm={() => deleteMutation.mutate()}
            onCancel={() => setShowDelete(false)}
          />
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" className="text-red-400/70 hover:text-red-400 hover:bg-red-950/30 gap-1.5 h-8"
              onClick={() => setShowDelete(true)}>
              <Trash2 size={13} /> Delete event
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" className="text-white/50 hover:text-white" onClick={onClose}>Cancel</Button>
              <Button className="bg-indigo-700 hover:bg-indigo-600 text-white border-0" disabled={saveMutation.isPending || !title.trim()}
                onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? "Saving…" : "Save event"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

void EventForm;

// ─── Booking edit form ────────────────────────────────────────────────────────

interface BookingFormProps {
  booking: InternalBookingDetail;
  venues: Venue[];
  people: Person[];
  onSaved: () => void;
  onClose: () => void;
}

function BookingForm({ booking, venues, people, onSaved, onClose }: BookingFormProps) {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(booking.title);
  const [description, setDescription] = useState(booking.description ?? "");
  const [startDate, setStartDate] = useState(toLocal(booking.startDate));
  const [endDate, setEndDate] = useState(toLocal(booking.endDate));
  const [type, setType] = useState(booking.type ?? "other");
  const [venueId, setVenueId] = useState((booking.venue as { id?: string } | null)?.id ?? "none");
  const [assignedPeople, setAssignedPeople] = useState<{ id: string; personId: string; role: string; person: Person }[]>(
    (booking.people ?? []).map((bp) => ({ id: bp.id, personId: bp.personId, role: bp.role ?? "", person: bp.person as unknown as Person }))
  );
  const [newPersonId, setNewPersonId] = useState("");
  const [newPersonRole, setNewPersonRole] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/bookings/${booking.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      toast({ title: "Booking deleted" });
      onClose();
    },
    onError: () => toast({ title: "Failed to delete booking", variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/bookings/${booking.id}`, {
        title: title.trim(),
        description: description.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        type,
        venueId: venueId === "none" ? undefined : venueId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      toast({ title: "Booking saved" });
      onSaved();
    },
    onError: () => toast({ title: "Failed to save booking", variant: "destructive" }),
  });

  const unassigned = people.filter((p) => !assignedPeople.some((ap) => ap.personId === p.id));

  const inp = "bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 h-9";
  const lbl = "text-white/50 text-xs uppercase tracking-wide";

  return (
    <div className="space-y-5 mt-4 pb-8">
      <div>
        <Label className={lbl}>Title</Label>
        <Input className={`${inp} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div>
        <Label className={lbl}>Schedule</Label>
        <div className="mt-1">
          <DatetimeScheduleFields
            startValue={startDate}
            endValue={endDate}
            onStartChange={setStartDate}
            onEndChange={setEndDate}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className={lbl}>Type</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className={`${inp} mt-1`}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-[#16161f] border-white/10 text-white">
              <SelectItem value="rehearsal">Rehearsal</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="private">Private</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className={lbl}>Venue</Label>
          <Select value={venueId} onValueChange={setVenueId}>
            <SelectTrigger className={`${inp} mt-1`}><SelectValue placeholder="No venue" /></SelectTrigger>
            <SelectContent className="bg-[#16161f] border-white/10 text-white">
              <SelectItem value="none">No venue</SelectItem>
              {venues.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className={lbl}>Description / notes</Label>
        <Textarea className="bg-white/5 border-white/10 text-white placeholder:text-white/25 resize-none min-h-[80px] mt-1" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes…" />
      </div>

      {/* People */}
      <div className="space-y-2">
        <Label className={lbl}>People</Label>
        {assignedPeople.map((ap) => (
          <div key={ap.id} className="flex items-center gap-2">
            <div className="flex-1 text-sm text-white/80 bg-white/5 rounded-md px-3 py-1.5 truncate">
              {ap.person?.name ?? ap.personId}
              {ap.role ? <span className="text-white/40 ml-2 text-xs">{ap.role}</span> : null}
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/30 hover:text-red-400 flex-shrink-0"
              onClick={() => setAssignedPeople((prev) => prev.filter((p) => p.id !== ap.id))}>
              <X size={13} />
            </Button>
          </div>
        ))}
        {unassigned.length > 0 && (
          <div className="flex items-center gap-2">
            <Select value={newPersonId} onValueChange={setNewPersonId}>
              <SelectTrigger className="flex-1 bg-white/5 border-white/10 text-white text-sm h-8"><SelectValue placeholder="Add person…" /></SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white">
                {unassigned.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Role" value={newPersonRole} onChange={(e) => setNewPersonRole(e.target.value)}
              className="w-24 bg-white/5 border-white/10 text-white placeholder:text-white/25 h-8 text-sm" />
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white/50 hover:text-white flex-shrink-0"
              disabled={!newPersonId}
              onClick={() => {
                if (!newPersonId) return;
                const p = people.find((x) => x.id === newPersonId)!;
                setAssignedPeople((prev) => [...prev, { id: `tmp-${Date.now()}`, personId: newPersonId, role: newPersonRole, person: p }]);
                setNewPersonId("");
                setNewPersonRole("");
              }}>
              <Plus size={14} />
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3 pt-3 border-t border-white/10">
        {showDelete ? (
          <DeleteConfirmInline
            label={`"${booking.title}"`}
            onConfirm={() => deleteMutation.mutate()}
            onCancel={() => setShowDelete(false)}
          />
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" className="text-red-400/70 hover:text-red-400 hover:bg-red-950/30 gap-1.5 h-8"
              onClick={() => setShowDelete(true)}>
              <Trash2 size={13} /> Delete booking
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" className="text-white/50 hover:text-white" onClick={onClose}>Cancel</Button>
              <Button className="bg-amber-700 hover:bg-amber-600 text-white border-0" disabled={saveMutation.isPending || !title.trim()}
                onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? "Saving…" : "Save booking"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main sheet ────────────────────────────────────────────────────────────────

export function EditItemSheet({ item, onClose, venues, people }: EditItemSheetProps) {
  const navigate = useNavigate();
  if (!item) return null;

  const raw = item.raw;
  const isEv = isEvent(raw);
  const selectedShowId = item.id.includes(":show:") ? item.id.split(":show:")[1] ?? null : null;

  const BOOKING_TYPE_LABELS: Record<string, string> = {
    rehearsal: "Rehearsal", maintenance: "Maintenance", private: "Private", other: "Other",
  };

  const kindLabel = isEv ? "Event" : (BOOKING_TYPE_LABELS[item.type ?? "other"]);
  const kindColor = isEv ? "bg-indigo-600/70 text-indigo-100" : "bg-amber-600/70 text-amber-100";

  return (
    <Sheet open={item !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="bg-[#0d0d14] border-white/10 text-white w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider ${kindColor}`}>
              {kindLabel}
            </span>
            {isEv && (raw as EventDetail).status ? (
              <span className="text-[11px] px-2 py-0.5 rounded font-medium bg-white/5 text-white/50 border border-white/10">
                {(raw as EventDetail).status}
              </span>
            ) : null}
          </div>
          <SheetTitle className="text-white text-base font-semibold leading-snug">{item.title}</SheetTitle>
        </SheetHeader>

        {isEv ? (
          <EventScheduleSummary
            event={raw as EventDetail}
            selectedShowId={selectedShowId}
            onOpenEvent={() => {
              navigate(`/events/${(raw as EventDetail).id}`);
              onClose();
            }}
          />
        ) : (
          <BookingForm
            booking={raw as InternalBookingDetail}
            venues={venues}
            people={people}
            onSaved={onClose}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
