import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { DatetimeScheduleFields } from "@/components/DatetimeScheduleFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import {
  buildDatetimeLocal,
  parseDatetimeLocal,
  toDatetimeLocalString,
} from "@/lib/showTiming";
import type { EventShow, EventShowJob, Person } from "@/lib/types";

function jobWindow(j: EventShowJob): { startValue: string; endValue: string } {
  const d = j.jobDate.slice(0, 10);
  const start = buildDatetimeLocal(d, j.startTime);
  const t0 = new Date(start).getTime();
  const end = toDatetimeLocalString(new Date(t0 + j.durationMinutes * 60_000));
  return { startValue: start, endValue: end };
}

function rangeToJobBody(startValue: string, endValue: string) {
  const a = new Date(startValue);
  const b = new Date(endValue);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime()) || b <= a) return null;
  const durationMinutes = Math.max(1, Math.round((b.getTime() - a.getTime()) / 60_000));
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
}: {
  eventId: string;
  show: EventShow;
  venues: VenueOpt[] | undefined;
  people: Person[] | undefined;
}) {
  const queryClient = useQueryClient();
  const jobs = show.jobs ?? [];
  const [draft, setDraft] = useState<{
    title: string;
    startValue: string;
    endValue: string;
    venueId: string;
    personId: string;
  } | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["event", eventId] });

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
      personId: "",
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
      personId: draft.personId || null,
    });
    setDraft(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-white/45">Jobs for this show</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 border-white/10 text-white/80 bg-transparent"
          onClick={startAdd}
          disabled={createJob.isPending}
        >
          <Plus size={12} className="mr-1" /> Add job
        </Button>
      </div>
      {jobs.length === 0 && !draft ? (
        <p className="text-sm text-white/35">No jobs yet. Add call times, get-in, rehearsals, or any work block.</p>
      ) : null}

      {jobs.map((j) => {
        const w = jobWindow(j);
        return (
          <div
            key={j.id}
            className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-3"
          >
            <div className="flex flex-wrap items-end gap-2 justify-between">
              <div className="grid gap-1 min-w-0 flex-1 sm:max-w-xs">
                <Label className="text-white/45 text-[10px] uppercase tracking-wide">Title</Label>
                <Input
                  defaultValue={j.title}
                  key={j.id}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== j.title) updateJob.mutate({ jobId: j.id, body: { title: v } });
                  }}
                  className="bg-white/5 border-white/10 text-white h-9"
                />
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-white/40 hover:text-white"
                  title="Copy job (clear person)"
                  onClick={() => {
                    const { startValue, endValue } = w;
                    const a = new Date(startValue);
                    const b = new Date(endValue);
                    const durationMinutes = Math.max(1, Math.round((b.getTime() - a.getTime()) / 60_000));
                    createJob.mutate({
                      title: j.title,
                      jobDate: j.jobDate.slice(0, 10),
                      startTime: j.startTime,
                      durationMinutes,
                      venueId: j.venueId,
                      personId: null,
                    });
                  }}
                >
                  <Copy size={14} />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-white/40 hover:text-red-400"
                  onClick={() => {
                    if (!confirm("Delete this job?")) return;
                    deleteJob.mutate(j.id);
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
            <DatetimeScheduleFields
              startValue={w.startValue}
              endValue={w.endValue}
              onStartChange={(ns) => {
                const ne = toDatetimeLocalString(
                  new Date(new Date(ns).getTime() + j.durationMinutes * 60_000)
                );
                const body = rangeToJobBody(ns, ne);
                if (body) updateJob.mutate({ jobId: j.id, body });
              }}
              onEndChange={(ne) => {
                const body = rangeToJobBody(w.startValue, ne);
                if (body) updateJob.mutate({ jobId: j.id, body });
              }}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-white/45 text-[10px] uppercase tracking-wide block mb-1">Venue</Label>
                <Select
                  value={j.venueId}
                  onValueChange={(venueId) => updateJob.mutate({ jobId: j.id, body: { venueId } })}
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white w-full h-9">
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
              <div>
                <Label className="text-white/45 text-[10px] uppercase tracking-wide block mb-1">Person</Label>
                <Select
                  value={j.personId ?? "__none__"}
                  onValueChange={(v) =>
                    updateJob.mutate({ jobId: j.id, body: { personId: v === "__none__" ? null : v } })
                  }
                >
                  <SelectTrigger className="bg-white/5 border-white/10 text-white w-full h-9">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#16161f] border-white/10 text-white">
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {(people ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );
      })}

      {draft ? (
        <div className="rounded-lg border border-dashed border-white/20 p-3 space-y-3">
          <p className="text-xs text-white/50">New job</p>
          <div>
            <Label className="text-white/45 text-[10px] uppercase tracking-wide">Title</Label>
            <Input
              value={draft.title}
              onChange={(e) => setDraft((d) => (d ? { ...d, title: e.target.value } : d))}
              className="bg-white/5 border-white/10 text-white h-9 mt-1"
            />
          </div>
          <DatetimeScheduleFields
            startValue={draft.startValue}
            endValue={draft.endValue}
            onStartChange={(v) => setDraft((d) => (d ? { ...d, startValue: v } : d))}
            onEndChange={(v) => setDraft((d) => (d ? { ...d, endValue: v } : d))}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-white/45 text-[10px] uppercase tracking-wide block mb-1">Venue</Label>
              <Select
                value={draft.venueId}
                onValueChange={(venueId) => setDraft((d) => (d ? { ...d, venueId } : d))}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-white w-full h-9">
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
            <div>
              <Label className="text-white/45 text-[10px] uppercase tracking-wide block mb-1">Person</Label>
              <Select
                value={draft.personId || "__none__"}
                onValueChange={(personId) =>
                  setDraft((d) => (d ? { ...d, personId: personId === "__none__" ? "" : personId } : d))
                }
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-white w-full h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#16161f] border-white/10 text-white">
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {(people ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="bg-red-900 hover:bg-red-800"
              onClick={saveDraft}
              disabled={createJob.isPending}
            >
              Save job
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
