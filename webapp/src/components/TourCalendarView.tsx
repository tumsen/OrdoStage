import { cn } from "@/lib/utils";
import type { TourDetail, TourShow } from "../../../backend/src/types";

// ISO week number (Mon = first day of week)
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isSameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}

// Start of ISO week (Monday) for a given date
function getISOWeekStart(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  const dow = r.getDay(); // 0=Sun
  r.setDate(r.getDate() - ((dow + 6) % 7));
  return r;
}

const DOW_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function TourCalendarView({ tour }: { tour: TourDetail }) {
  if (tour.shows.length === 0) {
    return (
      <div className="py-8 text-center text-white/25 text-xs">No shows scheduled.</div>
    );
  }

  // Map date key → shows
  const showsByDate = new Map<string, TourShow[]>();
  for (const show of tour.shows) {
    const k = new Date(show.date).toISOString().slice(0, 10);
    if (!showsByDate.has(k)) showsByDate.set(k, []);
    showsByDate.get(k)!.push(show);
  }

  // Date range: start of first-show week → end of last-show week
  const sortedDates = [...showsByDate.keys()].sort();
  const firstDate = getISOWeekStart(new Date(sortedDates[0] + "T00:00:00"));
  const rawLast = new Date(sortedDates[sortedDates.length - 1] + "T00:00:00");
  // extend to end of that week (Sunday)
  const lastWeekStart = getISOWeekStart(rawLast);
  const lastDate = addDays(lastWeekStart, 6);

  // Build list of all days in range
  const days: Date[] = [];
  let cur = new Date(firstDate);
  while (cur <= lastDate) {
    days.push(new Date(cur));
    cur = addDays(cur, 1);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let lastWeekNum = -1;

  return (
    <div className="select-none">
      <div className="space-y-px">
        {days.map((day) => {
          const k = dateKey(day);
          const dayShows = showsByDate.get(k) ?? [];
          const dowIndex = (day.getDay() + 6) % 7; // 0=Mon … 6=Sun
          const isWeekend = dowIndex >= 5; // Sat or Sun
          const isToday = isSameDay(day, today);
          const isMonday = dowIndex === 0;
          const weekNum = getISOWeek(day);
          const showWeekNum = isMonday && weekNum !== lastWeekNum;
          if (showWeekNum) lastWeekNum = weekNum;

          return (
            <div key={k}>
              {/* Week number row — shown at each Monday */}
              {showWeekNum ? (
                <div className="flex items-center gap-2 pt-2 pb-0.5 px-1">
                  <span className="text-[9px] font-semibold text-white/20 uppercase tracking-widest w-7 text-right">
                    W{weekNum}
                  </span>
                  <div className="flex-1 h-px bg-white/[0.05]" />
                </div>
              ) : null}

              {/* Day row */}
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded px-1 py-[3px]",
                  isToday ? "bg-white/10" : isWeekend ? "bg-white/[0.025]" : ""
                )}
              >
                {/* Spacer to align with week-number width */}
                <span
                  className={cn(
                    "text-[10px] w-7 text-right flex-shrink-0",
                    isToday ? "font-bold text-white" :
                    isWeekend ? "text-white/40" :
                    "text-white/20"
                  )}
                >
                  {day.getDate()}
                </span>

                <span
                  className={cn(
                    "text-[9px] w-6 flex-shrink-0",
                    isToday ? "font-bold text-white" :
                    isWeekend ? "text-white/35" :
                    "text-white/20"
                  )}
                >
                  {DOW_SHORT[dowIndex]}
                </span>

                {/* Month label on 1st of each month */}
                {day.getDate() === 1 ? (
                  <span className="text-[9px] text-white/25 flex-shrink-0">
                    {day.toLocaleDateString("en-GB", { month: "short" })}
                  </span>
                ) : null}

                {/* Show indicators */}
                <div className="flex items-center gap-1 flex-1 min-w-0 ml-0.5">
                  {dayShows.map((show) => {
                    const label =
                      show.type === "travel"
                        ? [show.fromLocation, show.toLocation].filter(Boolean).join("→") || "Travel"
                        : show.type === "day_off"
                        ? "Day off"
                        : show.venueName || show.venueCity || "Show";
                    const time = show.showTime || show.getInTime;
                    return (
                      <div
                        key={show.id}
                        className={cn(
                          "flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] leading-tight flex-shrink-0 max-w-[110px]",
                          show.type === "travel" ? "bg-blue-900/50 text-blue-300" :
                          show.type === "day_off" ? "bg-green-900/50 text-green-300" :
                          "bg-red-900/50 text-red-300"
                        )}
                        title={`${time ? time + " " : ""}${label}`}
                      >
                        {time ? <span className="opacity-60 tabular-nums">{time}</span> : null}
                        <span className="truncate">{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
