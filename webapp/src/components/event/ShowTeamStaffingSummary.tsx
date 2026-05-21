import { useMemo } from "react";
import { AlertTriangle, Check } from "lucide-react";

import { computeShowStaffingStats, computeShowTeamStaffingRows } from "@/lib/eventShowStaffing";
import type { EventShow, EventTeam } from "@/lib/types";
import { cn } from "@/lib/utils";

function teamStaffingTooltip(rows: ReturnType<typeof computeShowTeamStaffingRows>): string {
  return rows
    .map((r) => {
      const status =
        r.state === "ok" ? "staffing OK" : r.state === "incomplete" ? "needs staff" : "no jobs";
      return `${r.name}: ${status}`;
    })
    .join(" · ");
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
  const { ok, total } = useMemo(() => computeShowStaffingStats(show, teams), [show, teams]);

  if (total === 0) {
    return <span className={cn("text-[10px] text-white/35", muted && "text-white/25", className)}>No teams</span>;
  }

  const allOk = ok === total;

  return (
    <span
      className={cn("inline-flex items-center gap-1 min-w-0", className)}
      title={teamStaffingTooltip(rows)}
    >
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
          allOk ? (muted ? "text-emerald-400/55" : "text-emerald-300/95") : muted ? "text-amber-400/55" : "text-amber-300/95"
        )}
      >
        {ok}/{total}
      </span>
    </span>
  );
}
