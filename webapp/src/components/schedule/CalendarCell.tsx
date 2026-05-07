import { cn } from "@/lib/utils";
import type { CalendarItem } from "./scheduleUtils";
import type { InternalBookingDetail, EventDetail } from "../../../../backend/src/types";
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
  const backingItems = dayItems.filter((item) => item.renderBehind === true);
  const foregroundItems = dayItems.filter((item) => item.renderBehind !== true);
  const visible = foregroundItems.slice(0, PILL_LIMIT);
  const overflow = foregroundItems.length - PILL_LIMIT;

  function backingFor(item: CalendarItem): CalendarItem | null {
    if (item.kind !== "event") return null;
    const eventId = (item.raw as EventDetail).id;
    const itemStart = new Date(item.startDate);
    const itemEnd = item.endDate ? new Date(item.endDate) : new Date(itemStart.getTime() + 60 * 60 * 1000);
    return (
      backingItems.find((booking) => {
        const raw = booking.raw as InternalBookingDetail & { eventId?: string | null };
        if (raw.eventId !== eventId) return false;
        const bookingStart = new Date(booking.startDate);
        const bookingEnd = booking.endDate
          ? new Date(booking.endDate)
          : new Date(bookingStart.getTime() + 60 * 60 * 1000);
        return bookingStart.getTime() < itemEnd.getTime() && bookingEnd.getTime() > itemStart.getTime();
      }) ?? null
    );
  }

  return (
    <div
      className={cn(
        "min-h-[100px] p-1.5 border rounded-lg flex flex-col gap-1 transition-colors",
        isToday
          ? "border-indigo-500/50 bg-indigo-950/20"
          : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]",
        foregroundItems.length > 0 && "ring-1 ring-white/5"
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
        {visible.map((item) => {
          const backing = backingFor(item);
          const venueName =
            item.kind === "job"
              ? item.venueLabel
              : item.kind === "event"
                ? (item.raw as EventDetail).venue?.name
                : undefined;
          return (
            <button
              key={item.id}
              onClick={() => onItemClick(item)}
              className={cn(
                "relative w-full text-left text-[11px] px-1.5 py-0.5 rounded font-medium transition-opacity hover:opacity-80 overflow-hidden",
                itemColor(item),
                backing && "ring-2 ring-rose-300/70 shadow-[0_0_0_2px_rgba(244,63,94,0.22)]"
              )}
              title={backing ? `${item.title} · venue booked` : item.title}
            >
              {backing ? (
                <span className="absolute inset-0 bg-rose-500/20 pointer-events-none" aria-hidden="true" />
              ) : null}
              <span className="relative block truncate">
                {item.title}
                {venueName ? (
                  <span className="font-normal opacity-70"> @ {venueName}</span>
                ) : null}
              </span>
              {hasTimedStart(item) ? (
                <span className="relative flex items-center gap-1 text-[9px] opacity-80 truncate tabular-nums">
                  <span>
                    {new Date(item.startDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {item.endDate
                      ? `–${new Date(item.endDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : ""}
                  </span>
                  {item.status === "confirmed" && (
                    <span className="inline-block text-[8px] font-semibold uppercase px-1 py-px rounded bg-emerald-950/60 text-emerald-400 border border-emerald-700/50 leading-none">Confirmed</span>
                  )}
                  {item.status === "draft" && (
                    <span className="inline-block text-[8px] font-semibold uppercase px-1 py-px rounded bg-ordo-yellow/30 text-ordo-yellow border border-ordo-yellow/50 leading-none">Draft</span>
                  )}
                  {item.status === "cancelled" && (
                    <span className="inline-block text-[8px] font-semibold uppercase px-1 py-px rounded bg-red-950/60 text-red-400 border border-red-700/50 leading-none">Cancelled</span>
                  )}
                </span>
              ) : (
                <>
                  {item.status === "confirmed" && (
                    <span className="relative block text-[8px] font-semibold uppercase px-1 py-px rounded bg-emerald-950/60 text-emerald-400 border border-emerald-700/50 leading-none w-fit mt-0.5">Confirmed</span>
                  )}
                  {item.status === "draft" && (
                    <span className="relative block text-[8px] font-semibold uppercase px-1 py-px rounded bg-ordo-yellow/30 text-ordo-yellow border border-ordo-yellow/50 leading-none w-fit mt-0.5">Draft</span>
                  )}
                  {item.status === "cancelled" && (
                    <span className="relative block text-[8px] font-semibold uppercase px-1 py-px rounded bg-red-950/60 text-red-400 border border-red-700/50 leading-none w-fit mt-0.5">Cancelled</span>
                  )}
                </>
              )}
              {item.kind === "booking" && (item.raw as InternalBookingDetail).createdBy?.name ? (
                <span className="block text-[9px] text-white/40 truncate">
                  by {(item.raw as InternalBookingDetail).createdBy!.name}
                </span>
              ) : null}
            </button>
          );
        })}
        {overflow > 0 ? (
          <span className="text-[10px] text-white/30 px-1.5 py-0.5">
            +{overflow} more
          </span>
        ) : null}
      </div>
    </div>
  );
}
