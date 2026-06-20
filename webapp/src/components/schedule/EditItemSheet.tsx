import { useRef, useState } from "react";
import { useAutoSaveDraft } from "@/hooks/useAutoSaveDraft";
import { AutoSaveStatus } from "@/components/AutoSaveStatus";
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
import { invalidateWorkAnnouncementBar } from "@/lib/invalidateWorkAnnouncementBar";
import { toast } from "@/hooks/use-toast";
import { DatetimeRangeFields } from "@/components/DatetimeRangeFields";
import { migrateContactRowFields } from "@/lib/eventContactRow";
import { parseEventCustomFieldsJson } from "@/lib/eventCustomFields";
import { datetimeLocalInputToBookingApiIso } from "@/lib/showTiming";
import type { CalendarItem } from "./scheduleUtils";
import { internalBookingDisplayTitle, splitInternalBookingSyncMarker } from "./scheduleUtils";
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

type EventContactRow = { role?: string; name?: string; phone?: string; email?: string; note?: string };

function eventMetaFromCustomFields(customFields: string | null | undefined): {
  contacts: EventContactRow[];
  smokeFx: boolean;
  hazeFx: boolean;
  strobeFx: boolean;
} {
  const fields = parseEventCustomFieldsJson(customFields);
  if (fields.length === 0) return { contacts: [], smokeFx: false, hazeFx: false, strobeFx: false };
  let contacts: EventContactRow[] = [];
  let smokeFx = false;
  let hazeFx = false;
  let strobeFx = false;
  for (const f of fields) {
    const key = f.key.trim();
    const value = f.value.trim();
    if (key === "Contacts" && value) {
      try {
        const parsed = JSON.parse(value) as unknown[];
        if (Array.isArray(parsed)) contacts = parsed.map((row) => migrateContactRowFields(row));
      } catch {
        /* ignore invalid legacy value */
      }
    } else if (key === "Use smoke fx") smokeFx = value === "true";
    else if (key === "Use haze fx") hazeFx = value === "true";
    else if (key === "Use strobe fx") strobeFx = value === "true";
  }
  return { contacts, smokeFx, hazeFx, strobeFx };
}

