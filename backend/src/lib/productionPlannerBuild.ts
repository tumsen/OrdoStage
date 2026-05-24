import type {
  ProductionCostCategory,
  ProductionCostLine,
  ProductionPlannerRow,
  ProductionPlannerTask,
} from "../types";

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
  startDate: Date;
  endDate: Date | null;
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
    label: phase.title,
    category: phase.category,
    phaseKind: phase.phaseKind as ProductionPlannerTask["phaseKind"],
    start: iso(start),
    end: iso(end),
    status: phase.status,
    assigneeName: phase.assigneePerson?.name ?? null,
    departmentName: phase.department?.name ?? null,
  };
}

function costTasksFromLines(lines: ProductionCostLine[]): ProductionPlannerTask[] {
  return lines
    .filter((l) => l.startDate)
    .map((line) => {
      const start = new Date(line.startDate!);
      const end = line.endDate ? new Date(line.endDate) : dayEnd(start);
      return {
        id: `cost:${line.id}`,
        label: line.label,
        category: "cost",
        start: iso(start),
        end: iso(end),
        costPlannedCents: line.plannedCents,
        costActualCents: line.actualCents,
      };
    });
}

export type ProductionWithRelations = {
  id: string;
  name: string;
  status: string;
  planningStartDate: Date | null;
  premiereDate: Date | null;
  notes: string | null;
  tourId: string | null;
  eventId: string | null;
  homeVenue: { name: string } | null;
  leadPerson: { name: string } | null;
  tour: { id: string; name: string } | null;
  event: { id: string; title: string } | null;
  phases: Array<{
    id: string;
    title: string;
    category: string;
    phaseKind: string;
    status: string;
    startDate: Date;
    endDate: Date | null;
    assigneePerson: { name: string } | null;
    department: { name: string } | null;
  }>;
};

export function buildProductionPlannerRow(
  production: ProductionWithRelations,
  costLines: ProductionCostLine[],
  loggedLaborMinutes: number,
  currencyCode: string
): ProductionPlannerRow {
  const tasks: ProductionPlannerTask[] = production.phases.map(phaseToTask);

  if (production.planningStartDate && production.premiereDate) {
    tasks.unshift({
      id: `window:${production.id}`,
      label: "Production period",
      category: "planning_window",
      start: iso(production.planningStartDate),
      end: iso(production.premiereDate),
      status: production.status,
    });
  }

  if (
    production.premiereDate &&
    !production.phases.some((p) => p.category === "premiere")
  ) {
    tasks.push({
      id: `premiere:${production.id}`,
      label: "Premiere",
      category: "premiere",
      phaseKind: "milestone",
      start: iso(production.premiereDate),
      end: iso(dayEnd(production.premiereDate)),
      status: production.status,
    });
  }

  tasks.push(...costTasksFromLines(costLines));

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
    leadPersonName: production.leadPerson?.name ?? null,
    linkedTourId: production.tour?.id ?? production.tourId,
    linkedTourName: production.tour?.name ?? null,
    linkedEventId: production.event?.id ?? production.eventId,
    linkedEventTitle: production.event?.title ?? null,
    href: `/production`,
    tasks,
    costs: costLines,
    costSummary: summarizeCosts(costLines, currencyCode, loggedLaborMinutes),
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
    },
    {
      title: "Rehearsals",
      category: "rehearsal",
      phaseKind: "span",
      startDate: addDays(premiere, -28),
      endDate: addDays(premiere, -3),
      sortOrder: 1,
    },
    {
      title: "Tech week",
      category: "tech",
      phaseKind: "span",
      startDate: addDays(premiere, -7),
      endDate: addDays(premiere, -1),
      sortOrder: 2,
    },
    {
      title: "Premiere",
      category: "premiere",
      phaseKind: "milestone",
      startDate: premiere,
      endDate: null,
      sortOrder: 3,
    },
  ];
}
