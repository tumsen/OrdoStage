import { useMemo } from "react";
import { format, parseISO, differenceInCalendarDays, isToday, isWeekend } from "date-fns";
import { cn } from "@/lib/utils";
import type { ProductionPlannerRow, ProductionPlannerTask } from "@/lib/types";
import {
  PRODUCTION_STATUS_LABELS,
  taskCategoryColors,
} from "@/lib/productionPlannerTheme";
import { formatMoneyFromCents } from "@/lib/formatMoney";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ROW_HEIGHT = 52;
const BAR_HEIGHT = 22;
const LABEL_WIDTH = 280;

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, n));
}

function taskBarStyle(
  task: ProductionPlannerTask,
  rangeStart: Date,
  rangeEnd: Date,
  dayCount: number
): { left: string; width: string } | null {
  const start = parseISO(task.start);
  const end = parseISO(task.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const totalMs = rangeEnd.getTime() - rangeStart.getTime();
  if (totalMs <= 0) return null;

  const leftPct = clampPct(((start.getTime() - rangeStart.getTime()) / totalMs) * 100);
  const rightPct = clampPct(((end.getTime() - rangeStart.getTime()) / totalMs) * 100);
  const widthPct = Math.max((100 / dayCount) * 0.35, rightPct - leftPct);

  return { left: `${leftPct}%`, width: `${widthPct}%` };
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "premiered" || status === "on_tour"
      ? "bg-emerald-400"
      : status === "closed"
        ? "bg-white/25"
        : status === "in_progress" || status === "rehearsal" || status === "tech"
          ? "bg-sky-400"
          : "bg-amber-400/80";
  return <span className={cn("inline-block h-1.5 w-1.5 rounded-full shrink-0", color)} />;
}

export function ProductionGantt({
  rows,
  from,
  to,
  currencyCode,
  selectedRowId,
  onSelectRow,
}: {
  rows: ProductionPlannerRow[];
  from: string;
  to: string;
  currencyCode: string;
  selectedRowId: string | null;
  onSelectRow: (id: string) => void;
}) {
  const rangeStart = useMemo(() => parseISO(`${from}T00:00:00`), [from]);
  const rangeEnd = useMemo(() => {
    const d = parseISO(`${to}T00:00:00`);
    return new Date(d.getTime() + 86_400_000);
  }, [to]);

  const days = useMemo(() => {
    const count = differenceInCalendarDays(rangeEnd, rangeStart);
    return Array.from({ length: Math.max(1, count) }, (_, i) => {
      const d = new Date(rangeStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [rangeStart, rangeEnd]);

  const dayCount = days.length;
  const colMinWidth = dayCount > 90 ? 28 : dayCount > 45 ? 36 : 48;

  const todayLeft = clampPct(
    ((Date.now() - rangeStart.getTime()) / (rangeEnd.getTime() - rangeStart.getTime())) * 100
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-xl border border-white/10 bg-[#12121a]/80 overflow-hidden flex flex-col min-h-0 flex-1">
        <div className="flex border-b border-white/10 shrink-0 bg-white/[0.02]">
          <div
            className="shrink-0 border-r border-white/10 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-white/40"
            style={{ width: LABEL_WIDTH }}
          >
            Production
          </div>
          <div className="flex-1 overflow-x-auto">
            <div className="flex min-w-max" style={{ minWidth: dayCount * colMinWidth }}>
              {days.map((day) => (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "shrink-0 border-r border-white/5 px-1 py-2 text-center",
                    isWeekend(day) && "bg-white/[0.02]",
                    isToday(day) && "bg-red-950/30"
                  )}
                  style={{ width: colMinWidth }}
                >
                  <p className="text-[9px] text-white/35 uppercase">{format(day, "EEE")}</p>
                  <p
                    className={cn(
                      "text-[11px] tabular-nums font-medium",
                      isToday(day) ? "text-red-300" : "text-white/70"
                    )}
                  >
                    {format(day, "d")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-white/40">
              No productions in this date range. Create a new production or adjust the timeline.
            </p>
          ) : (
            rows.map((row) => {
              const selected = row.id === selectedRowId;
              return (
                <div
                  key={row.id}
                  className={cn(
                    "flex border-b border-white/5 cursor-pointer transition-colors",
                    selected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                  )}
                  style={{ minHeight: ROW_HEIGHT }}
                  onClick={() => onSelectRow(row.id)}
                >
                  <div
                    className="shrink-0 border-r border-white/10 px-3 py-2 flex flex-col justify-center gap-0.5"
                    style={{ width: LABEL_WIDTH }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusDot status={row.status} />
                      <span className="text-sm font-medium text-white/90 truncate">{row.title}</span>
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1 py-0 h-4 border-white/15 text-white/45 shrink-0"
                      >
                        {PRODUCTION_STATUS_LABELS[row.status] ?? row.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-white/35 pl-3.5 flex-wrap">
                      {row.premiereDate ? (
                        <span>Premiere {row.premiereDate}</span>
                      ) : row.startDate && row.endDate ? (
                        <span>
                          {row.startDate} → {row.endDate}
                        </span>
                      ) : null}
                      {row.venueLabel ? <span>{row.venueLabel}</span> : null}
                      {row.linkedTourName ? (
                        <span className="text-emerald-300/70">Tour: {row.linkedTourName}</span>
                      ) : null}
                      <span className="text-yellow-300/80 tabular-nums">
                        {formatMoneyFromCents(row.costSummary.plannedCents, currencyCode)} budget
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 relative overflow-hidden">
                    <div
                      className="absolute inset-0 flex pointer-events-none"
                      style={{ minWidth: dayCount * colMinWidth }}
                    >
                      {days.map((day) => (
                        <div
                          key={day.toISOString()}
                          className={cn(
                            "shrink-0 h-full border-r border-white/[0.04]",
                            isWeekend(day) && "bg-white/[0.015]",
                            isToday(day) && "bg-red-950/15"
                          )}
                          style={{ width: colMinWidth }}
                        />
                      ))}
                    </div>

                    {todayLeft >= 0 && todayLeft <= 100 ? (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-red-400/70 z-10 pointer-events-none"
                        style={{ left: `${todayLeft}%` }}
                      />
                    ) : null}

                    <div
                      className="relative h-full"
                      style={{ minWidth: dayCount * colMinWidth, height: ROW_HEIGHT }}
                    >
                      {row.tasks.map((task) => {
                        const pos = taskBarStyle(task, rangeStart, rangeEnd, dayCount);
                        if (!pos) return null;
                        const colors = taskCategoryColors(task.category);
                        const tooltip = [
                          task.label,
                          task.assigneeName ? `Assigned: ${task.assigneeName}` : null,
                          task.departmentName ? task.departmentName : null,
                          task.costPlannedCents != null
                            ? `Budget: ${formatMoneyFromCents(task.costPlannedCents, currencyCode)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ");

                        return (
                          <Tooltip key={task.id}>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "absolute rounded-md border px-1.5 flex items-center overflow-hidden shadow-sm",
                                  colors.bar,
                                  colors.border,
                                  task.category === "cost" && "ring-1 ring-yellow-300/30",
                                  (task.phaseKind === "milestone" || task.phaseKind === "deadline") &&
                                    "rounded-full min-w-[8px] px-0 justify-center"
                                )}
                                style={{
                                  left: pos.left,
                                  width: pos.width,
                                  top: (ROW_HEIGHT - BAR_HEIGHT) / 2,
                                  height: BAR_HEIGHT,
                                  minWidth: 4,
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {task.phaseKind !== "milestone" && task.phaseKind !== "deadline" ? (
                                  <span
                                    className={cn("text-[10px] font-medium truncate", colors.text)}
                                  >
                                    {task.label}
                                  </span>
                                ) : null}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              {tooltip}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
