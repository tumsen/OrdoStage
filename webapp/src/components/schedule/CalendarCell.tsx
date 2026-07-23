import { cn } from "@/lib/utils";
import { usePreferences } from "@/hooks/usePreferences";
import { useI18n } from "@/lib/i18n";
import { CalendarItemHoverCard } from "@/components/schedule/CalendarItemHoverCard";
import type { CalendarItem } from "./scheduleUtils";
import type { InternalBookingDetail } from "../../../../backend/src/types";
import {
  itemColor,
  itemSurfaceStyle,
  itemsForDay,
  hasTimedStart,
  calendarItemVenueName,
  calendarVenueBookingSummaryLine,
  backingVenueBookingForEvent,
  orphanBackingVenueBookings,
  toDateStr,
} from "./scheduleUtils";
import {
  CALENDAR_TODAY_CELL_CLASS,
  CALENDAR_TODAY_DAY_NUMBER_CLASS,
  CALENDAR_TODAY_LABEL_CLASS,
} from "@/lib/weekGridColumns";
import { formatMinutesAsDurationBoth } from "@/lib/durationHours";
import { commaDecimalForLanguage } from "@/lib/timeGrid";

const PILL_LIMIT = 3;

interface CalendarCellProps {
  date: Date | null;
  items: CalendarItem[];
  isToday: boolean;
  onItemClick: (item: CalendarItem) => void;
  onDateClick?: (date: Date) => void;
  pillLimit?: number;
  /** Optional day hour totals (yyyy-MM-dd → minutes). Shown after the date number. */
  dayTotalsByYmd?: Map<string, number>;
}

export function CalendarCell({
  date,
  items,
  isToday,
  onItemClick,
  onDateClick,
  pillLimit = PILL_LIMIT,
  dayTotalsByYmd,
}: CalendarCellProps) {
  const { t } = useI18n();
  const { effective } = usePreferences();
  const locale =
    effective?.language === "da" ? "da-DK" : effective?.language === "de" ? "de-DE" : "en-US";
  const hour12 = effective?.timeFormat === "12h";
  const commaDec = commaDecimalForLanguage(effective?.language ?? "en");

  if (!date) {
    return (
      <div className="min-h-[100px] bg-white/[0.01] border border-white/5 rounded-lg" />
    );
  }

  const dayItems = itemsForDay(items, date);
  const backingItems = dayItems.filter((item) => item.renderBehind === true);
  const foregroundItems = dayItems.filter((item) => item.renderBehind !== true);
  const orphanBacking = orphanBackingVenueBookings(foregroundItems, backingItems);
  const combinedForPills = [...foregroundItems, ...orphanBacking];
  const visible = combinedForPills.slice(0, pillLimit);
  const overflow = combinedForPills.length - pillLimit;
  const orphanIds = new Set(orphanBacking.map((b) => b.id));
  const dayTotalMinutes = dayTotalsByYmd?.get(toDateStr(date)) ?? 0;

  return (
    <div
      role={onDateClick ? "button" : undefined}
      tabIndex={onDateClick ? 0 : undefined}
      onClick={() => onDateClick?.(date)}
      onKeyDown={(e) => {
        if (!onDateClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onDateClick(date);
        }
      }}
      className={cn(
        "min-h-[100px] p-1.5 border rounded-lg flex flex-col gap-1 transition-colors",
        isToday
          ? CALENDAR_TODAY_CELL_CLASS
          : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04]",
        (foregroundItems.length > 0 || orphanBacking.length > 0) && "ring-1 ring-white/5"
      )}
    >
      {/* Day number */}
      <div className="flex items-center justify-between gap-1 px-0.5">
        <div className="flex min-w-0 items-center gap-1">
          <span
            className={cn(
              "text-xs font-medium leading-none shrink-0",
              isToday ? CALENDAR_TODAY_DAY_NUMBER_CLASS : "text-white/50"
            )}
          >
            {date.getDate()}
          </span>
          {isToday ? (
            <span className={cn(CALENDAR_TODAY_LABEL_CLASS, "shrink-0")}>{t("common.today")}</span>
          ) : null}
        </div>
        {dayTotalMinutes > 0 ? (
          <span
            className={cn(
              "shrink-0 text-[10px] leading-none tabular-nums",
              isToday ? "text-indigo-200/75" : "text-white/45"
            )}
            title={formatMinutesAsDurationBoth(dayTotalMinutes, commaDec)}
          >
            {formatMinutesAsDurationBoth(dayTotalMinutes, commaDec)}
          </span>
        ) : null}
      </div>

      {/* Pills */}
      <div className="flex flex-col gap-0.5 flex-1">
        {visible.map((item) => {
          const isOrphanBacking = orphanIds.has(item.id);
          const backing = isOrphanBacking ? null : backingVenueBookingForEvent(item, backingItems);
          const venueName = calendarItemVenueName(item);
          const backingSummary = backing ? calendarVenueBookingSummaryLine(backing) : "";
          return (
            <button
              key={item.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onItemClick(item);
              }}
              className={cn(
                "relative w-full text-left text-[11px] px-1.5 py-0.5 rounded font-medium transition-opacity hover:opacity-80 overflow-hidden",
                itemColor(item),
                backing && "ring-2 ring-rose-300/70 shadow-[0_0_0_2px_rgba(244,63,94,0.22)]"
              )}
              style={itemSurfaceStyle(item)}
            >
              {backing ? (
                <span className="absolute inset-0 bg-rose-500/20 pointer-events-none" aria-hidden="true" />
              ) : null}
              <span className="relative block truncate">
                <CalendarItemHoverCard
                  item={item}
                  locale={locale}
                  hour12={hour12}
                  side="right"
                  label={
                    <>
                      {item.title}
                      {venueName ? (
                        <span className="font-normal opacity-70"> @ {venueName}</span>
                      ) : null}
                    </>
                  }
                  labelClassName="truncate"
                />
              </span>
              {backing ? (
                <span className="relative block text-[9px] text-rose-100/95 truncate leading-tight mt-0.5">
                  Venue booking: {backingSummary}
                </span>
              ) : null}
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
