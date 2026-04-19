import { cn } from "@/lib/utils";
import type { CalendarItem } from "./scheduleUtils";
import type { InternalBookingDetail } from "../../../../backend/src/types";
import { itemColor, itemsForDay, hasTimedStart } from "./scheduleUtils";

const PILL_LIMIT = 3;

interface CalendarCellProps {
  date: Date | null;
  items: CalendarItem[];
  isToday: boolean;
  onItemClick: (item: CalendarItem) => void;
}

export function CalendarCell({ date, items, isToday, onItemClick }: CalendarCellProps) {
  if (!date) {
    return (
      <div className="min-h-[100px] bg-white/[0.01] border border-white/5 rounded-lg" />
    );
  }

  const dayItems = itemsForDay(items, date);
  const visible = dayItems.slice(0, PILL_LIMIT);
  const overflow = dayItems.length - PILL_LIMIT;

  return (
    <div
      className={cn(
        "min-h-[100px] p-1.5 border rounded-lg flex flex-col gap-1 transition-colors",
        isToday
          ? "border-indigo-500/50 bg-indigo-950/20"
          : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]",
        dayItems.length > 0 && "ring-1 ring-white/5"
      )}
    >
      {/* Day number */}
      <div className="flex items-center justify-between px-0.5">
        <span
          className={cn(
            "text-xs font-medium leading-none",
            isToday
              ? "text-indigo-300 font-bold"
              : "text-white/50"
          )}
        >
          {date.getDate()}
        </span>
        {isToday ? (
          <span className="text-[10px] text-indigo-400 font-medium">Today</span>
        ) : null}
      </div>

      {/* Pills */}
      <div className="flex flex-col gap-0.5 flex-1">
        {visible.map((item) => (
          <button
            key={item.id}
            onClick={() => onItemClick(item)}
            className={cn(
              "w-full text-left text-[11px] px-1.5 py-0.5 rounded font-medium transition-opacity hover:opacity-80",
              itemColor(item)
            )}
            title={item.title}
          >
            <span className="block truncate">
              {item.title}
              {item.status === "draft" && (
                <span className="ml-1 inline-block text-[9px] font-semibold uppercase px-1 py-px rounded bg-ordo-yellow/30 text-ordo-yellow border border-ordo-yellow/50 leading-none align-middle">
                  Draft
                </span>
              )}
              {item.status === "cancelled" && (
                <span className="ml-1 inline-block text-[9px] font-semibold uppercase px-1 py-px rounded bg-red-950/60 text-red-400 border border-red-700/50 leading-none align-middle">
                  Cancelled
                </span>
              )}
            </span>
            {hasTimedStart(item) ? (
              <span className="block text-[9px] opacity-80 truncate tabular-nums">
                {new Date(item.startDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                {item.endDate
                  ? `–${new Date(item.endDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </span>
            ) : null}
            {item.kind === "booking" && (item.raw as InternalBookingDetail).createdBy?.name ? (
              <span className="block text-[9px] text-white/40 truncate">
                by {(item.raw as InternalBookingDetail).createdBy!.name}
              </span>
            ) : null}
          </button>
        ))}
        {overflow > 0 ? (
          <span className="text-[10px] text-white/30 px-1.5 py-0.5">
            +{overflow} more
          </span>
        ) : null}
      </div>
    </div>
  );
}
