import {
  createContext,
  forwardRef,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, Check } from "lucide-react";

import {
  computeShowJobStaffingStats,
  computeShowStaffingStats,
  computeShowTeamStaffingRows,
  type ShowTeamStaffingRow,
} from "@/lib/eventShowStaffing";
import type { EventShow, EventTeam } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Max natural badge width per team id across shows on one event row. */
export const EventTeamBadgeWidthsContext = createContext<Record<string, number>>({});

export function EventTeamBadgeWidthScope({
  shows,
  teams,
  children,
}: {
  shows: EventShow[];
  teams: EventTeam[];
  children: ReactNode;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [widthsByTeamId, setWidthsByTeamId] = useState<Record<string, number>>({});
  const measureKey = useMemo(
    () =>
      shows
        .map((show) => {
          const rows = computeShowTeamStaffingRows(show, teams);
          return `${show.id}:${rows.map((r) => `${r.teamId}/${r.state}/${r.slotsFilled}-${r.slotsNeeded}`).join(",")}`;
        })
        .join("|"),
    [shows, teams]
  );

  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root) return;
    const next: Record<string, number> = {};
    root.querySelectorAll<HTMLElement>("[data-team-staffing-badge]").forEach((el) => {
      const teamId = el.dataset.teamId;
      if (!teamId) return;
      const w = el.offsetWidth;
      next[teamId] = Math.max(next[teamId] ?? 0, w);
    });
    setWidthsByTeamId((prev) => {
      const same =
        Object.keys(next).length === Object.keys(prev).length &&
        Object.entries(next).every(([k, v]) => prev[k] === v);
      return same ? prev : next;
    });
  }, [measureKey]);

  return (
    <EventTeamBadgeWidthsContext.Provider value={widthsByTeamId}>
      <div ref={measureRef}>{children}</div>
    </EventTeamBadgeWidthsContext.Provider>
  );
}

function teamStaffingStatusLabel(row: ShowTeamStaffingRow): string {
  const slots =
    row.slotsNeeded > 0 ? ` · ${row.slotsFilled}/${row.slotsNeeded} slots` : "";
  if (row.state === "ok") return `${row.name}: staffing OK${slots}`;
  if (row.state === "incomplete") return `${row.name}: needs staff${slots}`;
  return `${row.name}: team on event, no jobs created`;
}

function JobsStaffingFraction({
  jobsStaffed,
  jobsTotal,
  muted,
}: {
  jobsStaffed: number;
  jobsTotal: number;
  muted?: boolean;
}) {
  if (jobsTotal === 0) {
    return (
      <span className={cn("tabular-nums text-[10px] text-white/35 shrink-0", muted && "text-white/25")}>
        0 jobs
      </span>
    );
  }

  const allJobsStaffed = jobsStaffed === jobsTotal;

  return (
    <>
      {allJobsStaffed ? (
        <Check
          size={12}
          className={cn("shrink-0 text-emerald-400", muted && "text-emerald-400/50")}
          aria-hidden
        />
      ) : (
        <AlertTriangle
          size={12}
          className={cn("shrink-0 text-amber-400", muted && "text-amber-400/50")}
          aria-hidden
        />
      )}
      <span
        className={cn(
          "tabular-nums text-[10px] font-medium shrink-0",
          allJobsStaffed
            ? muted
              ? "text-emerald-400/55"
              : "text-emerald-300/95"
            : muted
              ? "text-amber-400/55"
              : "text-amber-300/95"
        )}
        title={`${jobsStaffed} of ${jobsTotal} jobs fully staffed`}
      >
        {jobsStaffed}/{jobsTotal}
      </span>
    </>
  );
}

const TeamStaffingBadge = forwardRef<
  HTMLSpanElement,
  {
    row: ShowTeamStaffingRow;
    muted?: boolean;
    badgeWidth?: number;
  }
