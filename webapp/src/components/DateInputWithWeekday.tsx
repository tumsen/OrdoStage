import { useRef } from "react";

import { formatWeekdayOnly } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

/** Longest en-US `weekday: "long"` (~Wednesday) + gap + native `<input type="date">` (~11rem). */
export const DATE_INPUT_WITH_WEEKDAY_MIN_WIDTH_CLASS = "min-w-[21rem]";

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
        "w-full h-10 rounded-md border border-white/10 bg-white/5 text-white",
        "focus-within:border-white/30",
        "flex items-center gap-2 px-3",
        DATE_INPUT_WITH_WEEKDAY_MIN_WIDTH_CLASS,
        disabled && "opacity-40",
        className
      )}
    >
      <div
        className={cn(
          "text-[11px] text-white/55 whitespace-nowrap shrink-0 min-w-[7.25rem]",
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
          "h-9 min-w-[11rem] flex-1 basis-0 bg-transparent border-0 rounded-none text-white",
          "focus:outline-none [color-scheme:dark]"
        )}
      />
    </div>
  );
}
