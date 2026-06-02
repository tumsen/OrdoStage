import type {
  ProductionCostCategory,
  ProductionCostLine,
  ProductionPerson,
  ProductionPlannerGanttLine,
  ProductionPlannerRow,
  ProductionPlannerTask,
  ProductionTeam,
} from "../types";
import { computeCriticalPath, type SchedulePhaseInput } from "./productionSchedule";

function iso(d: Date): string {
  return d.toISOString();
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayEnd(d: Date): Date {
  return new Date(d.getTime() + 24 * 60 * 60_000 - 60_000);
}

function summarizeCosts(
  lines: ProductionCostLine[],
  currencyCode: string,
  loggedLaborMinutes: number
): ProductionPlannerRow["costSummary"] {
  const byCat = new Map<ProductionCostCategory, { planned: number; actual: number }>();
  let plannedCents = 0;
  let actualCents = 0;
  for (const line of lines) {
    plannedCents += line.plannedCents;
    actualCents += line.actualCents ?? 0;
    const cur = byCat.get(line.category) ?? { planned: 0, actual: 0 };
    cur.planned += line.plannedCents;
    cur.actual += line.actualCents ?? 0;
    byCat.set(line.category, cur);
  }
  return {
    currencyCode,
    plannedCents,
    actualCents,
    varianceCents: actualCents - plannedCents,
    loggedLaborMinutes,
    byCategory: [...byCat.entries()].map(([category, v]) => ({
      category,
      plannedCents: v.planned,
      actualCents: v.actual,
    })),
  };
}

function phaseToTask(phase: {
  id: string;
  title: string;
  category: string;
  phaseKind: string;
  status: string;
  progressPercent?: number;
  startDate: Date;
  endDate: Date | null;
  dependsOnPhaseId?: string | null;
  dependsOnPhase?: { id: string; title: string } | null;
  assigneePerson?: { name: string } | null;
  department?: { name: string } | null;
}): ProductionPlannerTask {
  const start = phase.startDate;
  let end = phase.endDate ?? dayEnd(start);
  if (phase.phaseKind === "milestone" || phase.phaseKind === "deadline") {
    end = new Date(start.getTime() + 24 * 60 * 60_000);
  }
  return {
    id: `phase:${phase.id}`,
    phaseId: phase.id,
    label: phase.title,
    category: phase.category,
    phaseKind: phase.phaseKind as ProductionPlannerTask["phaseKind"],
    start: iso(start),
    end: iso(end),
    status: phase.status,
    assigneeName: phase.assigneePerson?.name ?? null,
    departmentName: phase.department?.name ?? null,
    dependsOnPhaseId: phase.dependsOnPhaseId ?? null,
    dependsOnLabel: phase.dependsOnPhase?.title ?? null,
    progressPercent: phase.progressPercent ?? 0,
  };
}

function costTaskFromLine(line: ProductionCostLine): ProductionPlannerTask {
  const start = new Date(line.startDate!);
  const end = line.endDate ? new Date(line.endDate) : dayEnd(start);
  return {
    id: `cost:${line.id}`,
    phaseId: null,
    label: line.label,
    category: "cost",
    start: iso(start),
    end: iso(end),
    costPlannedCents: line.plannedCents,
    costActualCents: line.actualCents,
  };
}

export type ProductionWithRelations = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  planningStartDate: Date | null;
  premiereDate: Date | null;
  notes: string | null;
  tourId: string | null;
  eventId: string | null;
  leadPersonId: string | null;
  homeVenue: { name: string } | null;
  leadPerson: { name: string } | null;
  tour: { id: string; name: string } | null;
  event: { id: string; title: string } | null;
  tours?: Array<{ id: string; name: string }>;
  events?: Array<{ id: string; title: string }>;
  phases: Array<{
    id: string;
    title: string;
    category: string;
    phaseKind: string;
    status: string;
    progressPercent: number;
    startDate: Date;
    endDate: Date | null;
    assigneePersonId: string | null;
    departmentId: string | null;
    dependsOnPhaseId: string | null;
    dependsOnPhase: { id: string; title: string } | null;
    notes: string | null;
    assigneePerson: { name: string } | null;
    department: { name: string } | null;
  }>;
  people?: Array<{
    id: string;
    productionId: string;
    personId: string;
    role: string | null;
    person: { name: string; role: string | null; email: string | null; phone: string | null };
  }>;
  teams?: Array<{
    id: string;
    productionId: string;
    departmentId: string;
    department: { id: string; name: string; color: string; createdAt: Date };
  }>;
};

