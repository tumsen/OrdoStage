import { ChevronLeft, ChevronRight } from "lucide-react";

import { DateInputWithWeekday } from "@/components/DateInputWithWeekday";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_YEAR_DISC_RANGE,
  todayIsoDateLocal,
  yearDiscRangeAnchorIso,
  type YearDiscRangeMode,
  type YearDiscRangeSettings,
} from "@/components/schedule/yearDiscConfig";
import { cn } from "@/lib/utils";

function modeButtonClass(active: boolean): string {
  return cn(
    "h-8 px-2.5 text-xs text-white/60 hover:text-white",
    active ? "bg-white/10 text-white" : "hover:bg-white/5"
  );
}

export function YearDiscRangeEditor({
  range,
  calendarYear,
  onRangeChange,
  onCalendarYearChange,
}: {
  range: YearDiscRangeSettings;
  calendarYear: number;
  onRangeChange: (range: YearDiscRangeSettings) => void;
  onCalendarYearChange: (year: number) => void;
}) {
  const effectiveRange = range ?? DEFAULT_YEAR_DISC_RANGE;
  const mode = effectiveRange.mode;
  const today = todayIsoDateLocal();
  const pickerValue = yearDiscRangeAnchorIso(effectiveRange);

  function setMode(nextMode: YearDiscRangeMode) {
    if (nextMode === "calendar_year") {
      onRangeChange({ mode: "calendar_year" });
      return;
    }
    if (nextMode === "today") {
      onRangeChange({ mode: "today" });
      return;
    }
    onRangeChange({
      mode: "specific_date",
      anchorDate: effectiveRange.anchorDate ?? pickerValue,
    });
  }

  function handleAnchorDateChange(value: string) {
    if (value === today) {
      onRangeChange({ mode: "today" });
      return;
    }
    onRangeChange({ mode: "specific_date", anchorDate: value });
  }

  const showDatePicker = mode === "today" || mode === "specific_date";

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={modeButtonClass(mode === "calendar_year")}
        onClick={() => setMode("calendar_year")}
      >
        Year
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={modeButtonClass(mode === "today")}
        onClick={() => setMode("today")}
      >
        Today
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={modeButtonClass(mode === "specific_date")}
        onClick={() => setMode("specific_date")}
      >
        Date
      </Button>

      <span className="mx-0.5 h-4 w-px shrink-0 bg-white/10" aria-hidden="true" />

      {mode === "calendar_year" ? (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-white/50 hover:text-white hover:bg-white/5"
            onClick={() => onCalendarYearChange(calendarYear - 1)}
            aria-label="Previous year"
          >
            <ChevronLeft size={16} />
          </Button>
          <Input
            type="number"
            min={1970}
            max={2100}
            value={calendarYear}
            onChange={(e) => {
              const next = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(next) && next >= 1970 && next <= 2100) {
                onCalendarYearChange(next);
              }
            }}
            aria-label="Disc year"
            className="h-8 w-[5.75rem] shrink-0 border-white/10 bg-white/5 text-center font-mono text-sm tabular-nums text-white [color-scheme:dark]"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-white/50 hover:text-white hover:bg-white/5"
            onClick={() => onCalendarYearChange(calendarYear + 1)}
            aria-label="Next year"
          >
            <ChevronRight size={16} />
          </Button>
        </>
      ) : null}

      {showDatePicker ? (
        <DateInputWithWeekday value={pickerValue} onChange={handleAnchorDateChange} />
      ) : null}
    </div>
  );
}
