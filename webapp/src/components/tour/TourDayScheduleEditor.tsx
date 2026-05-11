import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";

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
import { api } from "@/lib/api";
import {
  buildDatetimeLocal,
  normalizeTimeHHMM,
  parseDatetimeLocal,
  timeToMinutes,
} from "@/lib/showTiming";
import type {
  TourScheduleEvent,
  TourScheduleEventKind,
  TourShow,
} from "../../../../backend/src/types";
import { TourSameDayTimeFields } from "@/components/tour/TourSameDayTimeFields";
import { scheduleFieldLabelClass } from "@/components/ScheduleTimeRow";
import { cn } from "@/lib/utils";

const KIND_OPTIONS: { value: TourScheduleEventKind; label: string }[] = [
  { value: "get_in", label: "Get-in" },
  { value: "get_out", label: "Get-out" },
  { value: "show", label: "Show" },
  { value: "rehearsal", label: "Rehearsal" },
  { value: "soundcheck", label: "Soundcheck" },
  { value: "travel", label: "Travel" },
  { value: "custom", label: "Custom" },
];

type DraftEvent = {
  /** Stable key for list reconciliation when rows reorder by time */
  rowKey: string;
  kind: TourScheduleEventKind;
  customLabel: string;
  startValue: string;
  endValue: string;
  sortOrder: number;
};

function newDraftRowKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `row-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Parse start wall time to minutes from midnight for same-day ordering; invalid → end of list. */
function draftStartMinutes(d: DraftEvent): number {
  const t = normalizeTimeHHMM(parseDatetimeLocal(d.startValue).time || "");
  return timeToMinutes(t) ?? 24 * 60 + 1;
}

function draftEndMinutes(d: DraftEvent): number {
  const t = normalizeTimeHHMM(parseDatetimeLocal(d.endValue).time || "");
  return timeToMinutes(t) ?? 24 * 60 + 1;
}

/** Earliest start first; ties broken by end time, then kind label for stability */
function compareDraftsByTime(a: DraftEvent, b: DraftEvent): number {
  const sa = draftStartMinutes(a);
  const sb = draftStartMinutes(b);
  if (sa !== sb) return sa - sb;
  const ea = draftEndMinutes(a);
  const eb = draftEndMinutes(b);
  if (ea !== eb) return ea - eb;
  return a.kind.localeCompare(b.kind);
}

function sortDraftsByTime(drafts: DraftEvent[]): DraftEvent[] {
  return [...drafts].sort(compareDraftsByTime);
}

function toDraft(dayKey: string, e: TourScheduleEvent): DraftEvent {
  const st = normalizeTimeHHMM(e.startTime);
  const en = normalizeTimeHHMM(e.endTime);
  return {
    rowKey: e.id,
    kind: e.kind as TourScheduleEventKind,
    customLabel: e.customLabel ?? "",
    startValue: buildDatetimeLocal(dayKey, st || "09:00"),
    endValue: buildDatetimeLocal(dayKey, en || "10:00"),
    sortOrder: e.sortOrder,
  };
}

function draftsToPayload(drafts: DraftEvent[]) {
  return drafts.map((d, i) => {
    const st = normalizeTimeHHMM(parseDatetimeLocal(d.startValue).time || "");
    const en = normalizeTimeHHMM(parseDatetimeLocal(d.endValue).time || "");
    return {
      kind: d.kind,
      customLabel: d.kind === "custom" ? d.customLabel.trim() || null : null,
      startTime: st,
      endTime: en,
      sortOrder: i,
    };
  });
}

export function TourDayScheduleEditor({
  tourId,
  show,
  className,
}: {
  tourId: string;
  show: TourShow;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const dayKey = (show.dayKey ?? show.date.slice(0, 10)).slice(0, 10);

  const initialDrafts = useMemo(() => {
    const list = show.scheduleEvents ?? [];
    if (list.length === 0) {
      return sortDraftsByTime([
        {
          rowKey: newDraftRowKey(),
          kind: "get_in" as const,
          customLabel: "",
          startValue: buildDatetimeLocal(dayKey, "10:00"),
          endValue: buildDatetimeLocal(dayKey, "11:00"),
          sortOrder: 0,
        },
      ]);
    }
    return sortDraftsByTime(
      [...list].sort((a, b) => a.sortOrder - b.sortOrder).map((e) => toDraft(dayKey, e))
    );
  }, [show.scheduleEvents, dayKey]);

  const [drafts, setDrafts] = useState<DraftEvent[]>(initialDrafts);

  useEffect(() => {
    setDrafts(initialDrafts);
  }, [initialDrafts]);

  const saveMutation = useMutation({
    mutationFn: async (events: DraftEvent[]) => {
      const payload = draftsToPayload(events);
      return api.put<TourShow>(
        `/api/tours/${tourId}/shows/${show.id}/schedule-events`,
        { events: payload }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tour", tourId] });
    },
  });

  const updateRow = (index: number, patch: Partial<DraftEvent>) => {
    setDrafts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return sortDraftsByTime(next);
    });
  };

  const addRow = () => {
    setDrafts((prev) =>
      sortDraftsByTime([
        ...prev,
        {
          rowKey: newDraftRowKey(),
          kind: "custom",
          customLabel: "",
          startValue: buildDatetimeLocal(dayKey, "12:00"),
          endValue: buildDatetimeLocal(dayKey, "13:00"),
          sortOrder: prev.length,
        },
      ])
    );
  };

  const removeRow = (index: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className={cn("rounded-lg border border-white/10 bg-white/[0.02] px-2 py-2 sm:p-2.5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className="text-xs uppercase tracking-wide text-white/45 shrink-0">Day schedule</p>
        <div className="flex flex-wrap gap-1.5 justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-white/10 text-white/80 h-8"
            onClick={addRow}
          >
            <Plus size={13} className="mr-1" /> Add event
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-emerald-900/50 hover:bg-emerald-800/60 text-emerald-100 border border-emerald-700/40 h-8"
            disabled={saveMutation.isPending || drafts.length === 0}
            onClick={() => saveMutation.mutate(drafts)}
          >
            {saveMutation.isPending ? "Saving…" : "Save schedule"}
          </Button>
        </div>
      </div>
      <p className="text-[10px] text-white/30 mt-1 mb-2 hidden sm:block">
        Start, end, and duration use the same controls as event show jobs (24h HH:mm).
      </p>

      <div className="divide-y divide-white/[0.06] space-y-0">
        {drafts.map((row, idx) => (
          <div
            key={row.rowKey}
            className="flex flex-nowrap items-end gap-x-3 py-2 first:pt-0 last:pb-0 min-w-0 overflow-x-auto"
          >
            <div className="flex flex-nowrap items-end gap-x-3 flex-1 min-w-0">
              <div className="flex flex-col w-[8.25rem] sm:w-[9rem] shrink-0">
                <Label htmlFor={`tour-day-sched-type-${row.rowKey}`} className={scheduleFieldLabelClass}>
                  Type
                </Label>
                <Select
                  value={row.kind}
                  onValueChange={(v) =>
                    updateRow(idx, { kind: v as TourScheduleEventKind })
                  }
                >
                  <SelectTrigger
                    id={`tour-day-sched-type-${row.rowKey}`}
                    className="w-full bg-white/5 border-white/10 text-white h-10 min-h-10 py-0 px-3 text-sm leading-none box-border"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#16161f] border-white/10 text-white">
                    {KIND_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {row.kind === "custom" ? (
                <div className="flex flex-col min-w-[6rem] max-w-[12rem] shrink-0">
                  <Label htmlFor={`tour-day-sched-custom-${row.rowKey}`} className={scheduleFieldLabelClass}>
                    Custom label
                  </Label>
                  <Input
                    id={`tour-day-sched-custom-${row.rowKey}`}
                    value={row.customLabel}
                    onChange={(e) => updateRow(idx, { customLabel: e.target.value })}
                    placeholder="e.g. Production meeting"
                    className="bg-white/5 border-white/10 text-white h-10 text-sm"
                  />
                </div>
              ) : null}
              <TourSameDayTimeFields
                className="flex-1 min-w-0 pb-0 items-end"
                dayKey={dayKey}
                startValue={row.startValue}
                endValue={row.endValue}
                onStartChange={(v) => updateRow(idx, { startValue: v })}
                onEndChange={(v) => updateRow(idx, { endValue: v })}
              />
            </div>
            <div className="flex flex-col shrink-0">
              <span className={`${scheduleFieldLabelClass} invisible select-none`} aria-hidden>
                ·
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-white/25 hover:text-red-400 shrink-0"
                onClick={() => removeRow(idx)}
                aria-label="Remove event"
              >
                <Trash2 size={15} />
              </Button>
            </div>
          </div>
        ))}
      </div>
      {saveMutation.isError ? (
        <p className="text-xs text-red-400">Could not save schedule. Check times are HH:mm.</p>
      ) : null}
    </div>
  );
}
