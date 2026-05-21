import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { DatetimeScheduleFields } from "@/components/DatetimeScheduleFields";
import {
  jobScheduleDateInputClassName,
  jobScheduleDateWeekdayClassName,
} from "@/components/DateInputWithWeekday";
import { JobNeededControl, JobPeopleAssignees } from "@/components/event/JobPeopleAssignees";
import { JobNeededDraft, JobPeopleSlotsDraftRow } from "@/components/event/JobPeopleSlotsDraft";
import {
  jobEditorFieldFocusClass,
  scheduleFieldLabelClass,
} from "@/components/ScheduleTimeRow";
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
import { overlappingPersonIdsForJob, wouldPersonOverlapOnJob } from "@/lib/eventJobConflicts";
import type { JobAssignmentContext } from "@/lib/eventJobConflicts";
import { jobStaffingBorderClass, sortEventShowJobs } from "@/lib/eventShowStaffing";
import { toast } from "@/hooks/use-toast";
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

const jobCardBaseClass =
  "w-full min-w-0 rounded-lg border bg-white/[0.03] pl-5 pr-3 py-2.5 space-y-0";

/** Left padding keeps the first field’s focus ring from clipping in overflow-x-auto. */
const jobSettingsScrollClass =
  "min-w-0 overflow-x-auto overflow-y-visible py-0.5 pl-1.5 pr-0.5";

const jobSettingsRowClass =
  "flex flex-nowrap items-end gap-2 sm:gap-3 min-w-0 pb-3";

const jobFieldCellClass = "flex shrink-0 flex-col";

const jobTitleCellClass = "w-[7.5rem] min-w-[7.5rem] sm:w-36 sm:min-w-[9rem]";

const jobTitleFieldClass = cn(
  "block h-10 min-h-10 w-full rounded-md border bg-white/5 border-white/10 px-3 text-sm text-white",
  "py-0 leading-10 shadow-none",
  jobEditorFieldFocusClass
);

function JobEditorFieldCell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn(jobFieldCellClass, className)}>{children}</div>;
}

const selectTriggerClass =
  "bg-white/5 border-white/10 text-white h-10 w-[7.5rem] min-w-[7.5rem] sm:w-36 sm:min-w-[9rem]";

