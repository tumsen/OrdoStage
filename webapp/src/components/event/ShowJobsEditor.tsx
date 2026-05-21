import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { DatetimeScheduleFields } from "@/components/DatetimeScheduleFields";
import { scheduleFieldLabelClass } from "@/components/ScheduleTimeRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { invalidateWorkAnnouncementBar } from "@/lib/invalidateWorkAnnouncementBar";
import { cn } from "@/lib/utils";
import {
  buildDatetimeLocal,
  calendarDateKeyFromJobDate,
  durationMinutesForwardBetweenDatetimes,
  parseDatetimeLocal,
  toDatetimeLocalString,
} from "@/lib/showTiming";
import { JobPeopleAssignees } from "@/components/event/JobPeopleAssignees";
import { JobPeopleSlotsDraft } from "@/components/event/JobPeopleSlotsDraft";
import { sortEventShowJobs } from "@/lib/eventShowStaffing";
import type { EventShow, EventShowJob, Person } from "@/lib/types";

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

function rangeToJobBody(startValue: string, endValue: string) {
  const durationMinutes = durationMinutesForwardBetweenDatetimes(startValue, endValue);
  if (durationMinutes == null) return null;
  const st = parseDatetimeLocal(startValue);
  if (!st.date || !st.time) return null;
  return { jobDate: st.date, startTime: st.time, durationMinutes };
}

type VenueOpt = { id: string; name: string };

