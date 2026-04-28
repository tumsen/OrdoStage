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
    <div className="space-y-1">
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
          "w-full h-9 px-3 text-sm bg-white/5 border border-white/10 rounded-md text-white focus:outline-none focus:border-white/30 [color-scheme:dark]",
          className
        )}
      />
      <div className={cn("text-[11px] text-white/45", weekdayClassName)}>{formatWeekdayDate(value)}</div>
    </div>
  );
}
