import { JobNeededField, JobPersonSlotsRow, parseJobPeopleNeededInput } from "@/components/event/JobPeopleFields";
import {
  confirmRemoveAssigneesOnNeededReduction,
  slotsAfterPeopleNeededChange,
} from "@/lib/eventShowStaffing";
import type { Person } from "@/lib/types";

export function JobNeededDraft({
  peopleNeeded,
  slotPersonIds,
  disabled,
  onPeopleNeededChange,
}: {
  peopleNeeded: number;
  slotPersonIds: (string | null)[];
  disabled?: boolean;
  onPeopleNeededChange: (n: number, slots: (string | null)[]) => void;
}) {
  const changeNeeded = (n: number) => {
    const capped = parseJobPeopleNeededInput(String(n), peopleNeeded);
    if (capped === peopleNeeded) return;
    const { slotPersonIds: nextSlots, removedAssigneeIds } = slotsAfterPeopleNeededChange(
      slotPersonIds,
      capped
    );
    if (removedAssigneeIds.length > 0) {
      if (!confirmRemoveAssigneesOnNeededReduction(peopleNeeded, capped, removedAssigneeIds.length)) {
        return;
      }
    }
    onPeopleNeededChange(capped, nextSlots);
  };

  return (
    <JobNeededField
      value={peopleNeeded}
      filled={slotPersonIds.filter(Boolean).length}
      disabled={disabled}
      onChange={(n) => changeNeeded(n)}
    />
  );
}

export function JobPeopleSlotsDraftRow({
  peopleNeeded,
  slotPersonIds,
  roster,
  overlapBusy,
  disabled,
  onSlotChange,
}: {
  peopleNeeded: number;
  slotPersonIds: (string | null)[];
  roster: Person[];
  overlapBusy?: Set<string>;
  disabled?: boolean;
  onSlotChange: (slots: (string | null)[]) => void;
}) {
  return (
    <JobPersonSlotsRow
      peopleNeeded={peopleNeeded}
      slotPersonIds={slotPersonIds}
      roster={roster}
      overlapBusy={overlapBusy}
      disabled={disabled}
      onSlotChange={(slotIndex, personId) => {
        const next = [...slotPersonIds];
        next[slotIndex] = personId;
        onSlotChange(next);
      }}
    />
  );
}
