import { Check } from "lucide-react";
import type { TourShowListRow } from "../../../../backend/src/types";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/hooks/usePreferences";
import { localeForLanguage } from "@/lib/preferences";
import { tourShowPrimaryTime } from "@/lib/tourScheduleDisplay";
import {
  computeTourShowCrewStats,
  tourPerformanceCountOnDay,
  tourShowVenueLabel,
} from "@/lib/tourShowListStats";
import { Badge } from "@/components/ui/badge";

function formatTourListWhenParts(
  show: TourShowListRow,
  locale: string,
  hour12: boolean,
): { weekdayLabel: string; dateOnlyLabel: string; timeLabel: string } {
  const dk = show.dayKey || show.date.slice(0, 10);
  const base = new Date(`${dk}T12:00:00`);
  const weekdayLabel = base.toLocaleDateString(locale, { weekday: "long" });
  const dateOnlyLabel = base.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeRaw = tourShowPrimaryTime(show);
  const timeLabel =
    timeRaw && show.type !== "day_off"
      ? (() => {
          const [hh, mm] = timeRaw.split(":").map((x) => Number(x));
          const t = new Date(base);
          if (Number.isFinite(hh) && Number.isFinite(mm)) t.setHours(hh, mm, 0, 0);
          return t.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12 });
        })()
      : "—";
  return { weekdayLabel, dateOnlyLabel, timeLabel };
}

function TourDayTypeBadge({
  show,
  allShows,
  locale,
  hour12,
}: {
  show: TourShowListRow;
  allShows: TourShowListRow[];
  locale: string;
  hour12: boolean;
}) {
  if (show.type === "travel") {
    return (
      <Badge className="text-[10px] py-px px-1.5 font-medium bg-blue-900/40 text-blue-300 border-blue-700/40 hover:bg-blue-900/40">
        Travel
      </Badge>
    );
  }
  if (show.type === "day_off") {
    return (
      <Badge className="text-[10px] py-px px-1.5 font-medium bg-white/5 text-white/40 border-white/10 hover:bg-white/5">
        Day off
      </Badge>
    );
  }
  const dayKey = (show.dayKey || show.date).slice(0, 10);
  const performanceCount = tourPerformanceCountOnDay(allShows, dayKey);
  const when = formatTourListWhenParts(show, locale, hour12);
  const venue = tourShowVenueLabel(show);
  const labelParts = [
    performanceCount > 1 ? `${performanceCount} shows` : "Show",
    when.timeLabel !== "—" ? when.timeLabel : null,
    venue !== "Venue TBD" ? venue : null,
  ].filter((p): p is string => Boolean(p));
  const label = labelParts.join(" · ");
  return (
    <Badge
      className="max-w-[min(14rem,42vw)] truncate text-[10px] py-px px-1.5 font-medium bg-emerald-900/40 text-emerald-300 border-emerald-700/40 hover:bg-emerald-900/40"
      title={label}
    >
      {label}
    </Badge>
  );
}

function TourListCrewHint({
  people,
  needed,
  muted,
}: {
  people: number;
  needed: number | null;
  muted?: boolean;
}) {
  if (needed == null || needed <= 0) {
    return (
      <span className={cn("text-white/35", muted && "text-white/25")}>
        {people > 0 ? `${people} crew` : "No crew target"}
      </span>
    );
  }
  if (people >= needed) {
    return (
      <span
        className={cn("inline-flex items-center gap-0.5 text-emerald-400", muted && "text-emerald-400/50")}
      >
        <Check size={10} className="shrink-0" aria-hidden />
        Crew OK
      </span>
    );
  }
  return (
    <span className={cn("text-amber-400/90", muted && "text-amber-400/40")}>
      {people}/{needed} crew
    </span>
  );
}

function tourListExtraColumn(show: TourShowListRow): string | null {
  if (show.type === "show" && show.techRiderSentAt) return "Rider sent";
  return null;
}

export function TourShowsOverviewGrid({
  shows,
  tourHandsNeeded,
  tourPeopleCount,
  className,
}: {
  shows: TourShowListRow[];
  tourHandsNeeded: number | null;
  tourPeopleCount: number;
  className?: string;
}) {
  const { effective } = usePreferences();
  const prefsLocale = localeForLanguage(effective?.language ?? "en");
  const hour12 = effective?.timeFormat === "12h";

  const sorted = [...shows].sort((a, b) => {
    const da = (a.dayKey || a.date).slice(0, 10);
    const db = (b.dayKey || b.date).slice(0, 10);
    if (da !== db) return da.localeCompare(db);
    return a.order - b.order;
  });

  if (sorted.length === 0) {
    return <p className="text-[11px] text-white/35">No days on this tour</p>;
  }

  return (
    <div className={cn("mt-1 overflow-x-auto -mx-1 px-1", className)}>
      <ul
        className="min-w-[min(100%,38rem)] grid items-center gap-x-0 gap-y-1.5 text-[10px] leading-snug"
        style={{
          gridTemplateColumns: hour12
            ? "minmax(9rem,14rem) 10ch max-content minmax(8rem,11ch) max-content max-content max-content minmax(0,1fr)"
            : "minmax(9rem,14rem) 10ch max-content 6ch max-content max-content max-content minmax(0,1fr)",
        }}
      >
        {sorted.map((show) => {
          const stats = computeTourShowCrewStats(show, tourHandsNeeded, tourPeopleCount);
          const venueName = tourShowVenueLabel(show);
          const when = formatTourListWhenParts(show, prefsLocale, hour12);
          const muted = show.type === "day_off";
          const rowTone = muted ? "text-white/30" : "text-white/50";
          const whenTone = muted ? undefined : "text-white/[0.82]";
          const venueTone = muted ? undefined : "text-white/55";
          const extra = tourListExtraColumn(show);
          return (
            <li key={show.id} className="contents">
              <div className="justify-self-start pr-2">
                <TourDayTypeBadge
                  show={show}
                  allShows={sorted}
                  locale={prefsLocale}
                  hour12={hour12}
                />
              </div>
              <span className={cn("min-w-0 truncate text-left", rowTone, whenTone)} title={when.weekdayLabel}>
                {when.weekdayLabel}
              </span>
              <span className={cn("min-w-0 truncate pl-2 text-left", rowTone, whenTone)} title={when.dateOnlyLabel}>
                {when.dateOnlyLabel}
              </span>
              <span
                className={cn(
                  "justify-self-start whitespace-nowrap pl-0.5 text-left tabular-nums pr-1",
                  rowTone,
                  whenTone,
                )}
              >
                {when.timeLabel}
              </span>
              <span className={cn("min-w-0 truncate pr-2", rowTone, venueTone)} title={venueName}>
                {venueName}
              </span>
              <div className="min-w-0 truncate pr-4">
                <TourListCrewHint people={stats.people} needed={stats.needed} muted={muted} />
              </div>
              <span
                className={cn(
                  "block whitespace-nowrap pr-3 text-right tabular-nums",
                  muted ? "text-white/25" : "text-white/45",
                )}
                title={`${stats.people} people on this day`}
              >
                {stats.people}
              </span>
              <div
                className={cn(
                  "min-w-0 truncate pl-2 text-right sm:text-left",
                  extra ? (muted ? "text-white/35" : "text-white/45") : "text-white/25",
                )}
                title={extra ?? undefined}
              >
                {extra ?? "—"}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
