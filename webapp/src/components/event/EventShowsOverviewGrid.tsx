import { Check } from "lucide-react";
import { computeShowStaffingStats } from "@/lib/eventShowStaffing";
import type { EventShow, EventTeam } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { usePreferences } from "@/hooks/usePreferences";
import { localeForLanguage } from "@/lib/preferences";

/** Show is draft unless explicitly confirmed or cancelled. */
export function effectiveShowStatus(show: EventShow): "draft" | "confirmed" | "cancelled" {
  if (show.status === "confirmed") return "confirmed";
  if (show.status === "cancelled") return "cancelled";
  return "draft";
}

export function formatPlannedHoursShort(jobHours: number): string {
  return jobHours >= 10 ? jobHours.toFixed(1) : jobHours.toFixed(2);
}

function formatEventListWhenParts(
  show: EventShow,
  locale: string,
  hour12: boolean
): { weekdayLabel: string; dateOnlyLabel: string; timeLabel: string } {
  const base = new Date(show.showDate.slice(0, 10));
  const [hh, mm] = show.showTime.split(":").map((x) => Number(x));
  if (Number.isFinite(hh) && Number.isFinite(mm)) {
    base.setHours(hh, mm, 0, 0);
  }
  const weekdayLabel = base.toLocaleDateString(locale, { weekday: "long" });
  const dateOnlyLabel = base.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeLabel = base.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12,
  });
  return { weekdayLabel, dateOnlyLabel, timeLabel };
}

function formatEventListSoldAt(iso: string, locale: string, hour12: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", hour12 });
}

/** Returns null when no ticket fields are set. */
function formatEventListTicketBits(show: EventShow, locale: string, hour12: boolean): string | null {
  const parts: string[] = [];
  if (show.ticketsOnSale != null) parts.push(`On sale ${show.ticketsOnSale}`);
  if (show.soldTickets != null) parts.push(`Sold ${show.soldTickets}`);
  if (show.soldTicketsRecordedAt) {
    parts.push(`Sold updated ${formatEventListSoldAt(show.soldTicketsRecordedAt, locale, hour12)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function EventListStaffingHint({
  ok,
  total,
  muted,
}: {
  ok: number;
  total: number;
  muted?: boolean;
}) {
  if (total === 0) {
    return <span className={cn("text-white/35", muted && "text-white/25")}>No teams</span>;
  }
  if (ok === total) {
    return (
      <span
        className={cn("inline-flex items-center gap-0.5 text-emerald-400", muted && "text-emerald-400/50")}
      >
        <Check size={10} className="shrink-0" aria-hidden />
        Staffing OK
      </span>
    );
  }
  return (
    <span className={cn("text-amber-400/90", muted && "text-amber-400/40")}>{ok}/{total} teams OK</span>
  );
}

export function EventShowsOverviewGrid({
  shows,
  teams,
  className,
}: {
  shows: EventShow[];
  teams: EventTeam[];
  /** Extra classes on the outer scroll wrapper (e.g. mt-0). */
  className?: string;
}) {
  const { effective } = usePreferences();
  const prefsLocale = localeForLanguage(effective?.language ?? "en");
  const hour12 = effective?.timeFormat === "12h";

  const sorted = [...shows].sort((a, b) => {
    const da = a.showDate.slice(0, 10);
    const db = b.showDate.slice(0, 10);
    if (da !== db) return da.localeCompare(db);
    return a.showTime.localeCompare(b.showTime);
  });

  if (sorted.length === 0) {
    return <p className="text-[11px] text-white/35">No shows scheduled</p>;
  }

  return (
    <div className={cn("mt-1 overflow-x-auto -mx-1 px-1", className)}>
      <ul
        className="min-w-[min(100%,42rem)] grid items-center gap-x-0 gap-y-1.5 text-[10px] leading-snug"
        style={{
          gridTemplateColumns: hour12
            ? "auto 10ch max-content minmax(8rem,11ch) max-content max-content max-content max-content minmax(0,1fr)"
            : "auto 10ch max-content 6ch max-content max-content max-content max-content minmax(0,1fr)",
        }}
      >
        {sorted.map((show) => {
          const stats = computeShowStaffingStats(show, teams);
          const { ok, total } = stats;
          const showOff = effectiveShowStatus(show) === "cancelled";
          const venueName = show.venue?.name ?? "Venue";
          const ticketBits = formatEventListTicketBits(show, prefsLocale, hour12);
          const when = formatEventListWhenParts(show, prefsLocale, hour12);
          const showStatus = effectiveShowStatus(show);
          const hoursLabel = formatPlannedHoursShort(stats.jobHours);
          const rowTone = showOff
            ? "text-white/30 line-through decoration-white/20"
            : "text-white/50";
          const whenTone = showOff ? undefined : "text-white/[0.82]";
          const venueTone = showOff ? undefined : "text-white/55";
          return (
            <li key={show.id} className="contents">
              <div className="justify-self-start pr-2">
                <StatusBadge
                  status={showStatus}
                  className={cn("text-[10px] py-px px-1.5 font-medium", showOff && "opacity-50")}
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
                  whenTone
                )}
              >
                {when.timeLabel}
              </span>
              <span className={cn("min-w-0 truncate pr-2", rowTone, venueTone)} title={venueName}>
                {venueName}
              </span>
              <div className="min-w-0 truncate pr-4">
                <EventListStaffingHint ok={ok} total={total} muted={showOff} />
              </div>
              <span
                className={cn(
                  "block whitespace-nowrap pr-3 text-right tabular-nums",
                  showOff ? "text-white/25 line-through decoration-white/20" : "text-white/45"
                )}
                title={`${stats.people} people on this show`}
              >
                {stats.people}
              </span>
              <span
                className={cn(
                  "block whitespace-nowrap pl-2 pr-2 text-right tabular-nums",
                  showOff ? "text-white/25 line-through decoration-white/20" : "text-white/45"
                )}
                title="Total planned hours for this show"
              >
                {hoursLabel} h
              </span>
              <div
                className={cn(
                  "min-w-0 truncate pl-2 text-right sm:text-left",
                  ticketBits ? (showOff ? "text-white/35" : "text-white/45") : "text-white/25",
                  showOff && "line-through decoration-white/20"
                )}
                title={ticketBits ?? undefined}
              >
                {ticketBits ?? "—"}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
