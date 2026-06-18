import { ChevronLeft, ChevronRight } from "lucide-react";

import { DateInputWithWeekday } from "@/components/DateInputWithWeekday";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_YEAR_DISC_RANGE,
  todayIsoDateLocal,
  type YearDiscRangeSettings,
} from "@/components/schedule/yearDiscConfig";
import { cn } from "@/lib/utils";

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
  const isYearMode = effectiveRange.mode === "calendar_year";
  const startDate = effectiveRange.startDate ?? todayIsoDateLocal();

  function selectYearMode() {
    onRangeChange({ mode: "calendar_year" });
  }

  function selectTodayMode() {
    onRangeChange({ mode: "start_to_today", startDate: todayIsoDateLocal() });
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 px-2.5 text-xs text-white/60 hover:text-white",
          isYearMode ? "bg-white/10 text-white" : "hover:bg-white/5"
        )}
        onClick={selectYearMode}
      >
        Year
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 px-2.5 text-xs text-white/60 hover:text-white",
          !isYearMode ? "bg-white/10 text-white" : "hover:bg-white/5"
        )}
        onClick={selectTodayMode}
      >
        Today
      </Button>

      <span className="mx-0.5 h-4 w-px shrink-0 bg-white/10" aria-hidden="true" />

      {isYearMode ? (
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
            className="h-8 w-[4.5rem] shrink-0 border-white/10 bg-white/5 text-center text-sm text-white [color-scheme:dark]"
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
      ) : (
        <DateInputWithWeekday
          value={startDate}
          onChange={(value) => {
            const today = todayIsoDateLocal();
            onRangeChange({
              mode: "start_to_today",
              startDate: value <= today ? value : today,
            });
          }}
        />
      )}
    </div>
  );
}
