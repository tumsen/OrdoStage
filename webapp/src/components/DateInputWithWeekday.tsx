import { useRef } from "react";

import { formatDdMmYyyy, formatWeekdayOnly } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

/**
 * Size to visible copy: longest weekday + `DD/MM/YYYY` (not a wide native date control).
 * Native `<input type="date">` is full-size but invisible; click/focus opens the picker.
 */
export const DATE_INPUT_WITH_WEEKDAY_LAYOUT_CLASS =
  "relative inline-flex w-max max-w-full min-w-0 shrink-0";

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

  const display = (
    <div className="pointer-events-none flex min-w-0 items-center gap-2">
      <span
        className={cn(
          "shrink-0 text-[11px] text-white/55 whitespace-nowrap",
          weekdayClassName
        )}
      >
        {formatWeekdayOnly(value)}
      </span>
      <span className="shrink-0 text-[11px] tabular-nums tracking-tight text-white/90 whitespace-nowrap">
        {formatDdMmYyyy(value)}
      </span>
    </div>
  );

  if (readOnly) {
    return (
      <div
        className={cn(
          "inline-flex h-10 min-h-10 items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 text-white",
          DATE_INPUT_WITH_WEEKDAY_LAYOUT_CLASS,
          disabled && "opacity-40",
          className
        )}
      >
        {display}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative h-10 min-h-10 rounded-md border border-white/10 bg-white/5 text-white",
        "focus-within:border-white/30",
        DATE_INPUT_WITH_WEEKDAY_LAYOUT_CLASS,
        disabled && "pointer-events-none opacity-40",
        className
      )}
    >
      <div className="flex h-full items-center px-3">{display}</div>
      <input
        ref={ref}
        type="date"
        value={value}
        disabled={disabled}
        onClick={() => ref.current?.showPicker?.()}
        onFocus={() => ref.current?.showPicker?.()}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0",
          "[color-scheme:dark]"
        )}
        aria-label="Date"
      />
    </div>
  );
}
