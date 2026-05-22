import { useMemo } from "react";
import { AlertTriangle, Check } from "lucide-react";

import {
  computeShowStaffingStats,
  computeShowTeamStaffingRows,
  type ShowTeamStaffingRow,
} from "@/lib/eventShowStaffing";
import type { EventShow, EventTeam } from "@/lib/types";
import { cn } from "@/lib/utils";

function TeamNameChip({
  row,
  variant,
  muted,
}: {
  row: ShowTeamStaffingRow;
  variant: "ok" | "incomplete" | "no_jobs";
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 max-w-full",
        variant === "ok" && (muted ? "text-emerald-400/50" : "text-emerald-300/90"),
        variant === "incomplete" && (muted ? "text-amber-400/45" : "text-amber-300/90"),
        variant === "no_jobs" && (muted ? "text-white/25" : "text-white/40")
      )}
      title={row.name}
    >
      {row.color ? (
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: row.color }}
          aria-hidden
        />
      ) : null}
      <span className="truncate">{row.name}</span>
    </span>
  );
}

function StaffingHeader({
  ok,
  total,
  allOk,
  muted,
}: {
  ok: number;
  total: number;
  allOk: boolean;
  muted?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      <span className={cn("text-[10px] text-white/45 shrink-0", muted && "text-white/30")}>
        Team Staffing
      </span>
      {allOk ? (
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
          allOk
            ? muted
              ? "text-emerald-400/55"
              : "text-emerald-300/95"
            : muted
              ? "text-amber-400/55"
              : "text-amber-300/95"
        )}
      >
        {ok}/{total}
      </span>
    </span>
  );
}

function TeamStaffingLists({
  rows,
  muted,
}: {
  rows: ShowTeamStaffingRow[];
  muted?: boolean;
}) {
  const done = rows.filter((r) => r.state === "ok");
  const notDone = rows.filter((r) => r.state === "incomplete");
  const noJobs = rows.filter((r) => r.state === "no_jobs");

  return (
    <div className="flex flex-col gap-1 min-w-0">
      {done.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className={cn("text-[10px] text-emerald-400/70 shrink-0", muted && "text-emerald-400/40")}>
            Done
          </span>
          {done.map((row) => (
            <TeamNameChip key={row.teamId} row={row} variant="ok" muted={muted} />
          ))}
        </div>
      ) : null}
      {notDone.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className={cn("text-[10px] text-amber-400/70 shrink-0", muted && "text-amber-400/40")}>
            Not done
          </span>
          {notDone.map((row) => (
            <TeamNameChip key={row.teamId} row={row} variant="incomplete" muted={muted} />
          ))}
        </div>
      ) : null}
      {noJobs.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className={cn("text-[10px] text-white/35 shrink-0", muted && "text-white/25")}>
            No jobs
          </span>
          {noJobs.map((row) => (
            <TeamNameChip key={row.teamId} row={row} variant="no_jobs" muted={muted} />
          ))}
        </div>
      ) : null}
    </div>
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
  /** Events overview: list team names under the summary. */
  detailed?: boolean;
}) {
  const rows = useMemo(() => computeShowTeamStaffingRows(show, teams), [show, teams]);
  const { ok, total } = useMemo(() => computeShowStaffingStats(show, teams), [show, teams]);

  if (total === 0) {
    return <span className={cn("text-[10px] text-white/35", muted && "text-white/25", className)}>No teams</span>;
  }

  const allOk = ok === total;

  if (!detailed) {
    return (
      <span className={cn("inline-flex items-center gap-1 min-w-0", className)}>
        <StaffingHeader ok={ok} total={total} allOk={allOk} muted={muted} />
      </span>
    );
  }

  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <StaffingHeader ok={ok} total={total} allOk={allOk} muted={muted} />
      <TeamStaffingLists rows={rows} muted={muted} />
    </div>
  );
}
