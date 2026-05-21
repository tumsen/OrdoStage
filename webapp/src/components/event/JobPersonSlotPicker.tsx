import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { scheduleFieldLabelClass } from "@/components/ScheduleTimeRow";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Person } from "@/lib/types";

const triggerClass =
  "h-10 w-full min-w-0 max-w-none justify-between bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white font-normal text-sm";

export function JobPersonSlotPicker({
  slotIndex,
  value,
  roster,
  takenElsewhere,
  overlapBusy,
  disabled,
  onChange,
}: {
  slotIndex: number;
  value: string | null;
  roster: Person[];
  takenElsewhere: Set<string>;
  /** Assigned to another job on this show that overlaps this job's time. */
  overlapBusy?: Set<string>;
  disabled?: boolean;
  onChange: (personId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = roster.find((p) => p.id === value);
  const busy = overlapBusy ?? new Set<string>();
  const options = useMemo(
    () => roster.filter((p) => p.id === value || !takenElsewhere.has(p.id)),
    [roster, value, takenElsewhere]
  );

  return (
    <div className="min-w-0 w-full">
      <Label className={cn(scheduleFieldLabelClass, "text-[10px]")}>Person {slotIndex + 1}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={triggerClass}
          >
            <span className={cn("truncate text-left", !selected && "text-white/40")}>
              {selected?.name ?? "Unassigned"}
            </span>
            <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[12rem] p-0 bg-[#16161f] border-white/10 text-white"
          align="start"
        >
          <Command className="bg-[#16161f] text-white [&_[cmdk-input-wrapper]]:border-white/10">
            <CommandInput
              placeholder="Search people…"
              className="text-white placeholder:text-white/35 h-9"
            />
            <CommandList>
              <CommandEmpty className="text-white/50 py-3 text-sm">No matches</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__none__ unassigned"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="text-white aria-selected:bg-white/10"
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5", value ? "opacity-0" : "opacity-100")} />
                  Unassigned
                </CommandItem>
                {options.map((p) => {
                  const overlaps = busy.has(p.id) && p.id !== value;
                  return (
                    <CommandItem
                      key={p.id}
                      value={`${p.name} ${p.email ?? ""} ${p.id}`}
                      onSelect={() => {
                        if (overlaps) return;
                        onChange(p.id);
                        setOpen(false);
                      }}
                      disabled={overlaps}
                      className={cn(
                        "text-white aria-selected:bg-white/10",
                        overlaps && "text-red-400 opacity-100 cursor-not-allowed"
                      )}
                    >
                      <Check
                        className={cn("mr-2 h-3.5 w-3.5", value === p.id ? "opacity-100" : "opacity-0")}
                      />
                      <span className="truncate">{p.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
