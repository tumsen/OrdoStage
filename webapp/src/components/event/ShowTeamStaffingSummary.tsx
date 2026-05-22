import { forwardRef, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";

import {
  computeShowJobStaffingStats,
  computeShowStaffingStats,
  computeShowTeamStaffingRows,
  type ShowTeamStaffingRow,
} from "@/lib/eventShowStaffing";
import type { EventShow, EventTeam } from "@/lib/types";
import { cn } from "@/lib/utils";

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
    uniformWidth?: number;
  }
>(function TeamStaffingBadge({ row, muted, uniformWidth }, ref) {
  const isOk = row.state === "ok";
  const needsStaff = row.state === "incomplete";

  return (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-0.5 rounded border px-1.5 py-px text-[10px] font-medium whitespace-nowrap shrink-0 box-border",
        uniformWidth != null ? "justify-center" : "w-auto",
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
        ...(uniformWidth != null
          ? { width: uniformWidth, minWidth: uniformWidth, maxWidth: uniformWidth }
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

/** All team badges on one show share the width of the widest badge. */
function TeamStaffingBadgesRow({ rows, muted }: { rows: ShowTeamStaffingRow[]; muted?: boolean }) {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const [uniformWidth, setUniformWidth] = useState<number | undefined>(undefined);
  const rowKey = useMemo(() => rows.map((r) => `${r.teamId}:${r.state}:${r.slotsFilled}/${r.slotsNeeded}:${r.name}`).join("|"), [rows]);

  useLayoutEffect(() => {
    refs.current = refs.current.slice(0, rows.length);
    let max = 0;
    for (let i = 0; i < rows.length; i++) {
      const w = refs.current[i]?.offsetWidth ?? 0;
      if (w > max) max = w;
    }
    setUniformWidth(max > 0 ? max : undefined);
  }, [rowKey, rows.length]);

  return (
    <>
      {rows.map((row, index) => (
        <TeamStaffingBadge
          key={row.teamId}
          ref={(el) => {
            refs.current[index] = el;
          }}
          row={row}
          muted={muted}
          uniformWidth={uniformWidth}
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
