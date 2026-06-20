import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import { DatetimeScheduleFields } from "@/components/DatetimeScheduleFields";
import {
  jobScheduleDateInputClassName,
  jobScheduleDateWeekdayClassName,
} from "@/components/DateInputWithWeekday";
import { JobNeededControl, JobPeopleAssignees } from "@/components/event/JobPeopleAssignees";
import { AutoSaveStatus } from "@/components/AutoSaveStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAutoSaveDraft } from "@/hooks/useAutoSaveDraft";
import { api } from "@/lib/api";
import { invalidateWorkAnnouncementBar } from "@/lib/invalidateWorkAnnouncementBar";
import type {
  EventDetail,
  EventPerson,
  EventShow,
  EventShowJob,
  Person,
  Venue,
} from "@/lib/types";
import {
  buildDatetimeLocal,
  calendarDateKeyFromJobDate,
  durationMinutesForwardBetweenDatetimes,
  parseDatetimeLocal,
  toDatetimeLocalString,
} from "@/lib/showTiming";
import type { CalendarItem } from "./scheduleUtils";

const inp = "bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 h-9";
const lbl = "text-white/50 text-xs uppercase tracking-wide";

const scheduleDateProps = {
  dateInputClassName: jobScheduleDateInputClassName,
  dateWeekdayClassName: jobScheduleDateWeekdayClassName,
};

function parseEventCalendarId(id: string): { eventId: string; showId?: string; jobId?: string } {
  const jobM = /^(.+):show:([^:]+):job:([^:]+)$/.exec(id);
  if (jobM?.[1] && jobM[2] && jobM[3]) return { eventId: jobM[1], showId: jobM[2], jobId: jobM[3] };
  const showM = /^(.+):show:([^:]+)$/.exec(id);
  if (showM?.[1] && showM[2]) return { eventId: showM[1], showId: showM[2] };
  return { eventId: id };
}

function jobWindow(j: EventShowJob, show: EventShow): { startValue: string; endValue: string } {
  const fallback = show.showDate.slice(0, 10);
  const rawDate = j.jobDate ?? "";
  const d =
    typeof rawDate === "string" && rawDate.length >= 10
      ? calendarDateKeyFromJobDate(rawDate, fallback)
      : fallback;
  const start = buildDatetimeLocal(d, j.startTime || "00:00");
  const t0 = new Date(start).getTime();
  const end = toDatetimeLocalString(new Date(t0 + j.durationMinutes * 60_000));
  return { startValue: start, endValue: end };
}

function showWindow(show: EventShow): { startValue: string; endValue: string } {
  const d = show.showDate.slice(0, 10);
  const start = buildDatetimeLocal(d, show.showTime || "00:00");
  const t0 = new Date(start).getTime();
  const end = toDatetimeLocalString(new Date(t0 + (show.durationMinutes ?? 60) * 60_000));
  return { startValue: start, endValue: end };
}

function rangeToJobBody(startValue: string, endValue: string) {
  const durationMinutes = durationMinutesForwardBetweenDatetimes(startValue, endValue);
  if (durationMinutes == null) return null;
  const st = parseDatetimeLocal(startValue);
  if (!st.date || !st.time) return null;
  return { jobDate: st.date, startTime: st.time, durationMinutes };
}

function rangeToShowBody(startValue: string, endValue: string) {
  const durationMinutes = durationMinutesForwardBetweenDatetimes(startValue, endValue);
  if (durationMinutes == null) return null;
  const st = parseDatetimeLocal(startValue);
  if (!st.date || !st.time) return null;
  return { showDate: st.date, showTime: st.time, durationMinutes };
}

function invalidateScheduleData(queryClient: ReturnType<typeof useQueryClient>, eventId: string) {
  queryClient.invalidateQueries({ queryKey: ["schedule"] });
  queryClient.invalidateQueries({ queryKey: ["event", eventId] });
  void invalidateWorkAnnouncementBar(queryClient);
}

