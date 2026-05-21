import type { EventShow, EventShowJob, EventTeam } from "@/lib/types";

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
    if (j.personId) people.add(j.personId);
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
      if (j.personId) people.add(j.personId);
    }
    for (const s of show.staffing ?? []) {
      people.add(s.personId);
    }
  }
  return { people: people.size, jobHours: jobMinutes / 60 };
}
