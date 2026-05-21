import type { EventShow, EventShowJob, EventTeam, Person } from "@/lib/types";

export const MAX_JOB_PEOPLE_NEEDED = 99;

export const MIN_JOB_PEOPLE_NEEDED = 1;

export function jobPeopleNeeded(job: EventShowJob): number {
  return Math.max(1, Math.min(MAX_JOB_PEOPLE_NEEDED, job.peopleNeeded ?? 1));
}

/** Person id per assignment slot (length = peopleNeeded). */
export function jobSlotPersonIds(job: EventShowJob): (string | null)[] {
  const n = jobPeopleNeeded(job);
  if (job.slotPersonIds && job.slotPersonIds.length === n) return [...job.slotPersonIds];
  const slots: (string | null)[] = Array.from({ length: n }, () => null);
  const list = job.people?.length ? job.people : job.person ? [job.person] : [];
  list.forEach((p, i) => {
    if (i < n) slots[i] = p.id;
  });
  return slots;
}

/** People assigned to a show job (filled slots only, in slot order). */
export function jobAssignees(job: EventShowJob): Person[] {
  const slots = jobSlotPersonIds(job);
  const byId = new Map((job.people ?? (job.person ? [job.person] : [])).map((p) => [p.id, p]));
  return slots
    .map((id) => (id ? byId.get(id) : null))
    .filter((p): p is Person => Boolean(p));
}

export function formatJobAssigneesLabel(job: EventShowJob): string {
  const needed = jobPeopleNeeded(job);
  const slots = jobSlotPersonIds(job);
  const filled = slots.filter(Boolean).length;
  if (filled === 0) return needed > 1 ? `0/${needed}` : "Unassigned";
  const names = jobAssignees(job).map((p) => p.name);
  if (filled < needed) return `${names.join(", ")} (${filled}/${needed})`;
  return names.join(", ");
}