>(function TeamStaffingBadge({ row, muted, badgeWidth }, ref) {
  const isOk = row.state === "ok";
  const needsStaff = row.state === "incomplete";

  return (
    <span
      ref={ref}
      data-team-staffing-badge
      data-team-id={row.teamId}
      className={cn(
        "inline-flex items-center gap-0.5 rounded border px-1.5 py-px text-[10px] font-medium whitespace-nowrap shrink-0 box-border",
        badgeWidth != null && badgeWidth > 0 ? "justify-center" : "w-auto",
        muted && "opacity-60"
      )}
      style={{
        ...(row.color
          ? {
              backgroundColor: `${row.color}22`,
              borderColor: `${row.color}55`,
              color: row.color,
            }
          : {
              backgroundColor: "rgba(255,255,255,0.06)",
              borderColor: "rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.75)",
            }),
        ...(badgeWidth != null && badgeWidth > 0
          ? { width: badgeWidth, minWidth: badgeWidth, maxWidth: badgeWidth }
          : {}),
      }}
      title={teamStaffingStatusLabel(row)}
    >
      {isOk ? (
        <Check size={10} className="shrink-0 text-emerald-400" aria-hidden />
      ) : needsStaff ? (
        <AlertTriangle size={10} className="shrink-0 text-amber-400" aria-hidden />
      ) : (
        <span className="w-2.5 text-center text-white/50 shrink-0 font-semibold" aria-hidden title="No jobs">
          ?
        </span>
      )}
      {row.slotsNeeded > 0 ? (
        <span className="tabular-nums shrink-0 opacity-90">
          {row.slotsFilled}/{row.slotsNeeded}
        </span>
      ) : null}
      <span>{row.name}</span>
    </span>
  );
});

function TeamStaffingBadgesRow({ rows, muted }: { rows: ShowTeamStaffingRow[]; muted?: boolean }) {
  const widthsByTeamId = useContext(EventTeamBadgeWidthsContext);

  return (
    <>
      {rows.map((row) => (
        <TeamStaffingBadge
          key={row.teamId}
          row={row}
          muted={muted}
          badgeWidth={widthsByTeamId[row.teamId]}
        />
      ))}
    </>
  );
}

export function ShowTeamStaffingSummary({
  show,
  teams,
  muted,
  className,
  detailed = false,
}: {
  show: EventShow;
  teams: EventTeam[];
  muted?: boolean;
  className?: string;
  /** Events overview: jobs fraction + per-team badges on one line. */
  detailed?: boolean;
}) {
  const rows = useMemo(() => computeShowTeamStaffingRows(show, teams), [show, teams]);
  const { total } = useMemo(() => computeShowStaffingStats(show, teams), [show, teams]);
  const { jobsStaffed, jobsTotal } = useMemo(() => computeShowJobStaffingStats(show), [show]);

  if (total === 0) {
    return <span className={cn("text-[10px] text-white/35", muted && "text-white/25", className)}>No teams</span>;
  }

  if (!detailed) {
    return (
      <span className={cn("inline-flex items-center gap-1 min-w-0", className)}>
        <span className={cn("text-[10px] text-white/45 shrink-0", muted && "text-white/30")}>
          Team Staffing
        </span>
        <JobsStaffingFraction jobsStaffed={jobsStaffed} jobsTotal={jobsTotal} muted={muted} />
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-1 min-w-0", className)}
      title={[
        jobsTotal > 0 ? `${jobsStaffed}/${jobsTotal} jobs staffed` : "No jobs",
        ...rows.map(teamStaffingStatusLabel),
      ].join(" · ")}
    >
      <span className={cn("text-[10px] text-white/45 shrink-0", muted && "text-white/30")}>
        Team Staffing
      </span>
      <JobsStaffingFraction jobsStaffed={jobsStaffed} jobsTotal={jobsTotal} muted={muted} />
      <TeamStaffingBadgesRow rows={rows} muted={muted} />
    </span>
  );
}
