import { JobNeededField, JobPersonSlotsRow, parseJobPeopleNeededInput } from "@/components/event/JobPeopleFields";
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
    const nextSlots: (string | null)[] = Array.from({ length: capped }, (_, i) => slotPersonIds[i] ?? null);
    onPeopleNeededChange(capped, nextSlots);
  };

  return (
    <JobNeededField
      value={peopleNeeded}
      filled={slotPersonIds.filter(Boolean).length}
      disabled={disabled}
      onChange={changeNeeded}
    />
  );
}

export function JobPeopleSlotsDraftRow({
  peopleNeeded,
  slotPersonIds,
  roster,
  disabled,
  onSlotChange,
}: {
  peopleNeeded: number;
  slotPersonIds: (string | null)[];
  roster: Person[];
  disabled?: boolean;
  onSlotChange: (slots: (string | null)[]) => void;
}) {
  return (
    <JobPersonSlotsRow
      peopleNeeded={peopleNeeded}
      slotPersonIds={slotPersonIds}
      roster={roster}
      disabled={disabled}
      onSlotChange={(slotIndex, personId) => {
        const next = [...slotPersonIds];
        next[slotIndex] = personId;
        onSlotChange(next);
      }}
    />
  );
}
