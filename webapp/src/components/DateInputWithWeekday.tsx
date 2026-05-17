import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { formatDdMmYyyy, formatWeekdayOnly, todayIsoDate } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

/** Longest `en-US` weekday (`formatWeekdayOnly` locale). */
export const DATE_INPUT_SIZING_WEEKDAY = "Wednesday";

/** Widest `DD/MM/YYYY` run with tabular figures. */
export const DATE_INPUT_SIZING_DATE = "31/12/2026";

/** Fixed width from sizing row; same height/chrome everywhere. */
export const DATE_INPUT_WITH_WEEKDAY_LAYOUT_CLASS =
  "relative inline-flex shrink-0";

/** Time page week/month anchor — canonical date field styling app-wide. */
export const timeNavDateInputClassName = cn(
  "h-8 min-h-8 border-white/15 bg-white/[0.04] text-xs [color-scheme:dark]",
  DATE_INPUT_WITH_WEEKDAY_LAYOUT_CLASS,
);

export const timeNavDateWeekdayClassName = "text-xs text-white/45";

export const timeNavDateValueClassName =
  "shrink-0 font-mono text-xs tabular-nums tracking-tight text-white/90";

export const eventScheduleDateInputClassName = timeNavDateInputClassName;

export const eventScheduleDateWeekdayClassName = timeNavDateWeekdayClassName;

const DEFAULT_WEEKDAY_CLASS = timeNavDateWeekdayClassName;

type DateInputWithWeekdayProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  weekdayClassName?: string;
  disabled?: boolean;
  readOnly?: boolean;
  showTodayButton?: boolean;
};

function DateDisplay({
  value,
  weekdayClassName,
}: {
  value: string;
  weekdayClassName?: string;
}) {
  const weekdayClass = cn("shrink-0 whitespace-nowrap", weekdayClassName ?? DEFAULT_WEEKDAY_CLASS);

  return (
    <div className="inline-grid text-xs">
      <div
        className="col-start-1 row-start-1 flex items-center gap-2 invisible pointer-events-none"
        aria-hidden
      >
        <span className={weekdayClass}>{DATE_INPUT_SIZING_WEEKDAY}</span>
        <span className={timeNavDateValueClassName}>{DATE_INPUT_SIZING_DATE}</span>
      </div>
      <div className="col-start-1 row-start-1 flex items-center gap-2">
        <span className={weekdayClass}>{formatWeekdayOnly(value)}</span>
        <span className={timeNavDateValueClassName}>{formatDdMmYyyy(value)}</span>
      </div>
    </div>
  );
}

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

  const boxClassName = cn(
    "relative rounded-md border border-white/15 bg-white/[0.04] text-white text-xs",
    "h-8 min-h-8 focus-within:border-white/30 [color-scheme:dark]",
    DATE_INPUT_WITH_WEEKDAY_LAYOUT_CLASS,
    className,
    disabled && "pointer-events-none opacity-40",
  );

  const dateBox = readOnly ? (
    <div className={cn("inline-flex items-center px-3", boxClassName)}>
      <DateDisplay value={value} weekdayClassName={weekdayClassName} />
    </div>
  ) : (
    <div className={boxClassName}>
      <div className="flex h-full items-center px-3">
        <DateDisplay value={value} weekdayClassName={weekdayClassName} />
      </div>
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
          "[color-scheme:dark]",
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
        className="h-8 shrink-0 px-2.5 text-xs text-white/50 hover:bg-white/10 hover:text-white/80"
        onClick={() => onChange(todayIsoDate())}
      >
        Today
      </Button>
    </div>
  );
}
