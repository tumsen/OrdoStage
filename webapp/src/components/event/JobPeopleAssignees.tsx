import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { JobNeededField, JobPersonSlotsRow } from "@/components/event/JobPeopleFields";
import { api } from "@/lib/api";
import { overlappingPersonIdsForJob, wouldPersonOverlapOnJob } from "@/lib/eventJobConflicts";
import {
  confirmRemoveAssigneesOnNeededReduction,
  jobPeopleNeeded,
  jobSlotPersonIds,
  slotsAfterPeopleNeededChange,
} from "@/lib/eventShowStaffing";
import { toast } from "@/hooks/use-toast";
import type { EventShow, EventShowJob, Person } from "@/lib/types";

/** Needed count — place in the job settings row after venue. */
export function JobNeededControl({
  eventId,
  showId,
  job,
  canEdit,
  onChanged,
}: {
  eventId: string;
  showId: string;
  job: EventShowJob;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const needed = jobPeopleNeeded(job);
  const slots = jobSlotPersonIds(job);

  const updateJob = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.put(`/api/events/${eventId}/shows/${showId}/jobs/${job.id}`, body),
    onSuccess: onChanged,
  });

  const changeNeeded = (n: number, options?: { viaEnter?: boolean }) => {
    if (n === needed) {
      if (options?.viaEnter) {
        void queryClient.refetchQueries({ queryKey: ["event", eventId] });
      }
      return;
    }
    const { slotPersonIds: nextSlots, removedAssigneeIds } = slotsAfterPeopleNeededChange(slots, n);
    if (removedAssigneeIds.length > 0) {
      if (!confirmRemoveAssigneesOnNeededReduction(needed, n, removedAssigneeIds.length)) return;
    }
    updateJob.mutate(
      { peopleNeeded: n, slotPersonIds: nextSlots },
      {
        onSuccess: () => {
          onChanged();
          if (options?.viaEnter) {
            void queryClient.refetchQueries({ queryKey: ["event", eventId] });
          }
        },
      }
    );
  };

  return (
    <JobNeededField
      value={needed}
      filled={slots.filter(Boolean).length}
      disabled={!canEdit || updateJob.isPending}
      onChange={changeNeeded}
    />
  );
}

/** Person slots row — place below job settings. */
export function JobPeopleAssignees({
  eventId,
  showId,
  show,
  job,
  people,
  canEdit,
  onChanged,
}: {
  eventId: string;
  showId: string;
  show: EventShow;
  job: EventShowJob;
  people: Person[] | undefined;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const needed = jobPeopleNeeded(job);
  const slots = jobSlotPersonIds(job);
  const roster = people ?? [];

  const overlapBusy = useMemo(
    () => overlappingPersonIdsForJob(show, job.id),
    [show, job.id]
  );

  const updateJob = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.put(`/api/events/${eventId}/shows/${showId}/jobs/${job.id}`, body),
    onSuccess: onChanged,
    onError: (err: Error) => {
      toast({
        title: "Could not update assignment",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const setSlot = (slotIndex: number, personId: string | null) => {
    if (personId && wouldPersonOverlapOnJob(show, job.id, personId)) {
      toast({
        title: "Overlapping assignment",
        description: "This person is already assigned to another job at the same time.",
        variant: "destructive",
      });
      return;
    }
    const next = [...slots];
    next[slotIndex] = personId;
    updateJob.mutate({ slotPersonIds: next });
  };

  return (
    <JobPersonSlotsRow
      peopleNeeded={needed}
      slotPersonIds={slots}
      roster={roster}
      overlapBusy={overlapBusy}
      disabled={!canEdit || updateJob.isPending}
      onSlotChange={setSlot}
    />
  );
}