export function EventScheduleSummary({
  event,
  selectedShowId,
  highlightJobId,
  onOpenEvent,
}: {
  event: EventDetail;
  selectedShowId: string | null;
  highlightJobId?: string | null;
  onOpenEvent: () => void;
}) {
  const eventMeta = eventMetaFromCustomFields(event.customFields);
  function formatShowTimeRange(show: EventDetail["shows"][number]): string {
    const day = new Date(show.showDate);
    const [hh, mm] = show.showTime.split(":").map((v) => Number(v));
    if (!Number.isFinite(day.getTime()) || !Number.isFinite(hh) || !Number.isFinite(mm)) {
      return `${show.showTime} (${show.durationMinutes} min)`;
    }
    const start = new Date(day);
    start.setHours(hh, mm, 0, 0);
    const end = new Date(start.getTime() + show.durationMinutes * 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(start.getHours())}:${pad(start.getMinutes())} - ${pad(end.getHours())}:${pad(end.getMinutes())} (${show.durationMinutes} min)`;
  }

  function formatJobTimeRange(job: EventDetail["shows"][number]["jobs"][number]): string {
    const day = new Date(job.jobDate);
    if (!Number.isFinite(day.getTime())) return `${job.startTime}`;
    const start = new Date(day);
    const [hh, mm] = job.startTime.split(":").map((v) => Number(v));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return `${job.startTime}`;
    start.setHours(hh, mm, 0, 0);
    const end = new Date(start.getTime() + job.durationMinutes * 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(start.getHours())}:${pad(start.getMinutes())} - ${pad(end.getHours())}:${pad(end.getMinutes())}`;
  }

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
  const visibleShows = selectedShowId ? orderedShows.slice(0, 1) : orderedShows;

  return (
    <div className="space-y-4 mt-4 pb-6">
      <p className="text-xs text-white/45">
        {selectedShowId
          ? "Selected show"
          : `${shows.length} show${shows.length === 1 ? "" : "s"} in this event.`}
      </p>
      <div className="space-y-3">
        {visibleShows.map((show) => {
          const jobs = (show.jobs ?? [])
            .slice()
            .sort((a, b) => {
              const d = a.jobDate.localeCompare(b.jobDate);
              if (d !== 0) return d;
              return a.startTime.localeCompare(b.startTime);
            });
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
                <div className="text-xs text-white/50">{formatShowTimeRange(show)}</div>
              </div>
              {show.venue?.name ? (
                <p className="text-xs text-white/45">Venue: {show.venue.name}</p>
              ) : null}
              {jobs.length === 0 ? (
                <p className="text-xs text-white/35">No jobs on this show yet.</p>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-white/50">Jobs</p>
                  {jobs.map((job) => (
                    <div
                      key={job.id}
                      className={`text-xs text-white/80 flex items-center justify-between gap-2 rounded-md px-2 py-1 -mx-2 ${
                        highlightJobId === job.id
                          ? "ring-1 ring-amber-400/70 bg-amber-500/15"
                          : ""
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        {job.title} -{" "}
                        <span className="text-white/95">
                          {(job.people?.length
                            ? job.people.map((p) => p.name).join(", ")
                            : job.person?.name) ?? "Unassigned"}
                        </span>
                      </span>
                      <span className="shrink-0 text-white/55">{formatJobTimeRange(job)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {(eventMeta.contacts.length > 0 || eventMeta.smokeFx || eventMeta.hazeFx || eventMeta.strobeFx) ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2">
          <p className="text-xs text-white/50 uppercase tracking-wide">Event contacts & effects</p>
          {eventMeta.contacts.length > 0 ? (
            <div className="space-y-1">
              {eventMeta.contacts.map((c, idx) => (
                <div key={idx} className="text-xs text-white/80 space-y-0.5">
                  <div>
                    <span className="text-white/95">{c.role || "Contact"}</span>
                    {c.name ? ` — ${c.name}` : ""}
                    {c.phone ? ` — ${c.phone}` : ""}
                    {c.email ? ` — ${c.email}` : ""}
                  </div>
                  {c.note?.trim() ? (
                    <p className="text-white/55 border-l-2 border-white/15 pl-2">{c.note.trim()}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {(eventMeta.smokeFx || eventMeta.hazeFx || eventMeta.strobeFx) ? (
            <p className="text-xs text-amber-200/95">
              Effects: {eventMeta.smokeFx ? "Smoke " : ""}{eventMeta.hazeFx ? "Haze " : ""}{eventMeta.strobeFx ? "Strobe " : ""}
              (audience announcement required)
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="pt-2 border-t border-white/10">
        <Button className="bg-indigo-700 hover:bg-indigo-600 text-white border-0" onClick={onOpenEvent}>
          Edit Event
        </Button>
      </div>
    </div>
  );
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

// ─── Booking edit form ────────────────────────────────────────────────────────

interface BookingFormProps {
  booking: InternalBookingDetail;
  venues: Venue[];
  people: Person[];
  onSaved: () => void;
  onClose: () => void;
}

export function ScheduleBookingEditForm({ booking, venues, people, onClose }: BookingFormProps) {
  const queryClient = useQueryClient();

  const { marker, displayTitle: titleInitial } = splitInternalBookingSyncMarker(booking.title);
  const titleSyncMarkerRef = useRef(marker);
  const [title, setTitle] = useState(titleInitial);
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
      void invalidateWorkAnnouncementBar(queryClient);
      toast({ title: "Booking deleted" });
      onClose();
    },
    onError: () => toast({ title: "Failed to delete booking", variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put(`/api/bookings/${booking.id}`, {
        title: `${titleSyncMarkerRef.current}${title.trim()}`,
        description: description.trim() || undefined,
        startDate: datetimeLocalInputToBookingApiIso(startDate),
        endDate: datetimeLocalInputToBookingApiIso(endDate),
        type,
        venueId: venueId === "none" ? undefined : venueId,
        personIds: assignedPeople
          .filter((ap) => ap.personId)
          .map((ap) => ({ personId: ap.personId, role: ap.role.trim() || undefined })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      void invalidateWorkAnnouncementBar(queryClient);
    },
    onError: () => toast({ title: "Failed to save booking", variant: "destructive" }),
  });

  async function persistBooking() {
    if (!title.trim()) throw new Error("Title is required");
    if (type === "venue_booking") {
      if (!endDate.trim()) throw new Error("End date and time required");
      const a = new Date(startDate).getTime();
      const b = new Date(endDate).getTime();
      if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) {
        throw new Error("End must be after the start");
      }
    }
    await saveMutation.mutateAsync();
  }

  const bookingAutoSave = useAutoSaveDraft({
    enabled: true,
    resetKey: booking.id,
    getSnapshot: () => ({ title, description, startDate, endDate, type, venueId, assignedPeople }),
    save: persistBooking,
  });

  const unassigned = people.filter((p) => !assignedPeople.some((ap) => ap.personId === p.id));

  const inp = "bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 h-9";
  const lbl = "text-white/50 text-xs uppercase tracking-wide";

  return (
    <div className="space-y-5 pb-8" onBlurCapture={bookingAutoSave.onBlurCapture}>
      <AutoSaveStatus status={bookingAutoSave.status} error={bookingAutoSave.error} />
      <div>
        <Label className={lbl}>Title</Label>
        <Input className={`${inp} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div>
        <Label className={lbl}>Schedule</Label>
        <div className="mt-1">
          <DatetimeRangeFields
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
              <SelectItem value="venue_booking">Venue booking</SelectItem>
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
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[140px] space-y-1">
              <Label className={lbl}>Person</Label>
              <Select value={newPersonId} onValueChange={setNewPersonId}>
                <SelectTrigger className="w-full bg-white/5 border-white/10 text-white text-sm h-8"><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent className="bg-[#16161f] border-white/10 text-white">
                  {unassigned.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-24 space-y-1">
              <Label className={lbl}>Role</Label>
              <Input value={newPersonRole} onChange={(e) => setNewPersonRole(e.target.value)}
                placeholder="Role"
                className="w-full bg-white/5 border-white/10 text-white placeholder:text-white/25 h-8 text-sm" />
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white/50 hover:text-white flex-shrink-0 mb-0.5"
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
            label={`"${internalBookingDisplayTitle(booking.title)}"`}
            onConfirm={() => deleteMutation.mutate()}
            onCancel={() => setShowDelete(false)}
          />
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" className="text-red-400/70 hover:text-red-400 hover:bg-red-950/30 gap-1.5 h-8"
              onClick={() => setShowDelete(true)}>
              <Trash2 size={13} /> Delete booking
            </Button>
            <div className="flex gap-2 items-center">
              <Button
                variant="ghost"
                className="text-white/50 hover:text-white"
                onClick={() => void bookingAutoSave.flush().finally(onClose)}
              >
                Close
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
  if (item.kind === "tour") return null;

  const raw = item.raw;
  const isEv = item.kind === "event" || item.kind === "job";
  const showMatch = /^[^:]+:show:([^:]+)/.exec(item.id);
  const selectedShowId = showMatch?.[1] ?? null;
  const jobMatch = /:job:([^:]+)$/.exec(item.id);
  const selectedJobId = jobMatch?.[1] ?? null;

  const BOOKING_TYPE_LABELS: Record<string, string> = {
    rehearsal: "Rehearsal",
    maintenance: "Maintenance",
    private: "Private",
    venue_booking: "Venue booking",
    other: "Other",
  };

  const kindLabel =
    item.kind === "job" ? "Job" : isEv ? "Event" : BOOKING_TYPE_LABELS[item.type ?? "other"];
  const kindColor =
    item.kind === "job"
      ? "bg-teal-600/70 text-teal-100"
      : isEv
        ? "bg-indigo-600/70 text-indigo-100"
        : "bg-amber-600/70 text-amber-100";

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
            highlightJobId={selectedJobId}
            onOpenEvent={() => {
              navigate(`/events/${(raw as EventDetail).id}`);
              onClose();
            }}
          />
        ) : (
          <ScheduleBookingEditForm
            key={(raw as InternalBookingDetail).id}
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
