import { getMonthDays, DOW_LABELS, toDateStr } from "./scheduleUtils";
import { CalendarCell } from "./CalendarCell";
import type { CalendarItem } from "./scheduleUtils";

interface CalendarGridProps {
  year: number;
  month: number;
  items: CalendarItem[];
  onItemClick: (item: CalendarItem) => void;
}

export function CalendarGrid({ year, month, items, onItemClick }: CalendarGridProps) {
  const cells = getMonthDays(year, month);
  const todayStr = toDateStr(new Date());

  return (
    <div className="flex flex-col gap-1">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1">
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
          />
        ))}
      </div>
    </div>
  );
}