export function buildGanttLines(
  production: ProductionWithRelations,
  costLines: ProductionCostLine[]
): ProductionPlannerGanttLine[] {
  const lines: ProductionPlannerGanttLine[] = [];

  const scheduleInputs: SchedulePhaseInput[] = production.phases.map((p) => ({
    id: p.id,
    phaseKind: p.phaseKind,
    startDate: p.startDate,
    endDate: p.endDate,
    dependsOnPhaseId: p.dependsOnPhaseId,
  }));
  const { isCritical, floatDays } = computeCriticalPath(
    scheduleInputs,
    production.premiereDate
  );

  if (production.planningStartDate && production.premiereDate) {
    const task: ProductionPlannerTask = {
      id: `window:${production.id}`,
      phaseId: null,
      label: "Production period",
      category: "planning_window",
      start: iso(production.planningStartDate),
      end: iso(production.premiereDate),
      status: production.status,
    };
    lines.push({
      lineId: task.id,
      kind: "summary",
      label: task.label,
      category: task.category,
      status: production.status,
      dependsOnPhaseId: null,
      task,
    });
  }

  for (const phase of production.phases) {
    const task = phaseToTask(phase);
    lines.push({
      lineId: phase.id,
      kind: "phase",
      label: phase.title,
      category: phase.category,
      status: phase.status,
      notes: phase.notes,
      assigneePersonId: phase.assigneePersonId,
      assigneeName: phase.assigneePerson?.name ?? null,
      departmentId: phase.departmentId,
      departmentName: phase.department?.name ?? null,
      dependsOnPhaseId: phase.dependsOnPhaseId,
      dependsOnLabel: phase.dependsOnPhase?.title ?? null,
      isCritical: isCritical.get(phase.id) ?? false,
      floatDays: floatDays.get(phase.id) ?? 0,
      task,
    });
  }

  if (
    production.premiereDate &&
    !production.phases.some((p) => p.category === "premiere")
  ) {
    const task: ProductionPlannerTask = {
      id: `premiere:${production.id}`,
      phaseId: null,
      label: "Premiere",
      category: "premiere",
      phaseKind: "milestone",
      start: iso(production.premiereDate),
      end: iso(dayEnd(production.premiereDate)),
      status: production.status,
    };
    lines.push({
      lineId: task.id,
      kind: "phase",
      label: task.label,
      category: task.category,
      status: production.status,
      dependsOnPhaseId: null,
      task,
    });
  }

  for (const line of costLines.filter((l) => l.startDate)) {
    const task = costTaskFromLine(line);
    lines.push({
      lineId: task.id,
      kind: "cost",
      label: line.label,
      category: "cost",
      dependsOnPhaseId: null,
      task,
    });
  }

  return lines;
}

