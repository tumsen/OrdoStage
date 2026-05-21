import { scheduleFieldLabelClass } from "@/components/ScheduleTimeRow";
import { JobPersonSlotPicker } from "@/components/event/JobPersonSlotPicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_JOB_PEOPLE_NEEDED } from "@/lib/eventShowStaffing";
import { cn } from "@/lib/utils";
import type { Person } from "@/lib/types";

/** Headcount field for job editor top row (after venue). */
export function JobNeededField({
  value,
  filled,
  disabled,
  onChange,
  className,
}: {
  value: number;
  filled: number;
  disabled?: boolean;
  onChange: (n: number) => void;
  className?: string;
}) {
  const setFromRaw = (raw: string) => {
    const n = Math.min(MAX_JOB_PEOPLE_NEEDED, Math.max(1, Number.parseInt(raw, 10) || 1));
    onChange(n);
  };

  return (
    <div className={cn("shrink-0 w-14", className)}>
      <Label className={scheduleFieldLabelClass}>Needed</Label>
      <Input
        type="number"
        min={1}
        max={MAX_JOB_PEOPLE_NEEDED}
        value={value}
        onChange={(e) => setFromRaw(e.target.value)}
        onBlur={(e) => setFromRaw(e.target.value)}
        className="bg-white/5 border-white/10 text-white h-10 tabular-nums px-2"
        disabled={disabled}
        title={`${filled} of ${value} slots filled`}
      />
    </div>
  );
}

/** Person assignment slots on one wrapping row below job settings. */
export function JobPersonSlotsRow({
  peopleNeeded,
  slotPersonIds,
  roster,
  disabled,
  onSlotChange,
  className,
}: {
  peopleNeeded: number;
  slotPersonIds: (string | null)[];
  roster: Person[];
  disabled?: boolean;
  onSlotChange: (slotIndex: number, personId: string | null) => void;
  className?: string;
}) {
  const filled = slotPersonIds.filter(Boolean).length;

  if (peopleNeeded <= 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-x-2 gap-y-2 pt-2 border-t border-white/[0.06] -mx-0.5 px-0.5",
        className
      )}
    >
      {Array.from({ length: peopleNeeded }, (_, slotIndex) => {
        const takenElsewhere = new Set(
          slotPersonIds.flatMap((id, i) => (i !== slotIndex && id ? [id] : []))
        );
        return (
          <JobPersonSlotPicker
            key={slotIndex}
            slotIndex={slotIndex}
            value={slotPersonIds[slotIndex] ?? null}
            roster={roster}
            takenElsewhere={takenElsewhere}
            disabled={disabled}
            onChange={(personId) => onSlotChange(slotIndex, personId)}
          />
        );
      })}
      <p className="text-[10px] text-white/35 self-center pb-2.5 shrink-0">
        {filled}/{peopleNeeded} filled
      </p>
    </div>
  );
}
