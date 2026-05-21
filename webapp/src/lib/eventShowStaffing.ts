import type { EventShow, EventShowJob, EventTeam, Person } from "@/lib/types";

export const MAX_JOB_PEOPLE_NEEDED = 50;

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

export function computeShowStaffingStats(show: EventShow, eventTeams: EventTeam[]) {
  const teamIds = eventTeams.map((t) => t.team.id);
  const okMap = parseStaffingOkMap(show.staffingOkByDepartment);
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
