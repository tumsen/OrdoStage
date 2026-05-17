import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { formatDdMmYyyy, formatWeekdayOnly, todayIsoDate } from "@/lib/dateUtils";
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
  showTodayButton?: boolean;
};

export function DateInputWithWeekday({
  value,
  onChange,
  className,
  weekdayClassName,
  disabled,
  readOnly,
  showTodayButton = false,
}: DateInputWithWeekdayProps) {
  const ref = useRef<HTMLInputElement>(null);

  const display = (
    <div className="pointer-events-none flex min-w-0 items-center gap-2">
      <span
        className={cn(
          "shrink-0 text-sm text-white/55 whitespace-nowrap",
          weekdayClassName
        )}
      >
        {formatWeekdayOnly(value)}
      </span>
      <span className="shrink-0 font-mono text-sm tabular-nums tracking-tight text-white/90 whitespace-nowrap">
        {formatDdMmYyyy(value)}
      </span>
    </div>
  );

  const boxClassName = cn(
    className,
    "relative h-10 min-h-10 rounded-md border border-white/10 bg-white/5 text-white",
    "focus-within:border-white/30",
    DATE_INPUT_WITH_WEEKDAY_LAYOUT_CLASS,
    disabled && "pointer-events-none opacity-40",
  );

  const dateBox = readOnly ? (
    <div className={cn("inline-flex items-center gap-2 px-3", boxClassName)}>{display}</div>
  ) : (
    <div className={boxClassName}>
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

  if (!showTodayButton || readOnly) {
    return dateBox;
  }

  return (
    <div className="inline-flex max-w-full items-end gap-1.5">
      {dateBox}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        className="h-10 shrink-0 px-2.5 text-xs text-white/50 hover:bg-white/10 hover:text-white/80"
        onClick={() => onChange(todayIsoDate())}
      >
        Today
      </Button>
    </div>
  );
}