const scheduleDateProps = {
  dateInputClassName: jobScheduleDateInputClassName,
  dateWeekdayClassName: jobScheduleDateWeekdayClassName,
};

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

  const DRAFT_JOB_ID = "__draft__";

  const createJob = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ data: { id: string } }>(`/api/events/${eventId}/shows/${show.id}/jobs`, body),
    onSuccess: invalidate,
    onError: (err: Error) => {
      toast({
        title: "Could not create job",
        description: err.message,
        variant: "destructive",
      });
    },
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
        { keepPeople: false }
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

  const draftJob = useMemo((): EventShowJob | null => {
    if (!draft) return null;
    const body = rangeToJobBody(draft.startValue, draft.endValue);
    if (!body) return null;
    return {
      id: DRAFT_JOB_ID,
      showId: show.id,
      title: draft.title,
      jobDate: body.jobDate,
      startTime: body.startTime,
      durationMinutes: body.durationMinutes,
      venueId: draft.venueId,
      departmentId: departmentId ?? null,
      personId: null,
      peopleNeeded: draft.peopleNeeded,
      slotPersonIds: draft.slotPersonIds,
      sortOrder: 0,
    } as EventShowJob;
  }, [draft, show.id, departmentId]);

  const draftAssignmentCtx = useMemo((): JobAssignmentContext | undefined => {
    if (!draftJob || !draft) return undefined;
    return {
      jobs: [...(show.jobs ?? []), draftJob],
      slotPersonIdsByJobId: { [DRAFT_JOB_ID]: draft.slotPersonIds },
    };
  }, [show.jobs, draftJob, draft]);

  const draftOverlapBusy = useMemo(() => {
    if (!draftJob) return new Set<string>();
    return overlappingPersonIdsForJob(show, DRAFT_JOB_ID, draftAssignmentCtx);
  }, [show, draftJob, draftAssignmentCtx]);

  const saveDraft = () => {
    if (!draft) return;
    const body = rangeToJobBody(draft.startValue, draft.endValue);
    if (!body) return;
    for (const pid of draft.slotPersonIds) {
      if (pid && wouldPersonOverlapOnJob(show, DRAFT_JOB_ID, pid, draftAssignmentCtx)) {
        toast({
          title: "Overlapping assignment",
          description: "Remove people who are already on another job at this time.",
          variant: "destructive",
        });
        return;
      }
    }
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
              jobCardBaseClass,
              jobStaffingBorderClass(j),
              isHighlight && "ring-2 ring-red-500/55 ring-offset-2 ring-offset-[#0c0c12]"
            )}
          >
            <div className={jobSettingsScrollClass}>
              <div className={jobSettingsRowClass}>
              <JobEditorFieldCell className={jobTitleCellClass}>
                <Label className={scheduleFieldLabelClass}>Title</Label>
                <Input
                  defaultValue={j.title}
                  onBlur={(e) => {
                    if (!canEdit) return;
                    const v = e.target.value.trim();
                    if (v && v !== j.title) updateJob.mutate({ jobId: j.id, body: { title: v } });
                  }}
                  className={jobTitleFieldClass}
                  disabled={!canEdit}
                />
              </JobEditorFieldCell>
              <JobEditorFieldCell>
                <DatetimeScheduleFields
                  {...scheduleDateProps}
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
                  className={cn(
                    "!overflow-visible pb-0",
                    !canEdit && "pointer-events-none opacity-70"
                  )}
                />
              </JobEditorFieldCell>
              <JobEditorFieldCell>
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
              </JobEditorFieldCell>
              <JobNeededControl
                eventId={eventId}
                showId={show.id}
                job={j}
                canEdit={canEdit}
                onChanged={invalidate}
              />
              <div className="flex shrink-0 items-center gap-0.5 self-end pb-[2px] ml-auto">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10 text-white/40 hover:text-white"
                  title="Copy job (same time and venue)"
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
            </div>
            <JobPeopleAssignees
              eventId={eventId}
              showId={show.id}
              show={show}
              job={j}
              people={people}
              canEdit={canEdit}
              onChanged={invalidate}
            />
          </div>
        );
      })}

      {draft ? (
        <div className={cn(jobCardBaseClass, "border-dashed border-white/20")}>
          <div className={jobSettingsScrollClass}>
            <div className={jobSettingsRowClass}>
            <JobEditorFieldCell className={jobTitleCellClass}>
              <Label className={scheduleFieldLabelClass}>Title</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))}
                className={jobTitleFieldClass}
                disabled={!canEdit}
              />
            </JobEditorFieldCell>
            <JobEditorFieldCell>
              <DatetimeScheduleFields
                {...scheduleDateProps}
                startValue={draft.startValue}
                endValue={draft.endValue}
                onStartChange={(v) => setDraft((d) => (d ? { ...d, startValue: v } : d))}
                onEndChange={(v) => setDraft((d) => (d ? { ...d, endValue: v } : d))}
                className={cn(
                  "!overflow-visible pb-0",
                  !canEdit && "pointer-events-none opacity-70"
                )}
              />
            </JobEditorFieldCell>
            <JobEditorFieldCell>
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
            </JobEditorFieldCell>
            <JobNeededDraft
              peopleNeeded={draft.peopleNeeded}
              slotPersonIds={draft.slotPersonIds}
              disabled={!canEdit || createJob.isPending}
              onPeopleNeededChange={(peopleNeeded, slotPersonIds) =>
                setDraft((d) => (d ? { ...d, peopleNeeded, slotPersonIds } : d))
              }
            />
            <div className="flex shrink-0 items-center gap-1 self-end pb-[2px] ml-auto">
              <Button
                type="button"
                size="sm"
                className="h-10 bg-red-900 hover:bg-red-800"
                onClick={saveDraft}
                disabled={!canEdit || createJob.isPending}
              >
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-10"
                onClick={() => setDraft(null)}
                disabled={!canEdit}
              >
                Cancel
              </Button>
            </div>
            </div>
          </div>
          <JobPeopleSlotsDraftRow
            peopleNeeded={draft.peopleNeeded}
            slotPersonIds={draft.slotPersonIds}
            roster={people ?? []}
            overlapBusy={draftOverlapBusy}
            disabled={!canEdit || createJob.isPending}
            onSlotChange={(slotPersonIds) => {
              const changed = slotPersonIds.find(
                (id, i) => id && id !== (draft.slotPersonIds[i] ?? null)
              );
              if (
                changed &&
                wouldPersonOverlapOnJob(show, DRAFT_JOB_ID, changed, {
                  ...draftAssignmentCtx,
                  slotPersonIdsByJobId: { [DRAFT_JOB_ID]: slotPersonIds },
                })
              ) {
                toast({
                  title: "Overlapping assignment",
                  description: "This person is already assigned to another job at the same time.",
                  variant: "destructive",
                });
                return;
              }
              setDraft((d) => (d ? { ...d, slotPersonIds } : d));
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
