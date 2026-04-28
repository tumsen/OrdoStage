import { useRef } from "react";

import { formatWeekdayDate } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

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
        "w-full h-9 rounded-md border border-white/10 bg-white/5 text-white",
        "focus-within:border-white/30",
        "flex items-center gap-2 px-3",
        disabled && "opacity-40",
        className
      )}
    >
      <div className={cn("text-[11px] text-white/55 whitespace-nowrap shrink-0", weekdayClassName)}>
        {formatWeekdayDate(value)}
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
          "ml-auto h-7 min-w-[8.5rem] bg-transparent border-0 rounded-none text-white",
          "focus:outline-none [color-scheme:dark]"
        )}
      />
    </div>
  );
}
