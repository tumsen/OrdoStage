import { useMutation } from "@tanstack/react-query";
import { useMemo } from "react";

import { scheduleFieldLabelClass } from "@/components/ScheduleTimeRow";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { jobPeopleNeeded, jobSlotPersonIds, MAX_JOB_PEOPLE_NEEDED } from "@/lib/eventShowStaffing";
import { cn } from "@/lib/utils";
import type { EventShowJob, Person } from "@/lib/types";

const personSelectTriggerClass =
  "bg-white/5 border-white/10 text-white h-10 w-[10.5rem] min-w-[10.5rem] sm:w-56 sm:min-w-[14rem]";

export function JobPeopleAssignees({
  eventId,
  showId,
  job,
  people,
  canEdit,
  onChanged,
}: {
  eventId: string;
  showId: string;
  job: EventShowJob;
  people: Person[] | undefined;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const needed = jobPeopleNeeded(job);
  const slots = jobSlotPersonIds(job);

  const updateJob = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.put(`/api/events/${eventId}/shows/${showId}/jobs/${job.id}`, body),
    onSuccess: onChanged,
  });

  const saveSlots = (nextSlots: (string | null)[]) => {
    updateJob.mutate({ slotPersonIds: nextSlots });
  };

  const changeNeeded = (raw: string) => {
    const n = Math.min(MAX_JOB_PEOPLE_NEEDED, Math.max(1, Number.parseInt(raw, 10) || 1));
    const nextSlots: (string | null)[] = Array.from({ length: n }, (_, i) => slots[i] ?? null);
    updateJob.mutate({ peopleNeeded: n, slotPersonIds: nextSlots });
  };

  const setSlot = (slotIndex: number, personId: string | null) => {
    const next = [...slots];
    next[slotIndex] = personId;
    saveSlots(next);
  };

  const roster = people ?? [];

  return (
    <div className="shrink-0 flex flex-col gap-2 min-w-[10.5rem] sm:min-w-[14rem]">
      <div className="flex items-end gap-2">
        <div className="w-16 shrink-0">
          <Label className={scheduleFieldLabelClass}>Needed</Label>
          <Input
            type="number"
            min={1}
            max={MAX_JOB_PEOPLE_NEEDED}
            value={needed}
            onChange={(e) => changeNeeded(e.target.value)}
            onBlur={(e) => changeNeeded(e.target.value)}
            className="bg-white/5 border-white/10 text-white h-10 tabular-nums"
            disabled={!canEdit || updateJob.isPending}
          />
        </div>
        <p className="text-[10px] text-white/35 pb-2.5">
          {slots.filter(Boolean).length}/{needed} filled
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: needed }, (_, slotIndex) => (
          <JobSlotSelect
            key={slotIndex}
            slotIndex={slotIndex}
            value={slots[slotIndex] ?? null}
            roster={roster}
            otherSlots={slots}
            canEdit={canEdit && !updateJob.isPending}
            onChange={(personId) => setSlot(slotIndex, personId)}
          />
        ))}
      </div>
    </div>
  );
}

function JobSlotSelect({
  slotIndex,
  value,
  roster,
  otherSlots,
  canEdit,
  onChange,
}: {
  slotIndex: number;
  value: string | null;
  roster: Person[];
  otherSlots: (string | null)[];
  canEdit: boolean;
  onChange: (personId: string | null) => void;
}) {
  const takenElsewhere = useMemo(() => {
    const s = new Set<string>();
    otherSlots.forEach((id, i) => {
      if (i !== slotIndex && id) s.add(id);
    });
    return s;
  }, [otherSlots, slotIndex]);

  const options = roster.filter((p) => p.id === value || !takenElsewhere.has(p.id));

  return (
    <div>
      <Label className={cn(scheduleFieldLabelClass, "text-[10px]")}>Person {slotIndex + 1}</Label>
      <Select
        value={value ?? "__none__"}
        onValueChange={(v) => onChange(v === "__none__" ? null : v)}
        disabled={!canEdit}
      >
        <SelectTrigger className={personSelectTriggerClass}>
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent className="bg-[#16161f] border-white/10 text-white">
          <SelectItem value="__none__">Unassigned</SelectItem>
          {options.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
