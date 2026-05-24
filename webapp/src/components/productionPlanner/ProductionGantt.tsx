import { useMemo, useRef, useState, useLayoutEffect } from "react";
import { format, parseISO, differenceInCalendarDays, isToday, isWeekend } from "date-fns";
import { cn } from "@/lib/utils";
import type { ProductionPlannerGanttLine, ProductionPlannerRow } from "@/lib/types";
import {
  PRODUCTION_STATUS_LABELS,
  TASK_CATEGORY_LABELS,
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

const ROW_HEIGHT = 40;
const BAR_HEIGHT = 24;
const LABEL_WIDTH = 300;
const TIMELINE_HEADER_H = 52;

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, n));
}

function dateToPct(d: Date, rangeStart: Date, rangeEnd: Date): number {
  const totalMs = rangeEnd.getTime() - rangeStart.getTime();
  if (totalMs <= 0) return 0;
  return clampPct(((d.getTime() - rangeStart.getTime()) / totalMs) * 100);
}

function taskBarStyle(
  startIso: string,
  endIso: string,
  rangeStart: Date,
  rangeEnd: Date,
  dayCount: number
): { left: string; width: string } | null {
  const start = parseISO(startIso);
  const end = parseISO(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const totalMs = rangeEnd.getTime() - rangeStart.getTime();
  if (totalMs <= 0) return null;

  const leftPct = clampPct(((start.getTime() - rangeStart.getTime()) / totalMs) * 100);
  const rightPct = clampPct(((end.getTime() - rangeStart.getTime()) / totalMs) * 100);
  const widthPct = Math.max((100 / dayCount) * 0.25, rightPct - leftPct);

  return { left: `${leftPct}%`, width: `${widthPct}%` };
}

type DependencyArrow = {
  key: string;
  fromRow: number;
  toRow: number;
  fromPct: number;
  toPct: number;
};

function buildDependencyArrows(
  lines: ProductionPlannerGanttLine[],
  rangeStart: Date,
  rangeEnd: Date
): DependencyArrow[] {
  const rowByPhaseId = new Map<string, number>();
  lines.forEach((line, idx) => {
    if (line.kind === "phase" && line.task.phaseId) {
      rowByPhaseId.set(line.task.phaseId, idx);
    }
  });

  const arrows: DependencyArrow[] = [];
  lines.forEach((line, toRow) => {
    const depId = line.dependsOnPhaseId;
    if (!depId) return;
    const fromRow = rowByPhaseId.get(depId);
    if (fromRow == null) return;

    const pred = lines[fromRow];
    if (!pred) return;

    const fromPct = dateToPct(parseISO(pred.task.end), rangeStart, rangeEnd);
    const toPct = dateToPct(parseISO(line.task.start), rangeStart, rangeEnd);
    arrows.push({
      key: `${depId}->${line.lineId}`,
      fromRow,
      toRow,
      fromPct,
      toPct,
    });
  });
  return arrows;
}

function DependencyLayer({
  arrows,
  rowCount,
  timelineWidth,
}: {
  arrows: DependencyArrow[];
  rowCount: number;
  timelineWidth: number;
}) {
  if (arrows.length === 0 || timelineWidth <= 0) return null;

  const height = rowCount * ROW_HEIGHT;
  const labelOffset = LABEL_WIDTH;

  return (
    <svg
      className="absolute top-0 pointer-events-none z-20"
      style={{ left: labelOffset, width: timelineWidth, height }}
      aria-hidden
    >
      <defs>
        <marker
          id="gantt-arrowhead"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill="rgba(255,255,255,0.45)" />
        </marker>
      </defs>
      {arrows.map((a) => {
        const x1 = (a.fromPct / 100) * timelineWidth;
        const x2 = (a.toPct / 100) * timelineWidth;
        const y1 = a.fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
        const y2 = a.toRow * ROW_HEIGHT + ROW_HEIGHT / 2;
        const midX = x1 + Math.max(12, (x2 - x1) * 0.45);
        const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
        return (
          <path
            key={a.key}
            d={d}
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="1.5"
            markerEnd="url(#gantt-arrowhead)"
          />
        );
      })}
    </svg>
  );
}

export function ProductionGantt({
  row,
  from,
  to,
  currencyCode,
  selectedLineId,
  onSelectLine,
}: {
  row: ProductionPlannerRow | null;
  from: string;
  to: string;
  currencyCode: string;
  selectedLineId: string | null;
  onSelectLine: (lineId: string) => void;
}) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [timelineWidth, setTimelineWidth] = useState(0);

  const rangeStart = useMemo(() => parseISO(`${from}T00:00:00`), [from]);
  const rangeEnd = useMemo(() => {
    const d = parseISO(`${to}T00:00:00`);
    return new Date(d.getTime() + 86_400_000);
  }, [to]);

  const lines = useMemo(() => row?.ganttLines ?? [], [row?.ganttLines]);

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
  const timelineMinWidth = dayCount * colMinWidth;

  const todayLeft = clampPct(
    ((Date.now() - rangeStart.getTime()) / (rangeEnd.getTime() - rangeStart.getTime())) * 100
  );

  const dependencyArrows = useMemo(
    () => buildDependencyArrows(lines, rangeStart, rangeEnd),
    [lines, rangeStart, rangeEnd]
  );

  useLayoutEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTimelineWidth(el.clientWidth));
    ro.observe(el);
    setTimelineWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [lines.length, timelineMinWidth]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-xl border border-white/10 bg-[#12121a]/80 overflow-hidden flex flex-col min-h-0 flex-1">
        {row ? (
          <div className="px-3 py-2 border-b border-white/10 bg-white/[0.02] shrink-0 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-white/90">{row.title}</span>
            <Badge variant="outline" className="text-[9px] border-white/15 text-white/45">
              {PRODUCTION_STATUS_LABELS[row.status] ?? row.status}
            </Badge>
            {row.premiereDate ? (
              <span className="text-[10px] text-white/40">Premiere {row.premiereDate}</span>
            ) : null}
            <span className="text-[10px] text-yellow-300/75 tabular-nums ml-auto">
              {formatMoneyFromCents(row.costSummary.plannedCents, currencyCode)} budget
            </span>
          </div>
        ) : null}

        <div className="flex border-b border-white/10 shrink-0 bg-white/[0.02]">
          <div
            className="shrink-0 border-r border-white/10 px-3 flex items-end pb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40"
            style={{ width: LABEL_WIDTH, height: TIMELINE_HEADER_H }}
          >
            Task
          </div>
          <div className="flex-1 overflow-x-auto">
            <div className="flex min-w-max" style={{ minWidth: timelineMinWidth }}>
              {days.map((day) => (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "shrink-0 border-r border-white/5 px-1 py-2 text-center",
                    isWeekend(day) && "bg-white/[0.02]",
                    isToday(day) && "bg-red-950/30"
                  )}
                  style={{ width: colMinWidth, height: TIMELINE_HEADER_H }}
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

        <div className="flex-1 overflow-auto relative">
          {!row || lines.length === 0 ? (
            <p className="p-8 text-center text-sm text-white/40">
              {!row
                ? "Select a production above."
                : "No phases yet. Add phases to build your Gantt plan."}
            </p>
          ) : (
            <div className="relative" style={{ minWidth: LABEL_WIDTH + timelineMinWidth }}>
              <div
                ref={timelineRef}
                className="absolute top-0 h-0 overflow-hidden pointer-events-none"
                style={{ left: LABEL_WIDTH, width: timelineMinWidth }}
                aria-hidden
              />
              <DependencyLayer
                arrows={dependencyArrows}
                rowCount={lines.length}
                timelineWidth={timelineWidth || timelineMinWidth}
              />

              {lines.map((line) => {
                const selected = line.lineId === selectedLineId;
                const colors = taskCategoryColors(line.category);
                const pos = taskBarStyle(
                  line.task.start,
                  line.task.end,
                  rangeStart,
                  rangeEnd,
                  dayCount
                );
                const isMilestone =
                  line.task.phaseKind === "milestone" || line.task.phaseKind === "deadline";

                return (
                  <div
                    key={line.lineId}
                    className={cn(
                      "flex border-b border-white/5 transition-colors",
                      selected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
                      line.kind === "summary" && "bg-violet-950/15"
                    )}
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => onSelectLine(line.lineId)}
                  >
                    <div
                      className="shrink-0 border-r border-white/10 px-3 flex flex-col justify-center min-w-0 cursor-pointer"
                      style={{ width: LABEL_WIDTH }}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={cn(
                            "h-2 w-2 rounded-sm shrink-0 border",
                            colors.bar,
                            colors.border
                          )}
                        />
                        <span className="text-xs font-medium text-white/85 truncate">
                          {line.label}
                        </span>
                      </div>
                      <div className="text-[10px] text-white/35 truncate pl-3.5">
                        {TASK_CATEGORY_LABELS[line.category] ?? line.category}
                        {line.dependsOnLabel ? (
                          <span className="text-white/25"> · after {line.dependsOnLabel}</span>
                        ) : null}
                      </div>
                    </div>

                    <div
                      className="flex-1 relative overflow-hidden"
                      style={{ minWidth: timelineMinWidth }}
                    >
                      <div className="absolute inset-0 flex pointer-events-none">
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

                      {pos ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "absolute rounded-md border flex items-center overflow-hidden shadow-sm z-[15] cursor-default",
                                colors.bar,
                                colors.border,
                                line.kind === "cost" && "ring-1 ring-yellow-300/30",
                                line.kind === "summary" && "opacity-70",
                                isMilestone && "rounded-full px-0 justify-center"
                              )}
                              style={{
                                left: pos.left,
                                width: pos.width,
                                top: (ROW_HEIGHT - BAR_HEIGHT) / 2,
                                height: BAR_HEIGHT,
                                minWidth: isMilestone ? 10 : 4,
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {!isMilestone && line.kind !== "summary" ? (
                                <span
                                  className={cn(
                                    "text-[10px] font-medium truncate px-1.5",
                                    colors.text
                                  )}
                                >
                                  {line.label}
                                </span>
                              ) : null}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs">
                            {[
                              line.label,
                              `${line.task.start.slice(0, 10)} → ${line.task.end.slice(0, 10)}`,
                              line.assigneeName ? `Assigned: ${line.assigneeName}` : null,
                              line.dependsOnLabel
                                ? `Depends on: ${line.dependsOnLabel}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
