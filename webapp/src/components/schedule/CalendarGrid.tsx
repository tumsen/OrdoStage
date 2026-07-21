import { getMonthDays, DOW_LABELS, toDateStr } from "./scheduleUtils";
import { CalendarCell } from "./CalendarCell";
import type { CalendarItem } from "./scheduleUtils";
import { CALENDAR_STICKY_HEADER_CHROME } from "@/lib/weekGridColumns";
import { cn } from "@/lib/utils";

interface CalendarGridProps {
  year: number;
  month: number;
  items: CalendarItem[];
  onItemClick: (item: CalendarItem) => void;
  onDateClick?: (date: Date) => void;
  /** Max pills per day cell (default 3). */
  pillLimit?: number;
  /**
   * When many month grids share one vertical scroller (e.g. year view), turn off so only one sticky row is not fighting others.
   */
  stickyDowHeader?: boolean;
}

export function CalendarGrid({
  year,
  month,
  items,
  onItemClick,
  onDateClick,
  stickyDowHeader = true,
  pillLimit,
}: CalendarGridProps) {
  const cells = getMonthDays(year, month);
  const todayStr = toDateStr(new Date());

  return (
    <div className="flex flex-col gap-1">
      {/* Day-of-week headers */}
      <div
        className={cn(
          "grid grid-cols-7 gap-1",
          stickyDowHeader && `${CALENDAR_STICKY_HEADER_CHROME} border-b border-white/10`
        )}
      >
        {DOW_LABELS.map((d) => (
          <div
            key={d}
            className="text-center text-xs font-medium text-white/30 uppercase tracking-wider py-2"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, idx) => (
          <CalendarCell
            key={idx}
            date={date}
            items={items}
            isToday={date !== null && toDateStr(date) === todayStr}
            onItemClick={onItemClick}
            onDateClick={onDateClick}
            pillLimit={pillLimit}
          />
        ))}
      </div>
    </div>
  );
}