export function buildProductionPlannerRow(
  production: ProductionWithRelations,
  costLines: ProductionCostLine[],
  loggedLaborMinutes: number,
  currencyCode: string,
  roster?: { people: ProductionPerson[]; teams: ProductionTeam[] }
): ProductionPlannerRow {
  const ganttLines = buildGanttLines(production, costLines);
  const tasks = ganttLines.map((l) => l.task);

  const phaseDates = production.phases.flatMap((p) => [
    p.startDate.getTime(),
    (p.endDate ?? p.startDate).getTime(),
  ]);
  const allDates = [
    production.planningStartDate?.getTime(),
    production.premiereDate?.getTime(),
    ...phaseDates,
  ].filter((t): t is number => t != null);

  const startDate =
    production.planningStartDate != null
      ? ymd(production.planningStartDate)
      : allDates.length
        ? ymd(new Date(Math.min(...allDates)))
        : null;
  const endDate =
    production.premiereDate != null
      ? ymd(production.premiereDate)
      : allDates.length
        ? ymd(new Date(Math.max(...allDates)))
        : null;

  return {
    id: production.id,
    kind: "production",
    title: production.name,
    status: production.status as ProductionPlannerRow["status"],
    startDate,
    endDate,
    premiereDate: production.premiereDate ? ymd(production.premiereDate) : null,
    venueLabel: production.homeVenue?.name ?? null,
    leadPersonId: production.leadPersonId,
    leadPersonName: production.leadPerson?.name ?? null,
    description: production.description,
    notes: production.notes,
    linkedTourId: production.tour?.id ?? production.tourId,
    linkedTourName: production.tour?.name ?? null,
    linkedEventId: production.event?.id ?? production.eventId,
    linkedEventTitle: production.event?.title ?? null,
    href: `/production`,
    ganttLines,
    tasks,
    costs: costLines,
    costSummary: summarizeCosts(costLines, currencyCode, loggedLaborMinutes),
    people: roster?.people ?? [],
    teams: roster?.teams ?? [],
  };
}

export function mergePlannerTotals(
  rows: ProductionPlannerRow[],
  currencyCode: string
): ProductionPlannerRow["costSummary"] {
  const byCat = new Map<ProductionCostCategory, { planned: number; actual: number }>();
  let plannedCents = 0;
  let actualCents = 0;
  let loggedLaborMinutes = 0;
  for (const row of rows) {
    plannedCents += row.costSummary.plannedCents;
    actualCents += row.costSummary.actualCents;
    loggedLaborMinutes += row.costSummary.loggedLaborMinutes;
    for (const c of row.costSummary.byCategory) {
      const cur = byCat.get(c.category) ?? { planned: 0, actual: 0 };
      cur.planned += c.plannedCents;
      cur.actual += c.actualCents;
      byCat.set(c.category, cur);
    }
  }
  return {
    currencyCode,
    plannedCents,
    actualCents,
    varianceCents: actualCents - plannedCents,
    loggedLaborMinutes,
    byCategory: [...byCat.entries()].map(([category, v]) => ({
      category,
      plannedCents: v.planned,
      actualCents: v.actual,
    })),
  };
}

/** Default timeline blocks when creating a production with a premiere date. */
export function defaultPhasesForPremiere(premiereDate: Date): Array<{
  title: string;
  category: string;
  phaseKind: string;
  startDate: Date;
  endDate: Date | null;
  sortOrder: number;
  dependsOnSortOrder: number | null;
}> {
  const premiere = new Date(premiereDate);
  premiere.setUTCHours(0, 0, 0, 0);
  const msDay = 86_400_000;
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * msDay);

  return [
    {
      title: "Set & scenery build",
      category: "set_build",
      phaseKind: "span",
      startDate: addDays(premiere, -56),
      endDate: addDays(premiere, -14),
      sortOrder: 0,
      dependsOnSortOrder: null,
    },
    {
      title: "Rehearsals",
      category: "rehearsal",
      phaseKind: "span",
      startDate: addDays(premiere, -28),
      endDate: addDays(premiere, -3),
      sortOrder: 1,
      dependsOnSortOrder: 0,
    },
    {
      title: "Tech week",
      category: "tech",
      phaseKind: "span",
      startDate: addDays(premiere, -7),
      endDate: addDays(premiere, -1),
      sortOrder: 2,
      dependsOnSortOrder: 1,
    },
    {
      title: "Premiere",
      category: "premiere",
      phaseKind: "milestone",
      startDate: premiere,
      endDate: null,
      sortOrder: 3,
      dependsOnSortOrder: 2,
    },
  ];
}