function EventPeopleEditor({
  eventId,
  eventPeople,
  roster,
}: {
  eventId: string;
  eventPeople: EventPerson[];
  roster: Person[];
}) {
  const queryClient = useQueryClient();
  const [newPersonId, setNewPersonId] = useState("");
  const [newRole, setNewRole] = useState("");

  const assignedIds = new Set(eventPeople.map((ep) => ep.personId));
  const available = roster.filter((p) => !assignedIds.has(p.id));

  const assignMutation = useMutation({
    mutationFn: ({ personId, role }: { personId: string; role?: string }) =>
      api.post(`/api/events/${eventId}/people`, { personId, role: role || undefined }),
    onSuccess: () => {
      invalidateScheduleData(queryClient, eventId);
      setNewPersonId("");
      setNewRole("");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (assignmentId: string) => api.delete(`/api/events/${eventId}/people/${assignmentId}`),
    onSuccess: () => invalidateScheduleData(queryClient, eventId),
  });

  return (
    <div className="space-y-2">
      <Label className={lbl}>Event team</Label>
      {eventPeople.length === 0 ? (
        <p className="text-sm text-white/35">No one assigned to this event yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {eventPeople.map((ep) => (
            <li
              key={ep.id}
              className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5"
            >
              <span className="min-w-0 flex-1 text-sm text-white/85">
                {ep.person.name}
                {ep.role ? <span className="ml-2 text-xs text-white/40">{ep.role}</span> : null}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-white/30 hover:text-red-400"
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate(ep.id)}
              >
                <X size={13} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {available.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <div className="min-w-[140px] flex-1 space-y-1">
            <Label className={lbl}>Add person</Label>
            <Select value={newPersonId} onValueChange={setNewPersonId}>
              <SelectTrigger className={`${inp} w-full`}>
                <SelectValue placeholder="Choose…" />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white">
                {available.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-28 space-y-1">
            <Label className={lbl}>Role</Label>
            <Input
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              placeholder="Optional"
              className={`${inp} w-full text-sm`}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mb-0.5 h-9 w-9 text-white/50 hover:text-white"
            disabled={!newPersonId || assignMutation.isPending}
            onClick={() => {
              if (!newPersonId) return;
              assignMutation.mutate({ personId: newPersonId, role: newRole.trim() || undefined });
            }}
          >
            <Plus size={14} />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ScheduleJobEditForm({
  event,
  show,
  job,
  venues,
  people,
}: {
  event: EventDetail;
  show: EventShow;
  job: EventShowJob;
  venues: Venue[];
  people: Person[];
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(job.title);
  const [venueId, setVenueId] = useState(job.venueId ?? job.venue?.id ?? venues[0]?.id ?? "");
  const initialWindow = useMemo(() => jobWindow(job, show), [job, show]);
  const [startValue, setStartValue] = useState(initialWindow.startValue);
  const [endValue, setEndValue] = useState(initialWindow.endValue);

  const invalidate = () => invalidateScheduleData(queryClient, event.id);

  const updateJob = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.put(`/api/events/${event.id}/shows/${show.id}/jobs/${job.id}`, body),
    onSuccess: invalidate,
  });

  async function persistJob() {
    const trimmed = title.trim();
    if (!trimmed) throw new Error("Title is required");
    const body: Record<string, unknown> = { title: trimmed };
    if (venueId) body.venueId = venueId;
    const timing = rangeToJobBody(startValue, endValue);
    if (timing) Object.assign(body, timing);
    await updateJob.mutateAsync(body);
  }

  const autoSave = useAutoSaveDraft({
    enabled: true,
    resetKey: job.id,
    getSnapshot: () => ({ title, venueId, startValue, endValue }),
    save: persistJob,
  });

  return (
    <div className="space-y-5 pb-4" onBlurCapture={autoSave.onBlurCapture}>
      <AutoSaveStatus status={autoSave.status} error={autoSave.error} />

      <div>
        <Label className={lbl}>Job title</Label>
        <Input className={`${inp} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div>
        <Label className={lbl}>Schedule</Label>
        <div className="mt-1">
          <DatetimeScheduleFields
            {...scheduleDateProps}
            startValue={startValue}
            endValue={endValue}
            onStartChange={setStartValue}
            onEndChange={setEndValue}
          />
        </div>
      </div>

      <div>
        <Label className={lbl}>Venue</Label>
        <Select value={venueId} onValueChange={setVenueId}>
          <SelectTrigger className={`${inp} mt-1`}>
            <SelectValue placeholder="Select venue" />
          </SelectTrigger>
          <SelectContent className="bg-[#16161f] border-white/10 text-white">
            {venues.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Staffing</p>
        <JobNeededControl
          eventId={event.id}
          showId={show.id}
          job={job}
          canEdit
          onChanged={invalidate}
        />
        <JobPeopleAssignees
          eventId={event.id}
          showId={show.id}
          show={show}
          job={job}
          people={people}
          canEdit
          onChanged={invalidate}
          slotsLayout="stack"
        />
      </div>
    </div>
  );
}

function ScheduleShowEditForm({
  event,
  show,
  venues,
  people,
}: {
  event: EventDetail;
  show: EventShow;
  venues: Venue[];
  people: Person[];
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? "");
  const [status, setStatus] = useState(show.status ?? event.status ?? "draft");
  const [venueId, setVenueId] = useState(show.venueId ?? show.venue?.id ?? event.venueId ?? "none");
  const initialWindow = useMemo(() => showWindow(show), [show]);
  const [startValue, setStartValue] = useState(initialWindow.startValue);
  const [endValue, setEndValue] = useState(initialWindow.endValue);

  const invalidate = () => invalidateScheduleData(queryClient, event.id);

  const updateEvent = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put(`/api/events/${event.id}`, body),
    onSuccess: invalidate,
  });

  const updateShow = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.put(`/api/events/${event.id}/shows/${show.id}`, body),
    onSuccess: invalidate,
  });

  async function persistShowEntry() {
    const trimmed = title.trim();
    if (!trimmed) throw new Error("Title is required");
    await updateEvent.mutateAsync({
      title: trimmed,
      description: description.trim() || undefined,
    });
    const showBody: Record<string, unknown> = { status };
    if (venueId !== "none") showBody.venueId = venueId;
    const timing = rangeToShowBody(startValue, endValue);
    if (timing) Object.assign(showBody, timing);
    await updateShow.mutateAsync(showBody);
  }

  const autoSave = useAutoSaveDraft({
    enabled: true,
    resetKey: `${event.id}:${show.id}`,
    getSnapshot: () => ({ title, description, status, venueId, startValue, endValue }),
    save: persistShowEntry,
  });

  return (
    <div className="space-y-5 pb-4" onBlurCapture={autoSave.onBlurCapture}>
      <AutoSaveStatus status={autoSave.status} error={autoSave.error} />

      <div>
        <Label className={lbl}>Event title</Label>
        <Input className={`${inp} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div>
        <Label className={lbl}>Show schedule</Label>
        <div className="mt-1">
          <DatetimeScheduleFields
            {...scheduleDateProps}
            startValue={startValue}
            endValue={endValue}
            onStartChange={setStartValue}
            onEndChange={setEndValue}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className={lbl}>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className={`${inp} mt-1`}>
              <SelectValue />
            </SelectTrigger>
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
            <SelectTrigger className={`${inp} mt-1`}>
              <SelectValue placeholder="No venue" />
            </SelectTrigger>
            <SelectContent className="bg-[#16161f] border-white/10 text-white">
              <SelectItem value="none">No venue</SelectItem>
              {venues.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className={lbl}>Description</Label>
        <Textarea
          className="mt-1 min-h-[72px] resize-none border-white/10 bg-white/5 text-white placeholder:text-white/25"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional notes…"
        />
      </div>

      <EventPeopleEditor eventId={event.id} eventPeople={event.people ?? []} roster={people} />
    </div>
  );
}

function ScheduleEventEditForm({
  event,
  venues,
  people,
}: {
  event: EventDetail;
  venues: Venue[];
  people: Person[];
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? "");
  const [status, setStatus] = useState(event.status ?? "draft");
  const [contactPerson, setContactPerson] = useState(event.contactPerson ?? "");
  const [venueId, setVenueId] = useState(event.venueId ?? event.venue?.id ?? "none");

  const invalidate = () => invalidateScheduleData(queryClient, event.id);

  const updateEvent = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.put(`/api/events/${event.id}`, body),
    onSuccess: invalidate,
  });

  async function persistEvent() {
    const trimmed = title.trim();
    if (!trimmed) throw new Error("Title is required");
    await updateEvent.mutateAsync({
      title: trimmed,
      description: description.trim() || undefined,
      status,
      contactPerson: contactPerson.trim() || undefined,
      venueId: venueId === "none" ? null : venueId,
    });
  }

  const autoSave = useAutoSaveDraft({
    enabled: true,
    resetKey: event.id,
    getSnapshot: () => ({ title, description, status, contactPerson, venueId }),
    save: persistEvent,
  });

  return (
    <div className="space-y-5 pb-4" onBlurCapture={autoSave.onBlurCapture}>
      <AutoSaveStatus status={autoSave.status} error={autoSave.error} />

      <div>
        <Label className={lbl}>Event title</Label>
        <Input className={`${inp} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className={lbl}>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className={`${inp} mt-1`}>
              <SelectValue />
            </SelectTrigger>
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
            <SelectTrigger className={`${inp} mt-1`}>
              <SelectValue placeholder="No venue" />
            </SelectTrigger>
            <SelectContent className="bg-[#16161f] border-white/10 text-white">
              <SelectItem value="none">No venue</SelectItem>
              {venues.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className={lbl}>Contact person</Label>
        <Input
          className={`${inp} mt-1`}
          value={contactPerson}
          onChange={(e) => setContactPerson(e.target.value)}
        />
      </div>

      <div>
        <Label className={lbl}>Description</Label>
        <Textarea
          className="mt-1 min-h-[72px] resize-none border-white/10 bg-white/5 text-white placeholder:text-white/25"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <EventPeopleEditor eventId={event.id} eventPeople={event.people ?? []} roster={people} />
    </div>
  );
}

export function ScheduleEventJobEditForm({
  item,
  venues,
  people,
}: {
  item: CalendarItem;
  venues: Venue[];
  people: Person[];
}) {
  const { eventId, showId, jobId } = parseEventCalendarId(item.id);
  const { data: event = item.raw as EventDetail } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => api.get<EventDetail>(`/api/events/${eventId}`),
    initialData: item.raw as EventDetail,
  });
  const show = showId ? event.shows?.find((s) => s.id === showId) : undefined;
  const job = jobId && show ? show.jobs?.find((j) => j.id === jobId) : undefined;

  if (item.kind === "job" && show && job) {
    return (
      <ScheduleJobEditForm
        key={job.id}
        event={event}
        show={show}
        job={job}
        venues={venues}
        people={people}
      />
    );
  }

  if (item.kind === "event" && show) {
    return (
      <ScheduleShowEditForm
        key={show.id}
        event={event}
        show={show}
        venues={venues}
        people={people}
      />
    );
  }

  if (item.kind === "event") {
    return <ScheduleEventEditForm key={event.id} event={event} venues={venues} people={people} />;
  }

  return (
    <p className="text-sm text-white/45">
      This entry cannot be edited here. Open the event page for full details.
    </p>
  );
}
