import { parseISO } from "date-fns";
import type { ProductionPlannerGanttLine } from "@/lib/types";
import { dateToPct } from "@/lib/productionGanttMath";

export type GanttDependencyArrow = {
  key: string;
  fromRow: number;
  toRow: number;
  fromPct: number;
  toPct: number;
};

/** Finish-to-start dependency connectors for the planner Gantt (and PDF). */
export function buildGanttDependencyArrows(
  lines: ProductionPlannerGanttLine[],
  rangeStart: Date,
  rangeEnd: Date
): GanttDependencyArrow[] {
  const rowByPhaseId = new Map<string, number>();
  lines.forEach((line, idx) => {
    if (line.kind === "phase" && line.task.phaseId) {
      rowByPhaseId.set(line.task.phaseId, idx);
    }
  });

  const arrows: GanttDependencyArrow[] = [];
  lines.forEach((line, toRow) => {
    const depId = line.dependsOnPhaseId;
    if (!depId) return;
    const fromRow = rowByPhaseId.get(depId);
    if (fromRow == null) return;
    const pred = lines[fromRow];
    if (!pred) return;
    const fromPct = dateToPct(parseISO(pred.task.end), rangeStart, rangeEnd);
    const toPct = dateToPct(parseISO(line.task.start), rangeStart, rangeEnd);
    arrows.push({ key: `${depId}->${line.lineId}`, fromRow, toRow, fromPct, toPct });
  });
  return arrows;
}
