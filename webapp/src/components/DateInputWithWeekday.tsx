import { useRef } from "react";

import { formatWeekdayOnly } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

/**
 * Single fixed width everywhere: horizontal padding + column for longest en-US weekday ("Wednesday")
 * + gap + remaining space for the native date control (no clipping at typical font sizes).
 */
export const DATE_INPUT_WITH_WEEKDAY_FIXED_WIDTH_CLASS =
  "flex w-[17rem] min-w-[17rem] max-w-[17rem] shrink-0";

/** Width reserved for `weekday: "long"` — longest label is Wednesday (9 letters). */
const WEEKDAY_COLUMN_CLASS = "w-[5.75rem] min-w-[5.75rem] shrink-0";

type DateInputWithWeekdayProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  weekdayClassName?: string;
  disabled?: boolean;
  readOnly?: boolean;
};

export function DateInputWithWeekday({
  value,
  onChange,
  className,
  weekdayClassName,
  disabled,
  readOnly,
}: DateInputWithWeekdayProps) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div
      className={cn(
        "h-10 rounded-md border border-white/10 bg-white/5 text-white",
        "focus-within:border-white/30",
        "items-center gap-2 px-3",
        DATE_INPUT_WITH_WEEKDAY_FIXED_WIDTH_CLASS,
        disabled && "opacity-40",
        className
      )}
    >
      <div
        className={cn(
          "text-[11px] text-white/55 whitespace-nowrap",
          WEEKDAY_COLUMN_CLASS,
          weekdayClassName
        )}
      >
        {formatWeekdayOnly(value)}
      </div>
      <input
        ref={ref}
        type="date"
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        onClick={() => ref.current?.showPicker?.()}
        onFocus={() => ref.current?.showPicker?.()}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-9 min-w-0 flex-1 bg-transparent border-0 rounded-none text-white",
          "focus:outline-none [color-scheme:dark]"
        )}
      />
    </div>
  );
}
