import { useEffect, useState } from "react";

import { jobEditorFieldFocusClass, scheduleFieldLabelClass } from "@/components/ScheduleTimeRow";
import { JobPersonSlotPicker } from "@/components/event/JobPersonSlotPicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_JOB_PEOPLE_NEEDED,
  MIN_JOB_PEOPLE_NEEDED,
} from "@/lib/eventShowStaffing";
import { cn } from "@/lib/utils";
import type { Person } from "@/lib/types";

/** Parse Needed field text: empty → fallback; 0 or invalid → 1; cap at 99. */
export function parseJobPeopleNeededInput(raw: string, fallback = MIN_JOB_PEOPLE_NEEDED): number {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return fallback;
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n < MIN_JOB_PEOPLE_NEEDED) return MIN_JOB_PEOPLE_NEEDED;
  return Math.min(MAX_JOB_PEOPLE_NEEDED, n);
}

/** Headcount field for job editor top row (after venue). Plain digits only, no spinner arrows. */
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
  onChange: (n: number, options?: { viaEnter?: boolean }) => void;
  className?: string;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = (raw: string, viaEnter?: boolean) => {
    const n = parseJobPeopleNeededInput(raw, value || MIN_JOB_PEOPLE_NEEDED);
    setText(String(n));
    if (n !== value) onChange(n, { viaEnter });
    else if (viaEnter) onChange(n, { viaEnter });
  };

  return (
    <div className={cn("shrink-0 w-14", className)}>
      <Label className={scheduleFieldLabelClass}>Needed</Label>
      <Input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={2}
        value={text}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
          setText(digits);
        }}
        onBlur={() => commit(text, false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(text, true);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={cn(
          "block h-10 min-h-10 bg-white/5 border-white/10 text-white text-sm tabular-nums px-2 py-0 leading-none",
          jobEditorFieldFocusClass,
          "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        )}
        disabled={disabled}
        title={`${filled} of ${value} people · enter 1–${MAX_JOB_PEOPLE_NEEDED}`}
        aria-label={`People needed, ${filled} of ${value} assigned`}
      />
    </div>
  );
}

/** Person assignment slots on one wrapping row below job settings. */
export function JobPersonSlotsRow({
  peopleNeeded,
  slotPersonIds,
  roster,
  overlapBusy,
  disabled,
  onSlotChange,
  className,
}: {
  peopleNeeded: number;
  slotPersonIds: (string | null)[];
  roster: Person[];
  overlapBusy?: Set<string>;
  disabled?: boolean;
  onSlotChange: (slotIndex: number, personId: string | null) => void;
  className?: string;
}) {
  const filled = slotPersonIds.filter(Boolean).length;
  const slots = Math.max(MIN_JOB_PEOPLE_NEEDED, peopleNeeded);
  const busy = overlapBusy ?? new Set<string>();

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-x-2 gap-y-2 mt-1 pt-5 border-t border-white/[0.06]",
        className
      )}
    >
      {Array.from({ length: slots }, (_, slotIndex) => {
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
            overlapBusy={busy}
            disabled={disabled}
            onChange={(personId) => onSlotChange(slotIndex, personId)}
          />
        );
      })}
      <p className="text-[10px] text-white/35 self-center pb-2.5 shrink-0">
        {filled}/{slots} filled
      </p>
    </div>
  );
}
