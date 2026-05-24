/** Client-side schedule validation (mirrors backend/src/lib/productionSchedule.ts). */
export {
  validatePhaseDates,
  wouldCreateCycle,
  type SchedulePhaseInput,
  type ScheduleError,
  type ScheduleErrorCode,
} from "./productionSchedule";

import type { SchedulePhaseInput } from "./productionSchedule";

export function phaseInputFromGanttLine(line: {
  lineId: string;
  task: {
    phaseId?: string | null;
    phaseKind?: string;
    start: string;
    end: string;
  };
  dependsOnPhaseId: string | null;
}): SchedulePhaseInput {
  const phaseKind = line.task.phaseKind ?? "span";
  const isSingle = phaseKind === "milestone" || phaseKind === "deadline";
  return {
    id: line.task.phaseId ?? line.lineId,
    phaseKind,
    startDate: new Date(line.task.start),
    endDate: isSingle ? null : new Date(line.task.end),
    dependsOnPhaseId: line.dependsOnPhaseId,
  };
}
