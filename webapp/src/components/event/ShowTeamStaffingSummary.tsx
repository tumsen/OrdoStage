import { useMemo } from "react";
import { AlertTriangle, Check } from "lucide-react";

import {
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
  return `${row.name}: no jobs`;
}

function TeamStaffingBadge({ row, muted }: { row: ShowTeamStaffingRow; muted?: boolean }) {
  const isOk = row.state === "ok";
  const needsStaff = row.state === "incomplete";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded border px-1.5 py-px text-[10px] font-medium max-w-[10rem] shrink-0",
        muted && "opacity-60"
      )}
      style={
        row.color
          ? {
              backgroundColor: `${row.color}22`,
              borderColor: `${row.color}55`,
              color: row.color,
            }
          : {
              backgroundColor: "rgba(255,255,255,0.06)",
              borderColor: "rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.75)",
            }
      }
      title={teamStaffingStatusLabel(row)}
    >
      {isOk ? (
        <Check size={10} className="shrink-0 text-emerald-400" aria-hidden />
      ) : needsStaff ? (
        <AlertTriangle size={10} className="shrink-0 text-amber-400" aria-hidden />
      ) : (
        <span className="w-2.5 text-center text-white/35 shrink-0" aria-hidden>
          ·
        </span>
      )}
      {row.slotsNeeded > 0 ? (
        <span className="tabular-nums shrink-0 opacity-90">
          {row.slotsFilled}/{row.slotsNeeded}
        </span>
      ) : null}
      <span className="truncate">{row.name}</span>
    </span>
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
  /** Events overview: per-team icon + colored badge on one line. */
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

  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-1 min-w-0", className)}
      title={rows.map(teamStaffingStatusLabel).join(" · ")}
    >
      <span className={cn("text-[10px] text-white/45 shrink-0", muted && "text-white/30")}>
        Team Staffing
      </span>
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
      {rows.map((row) => (
        <TeamStaffingBadge key={row.teamId} row={row} muted={muted} />
      ))}
    </span>
  );
}
