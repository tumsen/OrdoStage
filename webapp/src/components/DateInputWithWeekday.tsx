import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  formatDdMmYyyy,
  formatWeekdayOnly,
  isoDateToLocalDate,
  localDateToIso,
  todayIsoDate,
} from "@/lib/dateUtils";
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

const CALENDAR_POPOVER_CLASS =
  "w-auto p-0 border-white/10 bg-[#16161f] text-white shadow-xl";

const CALENDAR_CLASS_NAMES = {
  months: "flex flex-col",
  month: "space-y-3",
  caption: "flex justify-center pt-1 relative items-center",
  caption_label: "text-sm font-medium text-white",
  nav: "space-x-1 flex items-center",
  nav_button: cn(
    "inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-transparent p-0 text-white/70 hover:bg-white/10 hover:text-white",
  ),
  nav_button_previous: "absolute left-1",
  nav_button_next: "absolute right-1",
  table: "w-full border-collapse space-y-1",
  head_row: "flex",
  head_cell: "w-9 font-normal text-[0.8rem] text-white/45",
  row: "flex w-full mt-2",
  cell: "h-9 w-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
  day: cn(
    "h-9 w-9 p-0 font-normal text-white/90 hover:bg-white/10 hover:text-white aria-selected:opacity-100",
  ),
  day_selected:
    "bg-red-900 text-white hover:bg-red-800 hover:text-white focus:bg-red-900 focus:text-white",
  day_today: "bg-white/10 text-white",
  day_outside: "text-white/30 opacity-50",
  day_disabled: "text-white/20 opacity-50",
  day_hidden: "invisible",
};

type DateInputWithWeekdayProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  weekdayClassName?: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** @deprecated Calendar popover is always used; kept for call-site compatibility. */
  showTodayButton?: boolean;
  /** Today shortcut in the calendar footer (default true). */
  showTodayInPicker?: boolean;
  /** Clear shortcut in the calendar footer when a date is set. */
  allowClear?: boolean;
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

/** Event schedule date field (same calendar popover as all date inputs). */
export function EventStartDateInput({
  className,
  weekdayClassName,
  ...props
}: Omit<DateInputWithWeekdayProps, "showTodayButton">) {
  return (
    <DateInputWithWeekday
      {...props}
      className={cn(eventScheduleDateInputClassName, className)}
      weekdayClassName={weekdayClassName ?? eventScheduleDateWeekdayClassName}
    />
  );
}

export function DateInputWithWeekday({
  value,
  onChange,
  className,
  weekdayClassName,
  disabled,
  readOnly,
  showTodayInPicker = true,
  allowClear = false,
}: DateInputWithWeekdayProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => isoDateToLocalDate(value) ?? new Date());

  useEffect(() => {
    setDisplayValue(value);
    const d = isoDateToLocalDate(value);
    if (d) setMonth(d);
  }, [value]);

  const applyValue = (next: string) => {
    setDisplayValue(next);
    onChange(next);
    const d = isoDateToLocalDate(next);
    if (d) setMonth(d);
  };

  const pickToday = () => {
    applyValue(todayIsoDate());
    setOpen(false);
  };

  const clearDate = () => {
    applyValue("");
    setOpen(false);
  };

  const boxClassName = cn(
    "relative rounded-md border border-white/15 bg-white/[0.04] text-white text-xs",
    "h-8 min-h-8 focus-within:border-white/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/25 [color-scheme:dark]",
    DATE_INPUT_WITH_WEEKDAY_LAYOUT_CLASS,
    className,
    disabled && "pointer-events-none opacity-40",
  );

  const selectedDate = isoDateToLocalDate(displayValue);
  const showFooter = showTodayInPicker || (allowClear && Boolean(displayValue));

  if (readOnly) {
    return (
      <div className={cn("inline-flex items-center px-3", boxClassName)}>
        <DateDisplay value={displayValue} weekdayClassName={weekdayClassName} />
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(boxClassName, "inline-flex cursor-pointer items-center px-3 text-left")}
          aria-label="Choose date"
          aria-expanded={open}
        >
          <DateDisplay value={displayValue} weekdayClassName={weekdayClassName} />
        </button>
      </PopoverTrigger>
      <PopoverContent className={CALENDAR_POPOVER_CLASS} align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          month={month}
          onMonthChange={setMonth}
          onSelect={(d) => {
            if (!d) return;
            applyValue(localDateToIso(d));
            setOpen(false);
          }}
          classNames={CALENDAR_CLASS_NAMES}
          initialFocus
        />
        {showFooter ? (
          <div className="flex gap-1 border-t border-white/10 p-2">
            {showTodayInPicker ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 flex-1 text-xs text-white/70 hover:bg-white/10 hover:text-white"
                onClick={pickToday}
              >
                Today
              </Button>
            ) : null}
            {allowClear && displayValue ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 flex-1 text-xs text-white/50 hover:bg-white/10 hover:text-white/80"
                onClick={clearDate}
              >
                Clear
              </Button>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