/** Chronological order for show jobs (date, then start time, then sortOrder). */
export function sortEventShowJobs(jobs: EventShowJob[]): EventShowJob[] {
  return [...jobs].sort((a, b) => {
    const da = (a.jobDate ?? "").slice(0, 10);
    const db = (b.jobDate ?? "").slice(0, 10);
    if (da !== db) return da.localeCompare(db);
    const ta = a.startTime ?? "";
    const tb = b.startTime ?? "";
    if (ta !== tb) return ta.localeCompare(tb);
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}

export function parseStaffingOkMap(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

/** Resize slot list when peopleNeeded changes; lists assignees dropped past the new cap. */
export function slotsAfterPeopleNeededChange(
  currentSlots: (string | null)[],
  newNeeded: number
): { slotPersonIds: (string | null)[]; removedAssigneeIds: string[] } {
  const capped = Math.max(MIN_JOB_PEOPLE_NEEDED, Math.min(MAX_JOB_PEOPLE_NEEDED, newNeeded));
  const slotPersonIds = Array.from({ length: capped }, (_, i) => currentSlots[i] ?? null);
  const removedAssigneeIds = currentSlots
    .slice(capped)
    .filter((id): id is string => Boolean(id));
  return { slotPersonIds, removedAssigneeIds };
}

export function confirmRemoveAssigneesOnNeededReduction(
  fromNeeded: number,
  toNeeded: number,
  removedCount: number
): boolean {
  const plural = removedCount === 1 ? "" : "s";
  return window.confirm(
    `Reduce people needed from ${fromNeeded} to ${toNeeded}? This will remove ${removedCount} assigned person${plural}.`
  );
}

export function isJobFullyAssigned(job: EventShowJob): boolean {
  const needed = jobPeopleNeeded(job);
  const filled = jobSlotPersonIds(job).filter(Boolean).length;
  return filled >= needed;
}

export const STAFFING_BORDER_NEUTRAL = "border-white/10";
export const STAFFING_BORDER_COMPLETE = "border-emerald-500/55";
export const STAFFING_BORDER_INCOMPLETE = "border-red-500/55";

export function jobStaffingBorderClass(job: EventShowJob): string {
  return isJobFullyAssigned(job) ? STAFFING_BORDER_COMPLETE : STAFFING_BORDER_INCOMPLETE;
}

/** Green when all dept jobs filled; red when any job needs people; neutral when no jobs. */
export function departmentStaffingBorderClass(hasJobs: boolean, staffingOk: boolean): string {
  if (!hasJobs) return STAFFING_BORDER_NEUTRAL;
  return staffingOk ? STAFFING_BORDER_COMPLETE : STAFFING_BORDER_INCOMPLETE;
}

/** Staffing overview row: all slots filled on the job (ignores schedule conflicts). */
export function isStaffingRequirementFilled(req: {
  personIds?: string[];
  personId?: string | null;
  peopleNeeded?: number;
  slotPersonIds?: (string | null)[];
}): boolean {
  const needed = Math.max(1, Math.min(MAX_JOB_PEOPLE_NEEDED, req.peopleNeeded ?? 1));
  if (req.slotPersonIds) {
    return req.slotPersonIds.filter(Boolean).length >= needed;
  }
  const filled =
    req.personIds && req.personIds.length > 0
      ? req.personIds.length
      : req.personId
        ? 1
        : 0;
  return filled >= needed;
}

/** Red when unfilled or overlapping assignments; green when fully staffed and no conflict. */
export function staffingRequirementBorderClass(req: {
  personIds?: string[];
  personId?: string | null;
  peopleNeeded?: number;
  hasConflict?: boolean;
}): string {
  if (req.hasConflict || !isStaffingRequirementFilled(req)) return STAFFING_BORDER_INCOMPLETE;
  return STAFFING_BORDER_COMPLETE;
}

/** Staffing OK per event team when all department jobs are fully assigned (or none). */
export function computeStaffingOkByDepartmentFromJobs(
  show: EventShow,
  eventTeams: EventTeam[]
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const t of eventTeams) {
    const deptId = t.team.id;
    const deptJobs = (show.jobs ?? []).filter((j) => (j.departmentId ?? null) === deptId);
    out[deptId] = deptJobs.length === 0 || deptJobs.every(isJobFullyAssigned);
  }
  return out;
}

export type ShowTeamStaffingState = "ok" | "incomplete" | "no_jobs";

export type ShowTeamStaffingRow = {
  teamId: string;
  name: string;
  color: string | null;
  state: ShowTeamStaffingState;
};

/** Per event team: staffing OK, jobs still need people, or no jobs in that department. */
export function computeShowTeamStaffingRows(
  show: EventShow,
  eventTeams: EventTeam[]
): ShowTeamStaffingRow[] {
  const okMap = computeStaffingOkByDepartmentFromJobs(show, eventTeams);
  return eventTeams.map((et) => {
    const teamId = et.team.id;
    const deptJobs = (show.jobs ?? []).filter((j) => (j.departmentId ?? null) === teamId);
    let state: ShowTeamStaffingState;
    if (deptJobs.length === 0) state = "no_jobs";
    else if (okMap[teamId]) state = "ok";
    else state = "incomplete";
    return {
      teamId,
      name: et.team.name,
      color: et.team.color ?? null,
      state,
    };
  });
}

export function computeShowStaffingStats(show: EventShow, eventTeams: EventTeam[]) {
  const teamIds = eventTeams.map((t) => t.team.id);
  const okMap = computeStaffingOkByDepartmentFromJobs(show, eventTeams);
  let ok = 0;
  for (const id of teamIds) {
    if (okMap[id]) ok++;
  }
  const people = new Set<string>();
  for (const j of show.jobs ?? []) {
    for (const p of jobAssignees(j)) people.add(p.id);
  }
  for (const s of show.staffing ?? []) people.add(s.personId);
  let jobMinutes = 0;
  for (const j of show.jobs ?? []) jobMinutes += j.durationMinutes ?? 0;
  return {
    ok,
    total: teamIds.length,
    people: people.size,
    jobHours: jobMinutes / 60,
  };
}

/** Unique people and total job hours across all shows on an event (staffing + jobs). */
export function computeEventWorkTotals(shows: EventShow[]) {
  const people = new Set<string>();
  let jobMinutes = 0;
  for (const show of shows) {
    for (const j of show.jobs ?? []) {
      jobMinutes += j.durationMinutes ?? 0;
      for (const p of jobAssignees(j)) people.add(p.id);
    }
    for (const s of show.staffing ?? []) {
      people.add(s.personId);
    }
  }
  return { people: people.size, jobHours: jobMinutes / 60 };
}
