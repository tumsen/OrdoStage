import { useMutation } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";

import { scheduleFieldLabelClass } from "@/components/ScheduleTimeRow";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { jobAssignees } from "@/lib/eventShowStaffing";
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
  const [pickId, setPickId] = useState("");
  const assignees = jobAssignees(job);
  const assignedIds = new Set(assignees.map((p) => p.id));
  const available = (people ?? []).filter((p) => !assignedIds.has(p.id));

  const addPerson = useMutation({
    mutationFn: (personId: string) =>
      api.post(`/api/events/${eventId}/shows/${showId}/jobs/${job.id}/people`, { personId }),
    onSuccess: () => {
      setPickId("");
      onChanged();
    },
  });

  const removePerson = useMutation({
    mutationFn: (personId: string) =>
      api.delete(`/api/events/${eventId}/shows/${showId}/jobs/${job.id}/people/${personId}`),
    onSuccess: onChanged,
  });

  return (
    <div className="shrink-0 min-w-[10.5rem] sm:min-w-[14rem]">
      <Label className={scheduleFieldLabelClass}>People</Label>
      <div className="space-y-1.5 min-h-10">
        {assignees.length === 0 ? (
          <p className="text-xs text-white/35 h-10 flex items-center">Unassigned</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {assignees.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-sm text-white/85"
              >
                <span className="min-w-0 truncate flex-1">{p.name}</span>
                {canEdit ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-white/40 hover:text-red-400"
                    title={`Remove ${p.name}`}
                    onClick={() => removePerson.mutate(p.id)}
                    disabled={removePerson.isPending}
                  >
                    <X size={14} />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEdit && available.length > 0 ? (
          <div className="flex items-center gap-1 pt-0.5">
            <Select value={pickId || "__pick__"} onValueChange={(v) => setPickId(v === "__pick__" ? "" : v)}>
              <SelectTrigger className={personSelectTriggerClass}>
                <SelectValue placeholder="Add person…" />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white">
                <SelectItem value="__pick__">Add person…</SelectItem>
                {available.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-10 w-10 shrink-0 border-white/10 text-white/80"
              title="Add person to job"
              disabled={!pickId || addPerson.isPending}
              onClick={() => pickId && addPerson.mutate(pickId)}
            >
              <Plus size={14} />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
