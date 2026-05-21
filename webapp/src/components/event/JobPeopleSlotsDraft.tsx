import { scheduleFieldLabelClass } from "@/components/ScheduleTimeRow";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MAX_JOB_PEOPLE_NEEDED } from "@/lib/eventShowStaffing";
import { cn } from "@/lib/utils";
import type { Person } from "@/lib/types";

const personSelectTriggerClass =
  "bg-white/5 border-white/10 text-white h-10 w-[10.5rem] min-w-[10.5rem] sm:w-56 sm:min-w-[14rem]";

export function JobPeopleSlotsDraft({
  peopleNeeded,
  slotPersonIds,
  roster,
  disabled,
  onPeopleNeededChange,
  onSlotChange,
}: {
  peopleNeeded: number;
  slotPersonIds: (string | null)[];
  roster: Person[];
  disabled?: boolean;
  onPeopleNeededChange: (n: number, slots: (string | null)[]) => void;
  onSlotChange: (slots: (string | null)[]) => void;
}) {
  const changeNeeded = (raw: string) => {
    const n = Math.min(MAX_JOB_PEOPLE_NEEDED, Math.max(1, Number.parseInt(raw, 10) || 1));
    const nextSlots: (string | null)[] = Array.from({ length: n }, (_, i) => slotPersonIds[i] ?? null);
    onPeopleNeededChange(n, nextSlots);
  };

  const setSlot = (slotIndex: number, personId: string | null) => {
    const next = [...slotPersonIds];
    next[slotIndex] = personId;
    onSlotChange(next);
  };

  return (
    <div className="shrink-0 flex flex-col gap-2 min-w-[10.5rem] sm:min-w-[14rem]">
      <div className="w-16 shrink-0">
        <Label className={scheduleFieldLabelClass}>Needed</Label>
        <Input
          type="number"
          min={1}
          max={MAX_JOB_PEOPLE_NEEDED}
          value={peopleNeeded}
          onChange={(e) => changeNeeded(e.target.value)}
          className="bg-white/5 border-white/10 text-white h-10 tabular-nums"
          disabled={disabled}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: peopleNeeded }, (_, slotIndex) => {
          const value = slotPersonIds[slotIndex] ?? null;
          const takenElsewhere = new Set(
            slotPersonIds.flatMap((id, i) => (i !== slotIndex && id ? [id] : []))
          );
          const options = roster.filter((p) => p.id === value || !takenElsewhere.has(p.id));
          return (
            <div key={slotIndex}>
              <Label className={cn(scheduleFieldLabelClass, "text-[10px]")}>Person {slotIndex + 1}</Label>
              <Select
                value={value ?? "__none__"}
                onValueChange={(v) => setSlot(slotIndex, v === "__none__" ? null : v)}
                disabled={disabled}
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
        })}
      </div>
    </div>
  );
}