export function ShowJobsEditor({
  eventId,
  show,
  venues,
  people,
  departmentId,
  title,
  canEdit = true,
  highlightJobId,
}: {
  eventId: string;
  show: EventShow;
  venues: VenueOpt[] | undefined;
  people: Person[] | undefined;
  departmentId?: string | null;
  title?: string;
  canEdit?: boolean;
  highlightJobId?: string | null;
}) {
  const queryClient = useQueryClient();
  const jobs = sortEventShowJobs(
    (show.jobs ?? []).filter((j) =>
      departmentId === undefined ? true : (j.departmentId ?? null) === departmentId
    )
  );
  const [draft, setDraft] = useState<{
    title: string;
    startValue: string;
    endValue: string;
    venueId: string;
    peopleNeeded: number;
    slotPersonIds: (string | null)[];
  } | null>(null);
  const [windowOverrides, setWindowOverrides] = useState<
    Record<string, { startValue: string; endValue: string }>
  >({});

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["event", eventId] });
    queryClient.invalidateQueries({ queryKey: ["schedule"] });
    void invalidateWorkAnnouncementBar(queryClient);
  };

  const createJob = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ data: { id: string } }>(`/api/events/${eventId}/shows/${show.id}/jobs`, body),
    onSuccess: invalidate,
  });

  const updateJob = useMutation({
    mutationFn: ({ jobId, body }: { jobId: string; body: Record<string, unknown> }) =>
      api.put(`/api/events/${eventId}/shows/${show.id}/jobs/${jobId}`, body),
    onSuccess: invalidate,
  });

  const deleteJob = useMutation({
    mutationFn: (jobId: string) => api.delete(`/api/events/${eventId}/shows/${show.id}/jobs/${jobId}`),
    onSuccess: invalidate,
  });

  const copyJob = useMutation({
    mutationFn: (jobId: string) =>
      api.post<{ data: { id: string } }>(
        `/api/events/${eventId}/shows/${show.id}/jobs/${jobId}/copy`,
        { keepPeople: true }
      ),
    onSuccess: invalidate,
  });

  const startAdd = () => {
    const d = show.showDate.slice(0, 10);
    const st = show.showTime || "19:00";
    const startValue = buildDatetimeLocal(d, st);
    const endValue = toDatetimeLocalString(
      new Date(new Date(startValue).getTime() + 60 * 60_000)
    );
    setDraft({
      title: "New job",
      startValue,
      endValue,
      venueId: show.venueId,
      peopleNeeded: 1,
      slotPersonIds: [null],
    });
  };

  const saveDraft = () => {
    if (!draft) return;
    const body = rangeToJobBody(draft.startValue, draft.endValue);
    if (!body) return;
    createJob.mutate({
      title: draft.title.trim() || "Job",
      ...body,
      venueId: draft.venueId,
      departmentId: departmentId ?? null,
      peopleNeeded: draft.peopleNeeded,
      slotPersonIds: draft.slotPersonIds,
    });
    setDraft(null);
  };

  const jobRowClass =
    "w-full flex flex-nowrap items-end gap-2 sm:gap-3 min-w-0 overflow-x-auto pb-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-2";

  const selectTriggerClass =
    "bg-white/5 border-white/10 text-white h-10 w-[7.5rem] min-w-[7.5rem] sm:w-36 sm:min-w-[9rem]";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-white/45">{title ?? "Jobs for this show"}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 border-white/10 text-white/80 bg-transparent"
          onClick={startAdd}
          disabled={!canEdit || createJob.isPending}
        >
          <Plus size={12} className="mr-1" /> Add job
        </Button>
      </div>
      {jobs.length === 0 && !draft ? (
        <p className="text-sm text-white/35">No jobs yet. Add call times, get-in, rehearsals, or any work block.</p>
      ) : null}

      {jobs.map((j) => {
        const w = windowOverrides[j.id] ?? jobWindow(j, show);
        const isHighlight = Boolean(highlightJobId && j.id === highlightJobId);
        return (
          <div
            key={j.id}
            id={`show-job-${j.id}`}
            className={cn(
              jobRowClass,
              isHighlight && "ring-2 ring-red-500/55 ring-offset-2 ring-offset-[#0c0c12]"
            )}
          >
            <div className="shrink-0 w-28 min-w-28 sm:w-36 sm:min-w-36">
              <Label className={scheduleFieldLabelClass}>Title</Label>
              <Input
                defaultValue={j.title}
                onBlur={(e) => {
                  if (!canEdit) return;
                  const v = e.target.value.trim();
                  if (v && v !== j.title) updateJob.mutate({ jobId: j.id, body: { title: v } });
                }}
                className="bg-white/5 border-white/10 text-white h-10 w-full"
                disabled={!canEdit}
              />
            </div>
            <div className="shrink-0">
              <DatetimeScheduleFields
                startValue={w.startValue}
                endValue={w.endValue}
                onStartChange={(ns) => {
                  if (!canEdit) return;
                  const ne = toDatetimeLocalString(
                    new Date(new Date(ns).getTime() + j.durationMinutes * 60_000)
                  );
                  setWindowOverrides((prev) => ({
                    ...prev,
                    [j.id]: { startValue: ns, endValue: ne },
                  }));
                  const body = rangeToJobBody(ns, ne);
                  if (body) {
                    updateJob.mutate(
                      { jobId: j.id, body },
                      {
                        onSettled: () => {
                          setWindowOverrides((prev) => {
                            const next = { ...prev };
                            delete next[j.id];
                            return next;
                          });
                        },
                      }
                    );
                  }
                }}
                onEndChange={(ne) => {
                  if (!canEdit) return;
                  setWindowOverrides((prev) => ({
                    ...prev,
                    [j.id]: { startValue: w.startValue, endValue: ne },
                  }));
                  const body = rangeToJobBody(w.startValue, ne);
                  if (body) {
                    updateJob.mutate(
                      { jobId: j.id, body },
                      {
                        onSettled: () => {
                          setWindowOverrides((prev) => {
                            const next = { ...prev };
                            delete next[j.id];
                            return next;
                          });
                        },
                      }
                    );
                  }
                }}
                className={!canEdit ? "pointer-events-none opacity-70" : undefined}
              />
            </div>
            <div className="shrink-0">
              <Label className={scheduleFieldLabelClass}>Venue</Label>
              <Select
                value={j.venueId}
                onValueChange={(venueId) => updateJob.mutate({ jobId: j.id, body: { venueId } })}
                disabled={!canEdit}
              >
                <SelectTrigger className={selectTriggerClass}>
                  <SelectValue />
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
            <JobPeopleAssignees
              eventId={eventId}
              showId={show.id}
              job={j}
              people={people}
              canEdit={canEdit}
              onChanged={invalidate}
            />
            <div className="flex shrink-0 items-center gap-0.5 self-end pb-[2px]">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-10 w-10 text-white/40 hover:text-white"
                title="Copy job (same time, venue, and people)"
                onClick={() => {
                  if (!canEdit) return;
                  copyJob.mutate(j.id);
                }}
                disabled={!canEdit || copyJob.isPending}
              >
                <Copy size={14} />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-10 w-10 text-white/40 hover:text-red-400"
                onClick={() => {
                  if (!canEdit) return;
                  if (!confirm("Delete this job?")) return;
                  deleteJob.mutate(j.id);
                }}
                disabled={!canEdit}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        );
      })}

      {draft ? (
        <div className={cn(jobRowClass, "border-dashed")}>
          <div className="shrink-0 w-28 min-w-28 sm:w-36 sm:min-w-36">
            <Label className={scheduleFieldLabelClass}>Title</Label>
            <Input
              value={draft.title}
              onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))}
              className="bg-white/5 border-white/10 text-white h-10 w-full"
              disabled={!canEdit}
            />
          </div>
          <div className="shrink-0">
            <DatetimeScheduleFields
              startValue={draft.startValue}
              endValue={draft.endValue}
              onStartChange={(v) => setDraft((d) => (d ? { ...d, startValue: v } : d))}
              onEndChange={(v) => setDraft((d) => (d ? { ...d, endValue: v } : d))}
              className={!canEdit ? "pointer-events-none opacity-70" : undefined}
            />
          </div>
          <div className="shrink-0">
            <Label className={scheduleFieldLabelClass}>Venue</Label>
            <Select
              value={draft.venueId}
              onValueChange={(venueId) => setDraft((d) => (d ? { ...d, venueId } : d))}
              disabled={!canEdit}
            >
              <SelectTrigger className={selectTriggerClass}>
                <SelectValue />
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
          <JobPeopleSlotsDraft
            peopleNeeded={draft.peopleNeeded}
            slotPersonIds={draft.slotPersonIds}
            roster={people ?? []}
            disabled={!canEdit || createJob.isPending}
            onPeopleNeededChange={(peopleNeeded, slotPersonIds) =>
              setDraft((d) => (d ? { ...d, peopleNeeded, slotPersonIds } : d))
            }
            onSlotChange={(slotPersonIds) => setDraft((d) => (d ? { ...d, slotPersonIds } : d))}
          />
          <div className="flex shrink-0 items-center gap-1 self-end pb-[2px]">
            <Button
              type="button"
              size="sm"
              className="h-10 bg-red-900 hover:bg-red-800"
              onClick={saveDraft}
              disabled={!canEdit || createJob.isPending}
            >
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-10" onClick={() => setDraft(null)} disabled={!canEdit}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
