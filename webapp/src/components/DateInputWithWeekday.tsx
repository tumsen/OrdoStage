import { useEffect, useRef, useState } from "react";

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
  /** Opens a calendar popover with a Today action (not a separate field button). */
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

/** Event show / get-in date with calendar popover including Today. */
export function EventStartDateInput({
  className,
  weekdayClassName,
  ...props
}: Omit<DateInputWithWeekdayProps, "showTodayButton">) {
  return (
    <DateInputWithWeekday
      {...props}
      showTodayButton
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
  showTodayButton = false,
}: DateInputWithWeekdayProps) {
  const ref = useRef<HTMLInputElement>(null);
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
    if (ref.current) ref.current.value = next;
    onChange(next);
    const d = isoDateToLocalDate(next);
    if (d) setMonth(d);
  };

  const pickToday = () => {
    applyValue(todayIsoDate());
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

  if (readOnly) {
    return (
      <div className={cn("inline-flex items-center px-3", boxClassName)}>
        <DateDisplay value={displayValue} weekdayClassName={weekdayClassName} />
      </div>
    );
  }

  if (showTodayButton) {
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
          <div className="border-t border-white/10 p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-full text-xs text-white/70 hover:bg-white/10 hover:text-white"
              onClick={pickToday}
            >
              Today
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className={boxClassName}>
      <div className="relative z-20 flex h-full items-center px-3 pointer-events-none">
        <DateDisplay value={displayValue} weekdayClassName={weekdayClassName} />
      </div>
      <input
        ref={ref}
        type="date"
        value={displayValue}
        disabled={disabled}
        onClick={() => ref.current?.showPicker?.()}
        onFocus={() => ref.current?.showPicker?.()}
        onChange={(e) => applyValue(e.target.value)}
        className={cn(
          "absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0",
          "[color-scheme:dark]",
        )}
        aria-label="Date"
      />
    </div>
  );
}
