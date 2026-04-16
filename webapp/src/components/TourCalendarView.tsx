import { cn } from "@/lib/utils";
import type { TourDetail, TourShow } from "../../../backend/src/types";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function ShowPill({ show }: { show: TourShow }) {
  const label =
    show.type === "travel"
      ? [show.fromLocation, show.toLocation].filter(Boolean).join(" → ") || "Travel"
      : show.type === "day_off"
      ? "Day Off"
      : show.venueName || show.venueCity || "Show";
  const time = show.showTime || show.getInTime;
  return (
    <div
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] leading-tight truncate",
        show.type === "travel" ? "bg-blue-900/50 text-blue-300" :
        show.type === "day_off" ? "bg-green-900/50 text-green-300" :
        "bg-red-900/40 text-red-300"
      )}
      title={`${time ? time + " " : ""}${label}`}
    >
      {time ? <span className="opacity-60 mr-0.5">{time}</span> : null}
      {label}
    </div>
  );
}

export function TourCalendarView({ tour }: { tour: TourDetail }) {
  if (tour.shows.length === 0) {
    return <div className="py-12 text-center text-white/30 text-sm">No shows scheduled yet.</div>;
  }

  const showsByDate = new Map<string, TourShow[]>();
  for (const show of tour.shows) {
    const key = new Date(show.date).toISOString().slice(0, 10);
    if (!showsByDate.has(key)) showsByDate.set(key, []);
    showsByDate.get(key)!.push(show);
  }

  const weekStarts = Array.from(
    new Set(tour.shows.map((s) => getWeekStart(new Date(s.date)).toISOString().slice(0, 10)))
  ).sort().map((d) => new Date(d + "T00:00:00"));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-5">
      {weekStarts.map((weekStart) => {
        const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
        const weekLabel = weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
        const hasAnyShow = days.some((d) => showsByDate.has(d.toISOString().slice(0, 10)));
        if (!hasAnyShow) return null;
        return (
          <div key={weekStart.toISOString()}>
            <div className="text-xs text-white/25 uppercase tracking-wide mb-2 ml-0.5">
              Week of {weekLabel}
            </div>
            <div className="grid grid-cols-7 gap-px mb-px">
              {DAY_LABELS.map((d) => (
                <div key={d} className="text-center text-[10px] text-white/20 font-medium pb-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((day) => {
                const key = day.toISOString().slice(0, 10);
                const dayShows = showsByDate.get(key) ?? [];
                const isToday = isSameDay(day, today);
                const hasShows = dayShows.length > 0;
                return (
                  <div
                    key={key}
                    className={cn(
                      "min-h-[60px] rounded-lg p-1.5 flex flex-col gap-1 border transition-colors",
                      hasShows ? "border-white/10 bg-white/[0.04]" : "border-white/[0.03] bg-transparent",
                      isToday ? "ring-1 ring-inset ring-white/20" : ""
                    )}
                  >
                    <span className={cn("text-[11px] leading-none mb-0.5", isToday ? "text-white font-bold" : hasShows ? "text-white/50" : "text-white/20")}>
                      {day.getDate()}
                    </span>
                    {dayShows.map((show) => (
                      <ShowPill key={show.id} show={show} />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
