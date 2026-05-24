export type SchedulePhaseInput = {
  id: string;
  phaseKind: string;
  startDate: Date;
  endDate: Date | null;
  dependsOnPhaseId: string | null;
};

export type ScheduleErrorCode = "INVALID_RANGE" | "DEPENDENCY_VIOLATION" | "CYCLE";

export type ScheduleError = {
  code: ScheduleErrorCode;
  message: string;
};

const MS_DAY = 86_400_000;

function snapDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function effectiveEnd(phase: SchedulePhaseInput): Date {
  if (phase.phaseKind === "milestone" || phase.phaseKind === "deadline") {
    return new Date(snapDay(phase.startDate).getTime() + MS_DAY);
  }
  return phase.endDate ?? new Date(snapDay(phase.startDate).getTime() + MS_DAY);
}

export function wouldCreateCycle(
  phaseId: string | undefined,
  dependsOnPhaseId: string | null,
  phases: SchedulePhaseInput[]
): boolean {
  if (!dependsOnPhaseId) return false;
  if (phaseId && dependsOnPhaseId === phaseId) return true;

  const byId = new Map(phases.map((p) => [p.id, p]));
  const seen = new Set<string>();
  let cur: string | null = dependsOnPhaseId;
  while (cur) {
    if (phaseId && cur === phaseId) return true;
    if (seen.has(cur)) return true;
    seen.add(cur);
    cur = byId.get(cur)?.dependsOnPhaseId ?? null;
  }
  return false;
}

export function validatePhaseDates(
  phase: SchedulePhaseInput,
  allPhases: SchedulePhaseInput[]
): ScheduleError | null {
  const start = snapDay(phase.startDate);
  const end = effectiveEnd(phase);

  if (phase.phaseKind === "span" && phase.endDate && snapDay(phase.endDate).getTime() < start.getTime()) {
    return { code: "INVALID_RANGE", message: "End date must be on or after start date" };
  }

  if (phase.dependsOnPhaseId) {
    const pred = allPhases.find((p) => p.id === phase.dependsOnPhaseId);
    if (pred) {
      const predEnd = effectiveEnd(pred);
      if (start.getTime() < snapDay(predEnd).getTime()) {
        return {
          code: "DEPENDENCY_VIOLATION",
          message: "This phase cannot start before its dependency finishes",
        };
      }
    }
  }

  if (wouldCreateCycle(phase.id, phase.dependsOnPhaseId, allPhases)) {
    return { code: "CYCLE", message: "Circular dependency" };
  }

  if (end.getTime() < start.getTime()) {
    return { code: "INVALID_RANGE", message: "Invalid date range" };
  }

  return null;
}

export type CriticalPathResult = {
  isCritical: Map<string, boolean>;
  floatDays: Map<string, number>;
};

export function computeCriticalPath(
  phases: SchedulePhaseInput[],
  projectEnd: Date | null
): CriticalPathResult {
  const isCritical = new Map<string, boolean>();
  const floatDays = new Map<string, number>();

  if (phases.length === 0) return { isCritical, floatDays };

  const es = new Map<string, number>();
  const ef = new Map<string, number>();

  const sorted = [...phases].sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime() || a.id.localeCompare(b.id)
  );

  for (const p of sorted) {
    let earliestStart = snapDay(p.startDate).getTime();
    if (p.dependsOnPhaseId) {
      const predEf = ef.get(p.dependsOnPhaseId);
      if (predEf != null) earliestStart = Math.max(earliestStart, predEf);
    }
    const end = effectiveEnd(p).getTime();
    const dur = Math.max(MS_DAY, end - earliestStart);
    es.set(p.id, earliestStart);
    ef.set(p.id, earliestStart + dur);
  }

  const maxEf = Math.max(...[...ef.values()], projectEnd?.getTime() ?? 0);
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();

  const dependents = new Map<string, string[]>();
  for (const p of phases) {
    if (p.dependsOnPhaseId) {
      const list = dependents.get(p.dependsOnPhaseId) ?? [];
      list.push(p.id);
      dependents.set(p.dependsOnPhaseId, list);
    }
  }

  for (const p of [...sorted].reverse()) {
    const deps = dependents.get(p.id) ?? [];
    let latestFinish = maxEf;
    for (const d of deps) {
      const dLs = ls.get(d);
      if (dLs != null) latestFinish = Math.min(latestFinish, dLs);
    }
    const dur = (ef.get(p.id) ?? 0) - (es.get(p.id) ?? 0);
    lf.set(p.id, latestFinish);
    ls.set(p.id, latestFinish - dur);
  }

  for (const p of phases) {
    const esVal = es.get(p.id) ?? 0;
    const lsVal = ls.get(p.id) ?? esVal;
    const float = Math.round((lsVal - esVal) / MS_DAY);
    floatDays.set(p.id, Math.max(0, float));
    isCritical.set(p.id, float === 0);
  }

  return { isCritical, floatDays };
}
