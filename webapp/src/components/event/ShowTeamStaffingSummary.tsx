import { useMemo } from "react";
import { Check } from "lucide-react";

import { computeShowTeamStaffingRows, type ShowTeamStaffingRow } from "@/lib/eventShowStaffing";
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
        "inline-flex items-center gap-1 rounded px-1 py-px max-w-full",
        variant === "ok" && (muted ? "text-emerald-400/50" : "text-emerald-300/95"),
        variant === "incomplete" && (muted ? "text-amber-400/45" : "text-amber-300/95"),
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

function StaffingGroup({
  label,
  rows,
  variant,
  muted,
  showCheck,
}: {
  label: string;
  rows: ShowTeamStaffingRow[];
  variant: "ok" | "incomplete" | "no_jobs";
  muted?: boolean;
  showCheck?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
      <span
        className={cn(
          "text-[10px] uppercase tracking-wide shrink-0",
          variant === "ok" && (muted ? "text-emerald-400/45" : "text-emerald-400/75"),
          variant === "incomplete" && (muted ? "text-amber-400/45" : "text-amber-400/75"),
          variant === "no_jobs" && "text-white/30"
        )}
      >
        {showCheck ? (
          <span className="inline-flex items-center gap-0.5 normal-case tracking-normal">
            <Check size={10} className="shrink-0" aria-hidden />
            {label}
          </span>
        ) : (
          label
        )}
      </span>
      {rows.map((row) => (
        <TeamNameChip key={row.teamId} row={row} variant={variant} muted={muted} />
      ))}
    </div>
  );
}

export function ShowTeamStaffingSummary({
  show,
  teams,
  muted,
  className,
}: {
  show: EventShow;
  teams: EventTeam[];
  muted?: boolean;
  className?: string;
}) {
  const rows = useMemo(() => computeShowTeamStaffingRows(show, teams), [show, teams]);
  const ok = rows.filter((r) => r.state === "ok");
  const incomplete = rows.filter((r) => r.state === "incomplete");
  const noJobs = rows.filter((r) => r.state === "no_jobs");

  if (rows.length === 0) {
    return <span className={cn("text-white/35", muted && "text-white/25", className)}>No teams</span>;
  }

  const fullyStaffed = incomplete.length === 0 && ok.length > 0 && noJobs.length === 0;

  return (
    <div className={cn("flex flex-col gap-1 min-w-0", className)} title={rows.map((r) => `${r.name}: ${r.state}`).join(", ")}>
      {fullyStaffed ? (
        <StaffingGroup label="Staffing OK" rows={ok} variant="ok" muted={muted} showCheck />
      ) : (
        <>
          <StaffingGroup
            label="OK"
            rows={ok}
            variant="ok"
            muted={muted}
            showCheck={incomplete.length === 0 && ok.length > 0}
          />
          <StaffingGroup label="Needs staff" rows={incomplete} variant="incomplete" muted={muted} />
          <StaffingGroup label="No jobs" rows={noJobs} variant="no_jobs" muted={muted} />
        </>
      )}
    </div>
  );
}
