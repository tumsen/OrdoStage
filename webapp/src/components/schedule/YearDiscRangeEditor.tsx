import { DateInputWithWeekday } from "@/components/DateInputWithWeekday";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_YEAR_DISC_RANGE,
  todayIsoDateLocal,
  type YearDiscRangeMode,
  type YearDiscRangeSettings,
} from "@/components/schedule/yearDiscConfig";

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

  function setMode(mode: YearDiscRangeMode) {
    if (mode === "start_to_today") {
      onRangeChange({
        mode,
        startDate: effectiveRange.startDate ?? `${calendarYear}-01-01`,
      });
      return;
    }
    onRangeChange({ mode: "calendar_year" });
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Disc period</p>
      <Select value={effectiveRange.mode} onValueChange={(value) => setMode(value as YearDiscRangeMode)}>
        <SelectTrigger className="mt-2 h-8 border-white/10 bg-white/5 text-xs text-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-[#16161f] border-white/10 text-white">
          <SelectItem value="calendar_year" className="text-xs">
            Calendar year
          </SelectItem>
          <SelectItem value="start_to_today" className="text-xs">
            Start date → today
          </SelectItem>
        </SelectContent>
      </Select>

      {effectiveRange.mode === "calendar_year" ? (
        <div className="mt-3 space-y-1.5">
          <label className="text-[11px] text-white/45" htmlFor="year-disc-year">
            Year
          </label>
          <Input
            id="year-disc-year"
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
            className="h-8 border-white/10 bg-white/5 text-sm text-white [color-scheme:dark]"
          />
          <p className="text-[11px] text-white/35">The disc shows Jan 1 – Dec 31 for this year.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-1.5">
          <label className="text-[11px] text-white/45">Start date</label>
          <DateInputWithWeekday
            value={effectiveRange.startDate ?? `${calendarYear}-01-01`}
            onChange={(value) => {
              const today = todayIsoDateLocal();
              const startDate = value <= today ? value : today;
              onRangeChange({ mode: "start_to_today", startDate });
            }}
          />
          <p className="text-[11px] text-white/35">
            The disc spans from the start date through today ({todayIsoDateLocal()}).
          </p>
        </div>
      )}
    </div>
  );
}
