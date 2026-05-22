import { Fragment } from "react";
import { Check } from "lucide-react";
import type { TourShowListRow } from "../../../../backend/src/types";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/hooks/usePreferences";
import { localeForLanguage } from "@/lib/preferences";
import {
  formatScheduleEventTimes,
  scheduleEventLabel,
  sortedTourScheduleEvents,
  tourShowPrimaryTime,
} from "@/lib/tourScheduleDisplay";
import {
  computeTourShowCrewStats,
  tourPerformanceCountOnDay,
  tourPerformanceLinesOnDay,
  tourShowVenueLabel,
  type TourPerformanceLine,
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

/** Fixed width so Travel, Day off, and up to “99 Shows” align in the tour list grid. */
const TOUR_DAY_BADGE_LAYOUT =
  "inline-flex h-[1.125rem] w-[4.85rem] min-w-[4.85rem] max-w-[4.85rem] shrink-0 items-center justify-center px-1 py-px text-[10px] font-medium leading-none tabular-nums whitespace-nowrap";

function TourDayTypeBadge({
  show,
  allShows,
}: {
  show: TourShowListRow;
  allShows: TourShowListRow[];
}) {
  if (show.type === "travel") {
    return (
      <Badge
        className={cn(
          TOUR_DAY_BADGE_LAYOUT,
          "bg-blue-900/40 text-blue-300 border-blue-700/40 hover:bg-blue-900/40",
        )}
      >
        Travel
      </Badge>
    );
  }
  if (show.type === "day_off") {
    return (
      <Badge
        className={cn(
          TOUR_DAY_BADGE_LAYOUT,
          "bg-white/5 text-white/40 border-white/10 hover:bg-white/5",
        )}
      >
        Day off
      </Badge>
    );
  }
  const dayKey = (show.dayKey || show.date).slice(0, 10);
  const performanceCount = tourPerformanceCountOnDay(allShows, dayKey);
  const label = performanceCount === 1 ? "1 Show" : `${performanceCount} Shows`;
  return (
    <Badge
      className={cn(
        TOUR_DAY_BADGE_LAYOUT,
        "bg-emerald-900/40 text-emerald-300 border-emerald-700/40 hover:bg-emerald-900/40",
      )}
    >
      {label}
    </Badge>
  );
}

function PerformanceLineList({
  lines,
  field,
  className,
  title,
}: {
  lines: TourPerformanceLine[];
  field: "time" | "venue";
  className?: string;
  title?: string;
}) {
  if (lines.length === 0) {
    return <span className={className}>—</span>;
  }
  return (
    <div className={cn("flex flex-col gap-0.5", className)} title={title}>
      {lines.map((line, i) => (
        <span
          key={`${field}-${i}-${line[field]}`}
          className={cn("truncate block", field === "time" && "tabular-nums")}
          title={line[field]}
        >
          {line[field]}
        </span>
      ))}
    </div>
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

function tourOverviewGridColumns(hour12: boolean): string {
  return hour12
    ? "auto 10ch max-content minmax(8rem,11ch) max-content max-content max-content minmax(0,1fr)"
    : "auto 10ch max-content 6ch max-content max-content max-content minmax(0,1fr)";
}

const tourOverviewHeaderCellClass =
  "text-[10px] uppercase tracking-wide text-white/35 font-medium leading-snug";

/** Shared padding/alignment for header and data cells so columns line up. */
const tourOverviewCol = {
  type: "pr-2 justify-self-start",
  day: "min-w-0 truncate text-left",
  date: "min-w-0 truncate pl-2 pr-[5mm] text-left",
  time: "justify-self-start text-left pr-1 min-w-0",
  venue: "min-w-0 pl-[1cm] pr-2 text-left",
  crew: "min-w-0 pr-4",
  people: "whitespace-nowrap pr-3 text-right tabular-nums",
  extra: "min-w-0 truncate pl-2 text-right sm:text-left",
} as const;

const tourOverviewSubgridRowClass = "col-span-full grid items-center [grid-template-columns:subgrid]";

function TourShowsOverviewHeaderCells() {
  const headerBorder = "border-b border-white/[0.08] pb-1.5";
  return (
    <li className={cn(tourOverviewSubgridRowClass, "items-end")}>
      <span className={cn(tourOverviewHeaderCellClass, tourOverviewCol.type, headerBorder)}>Type</span>
      <span className={cn(tourOverviewHeaderCellClass, tourOverviewCol.day, headerBorder)}>Day</span>
      <span className={cn(tourOverviewHeaderCellClass, tourOverviewCol.date, headerBorder)}>Date</span>
      <span className={cn(tourOverviewHeaderCellClass, tourOverviewCol.time, headerBorder)}>Time</span>
      <span className={cn(tourOverviewHeaderCellClass, tourOverviewCol.venue, headerBorder)}>Venue</span>
      <span className={cn(tourOverviewHeaderCellClass, tourOverviewCol.crew, headerBorder)}>Crew</span>
      <span className={cn(tourOverviewHeaderCellClass, tourOverviewCol.people, headerBorder)}>People</span>
      <span className={cn(tourOverviewHeaderCellClass, tourOverviewCol.extra, headerBorder)}>Rider</span>
    </li>
  );
}

export function TourShowsOverviewGrid({
  shows,
  tourHandsNeeded,
  tourPeopleCount,
  className,
  showColumnHeaders = false,
  includeScheduleEvents = false,
}: {
  shows: TourShowListRow[];
  tourHandsNeeded: number | null;
  tourPeopleCount: number;
  className?: string;
  /** Column labels aligned with the tour list grid (Tours page). */
  showColumnHeaders?: boolean;
  /** When true, indented schedule lines appear under each show day (expanded tour list row). */
  includeScheduleEvents?: boolean;
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

  const gridCols = tourOverviewGridColumns(hour12);

  return (
    <div className={cn("mt-1 overflow-x-auto -mx-1 px-1", className)}>
      <ul
        className="min-w-[min(100%,38rem)] grid items-center gap-x-0 gap-y-1.5 text-[10px] leading-snug"
        style={{ gridTemplateColumns: gridCols }}
      >
        {showColumnHeaders ? <TourShowsOverviewHeaderCells /> : null}
        {sorted.map((show) => {
          const stats = computeTourShowCrewStats(show, tourHandsNeeded, tourPeopleCount);
          const dayKey = (show.dayKey || show.date).slice(0, 10);
          const usePerformanceLines = show.type === "show" && !includeScheduleEvents;
          const performanceLines =
            usePerformanceLines
              ? tourPerformanceLinesOnDay(sorted, dayKey, prefsLocale, hour12)
              : [];
          const venueName = tourShowVenueLabel(show);
          const when = formatTourListWhenParts(show, prefsLocale, hour12);
          const muted = show.type === "day_off";
          const rowTone = muted ? "text-white/30" : "text-white/50";
          const whenTone = muted ? undefined : "text-white/[0.82]";
          const venueTone = muted ? undefined : "text-white/55";
          const extra = tourListExtraColumn(show);
          const jobRowTone = muted ? "text-white/25 line-through decoration-white/20" : "text-white/40";
          const scheduleEvents =
            includeScheduleEvents && show.type === "show"
              ? sortedTourScheduleEvents(show)
              : [];

          return (
            <Fragment key={show.id}>
              <li className={tourOverviewSubgridRowClass}>
                <div className={tourOverviewCol.type}>
                  <TourDayTypeBadge show={show} allShows={sorted} />
                </div>
                <span className={cn(tourOverviewCol.day, rowTone, whenTone)} title={when.weekdayLabel}>
                  {when.weekdayLabel}
                </span>
                <span className={cn(tourOverviewCol.date, rowTone, whenTone)} title={when.dateOnlyLabel}>
                  {when.dateOnlyLabel}
                </span>
                {usePerformanceLines ? (
                  <PerformanceLineList
                    lines={performanceLines}
                    field="time"
                    className={cn(tourOverviewCol.time, rowTone, whenTone)}
                  />
                ) : (
                  <span className={cn(tourOverviewCol.time, "whitespace-nowrap tabular-nums", rowTone, whenTone)}>
                    {when.timeLabel}
                  </span>
                )}
                {usePerformanceLines ? (
                  <PerformanceLineList
                    lines={performanceLines}
                    field="venue"
                    className={cn(tourOverviewCol.venue, rowTone, venueTone)}
                  />
                ) : (
                  <span className={cn(tourOverviewCol.venue, "truncate", rowTone, venueTone)} title={venueName}>
                    {venueName}
                  </span>
                )}
                <div className={tourOverviewCol.crew}>
                  <TourListCrewHint people={stats.people} needed={stats.needed} muted={muted} />
                </div>
                <span
                  className={cn(tourOverviewCol.people, muted ? "text-white/25" : "text-white/45")}
                  title={`${stats.people} people on this day`}
                >
                  {stats.people}
                </span>
                <div
                  className={cn(
                    tourOverviewCol.extra,
                    extra ? (muted ? "text-white/35" : "text-white/45") : "text-white/25"
                  )}
                  title={extra ?? undefined}
                >
                  {extra ?? "—"}
                </div>
              </li>
              {scheduleEvents.map((ev) => {
                const label = scheduleEventLabel(ev);
                const times = formatScheduleEventTimes(ev);
                return (
                  <li
                    key={ev.id}
                    className={cn(tourOverviewSubgridRowClass, "pl-3 sm:pl-4")}
                    title={`${label} · ${times}`}
                  >
                    <span className={cn(tourOverviewCol.type, "text-white/25")} aria-hidden>
                      ·
                    </span>
                    <span className={cn(tourOverviewCol.day, jobRowTone)} />
                    <span className={cn(tourOverviewCol.date, jobRowTone)} />
                    <span className={cn(tourOverviewCol.time, "tabular-nums", jobRowTone)}>{times || "—"}</span>
                    <span className={cn(tourOverviewCol.venue, "font-medium truncate", jobRowTone)} title={label}>
                      {label}
                    </span>
                    <span className={cn(tourOverviewCol.crew, "text-white/20")}>—</span>
                    <span className={cn(tourOverviewCol.people, "text-white/20")}>—</span>
                    <span className={cn(tourOverviewCol.extra, "text-white/20")}>—</span>
                  </li>
                );
              })}
            </Fragment>
          );
        })}
      </ul>
    </div>
  );
}
