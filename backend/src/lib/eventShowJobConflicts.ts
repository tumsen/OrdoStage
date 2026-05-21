import { prisma } from "../prisma";
import { wallClockInstantFromDateIsoAndHHMM } from "../clientWallClock";
import { normalizePeopleNeeded } from "./eventShowJobAssignees";

const toDateTimeFromDateAndTime = wallClockInstantFromDateIsoAndHHMM;

type JobInterval = {
  jobId: string;
  start: Date;
  end: Date;
  personIds: string[];
};

function jobPersonIds(job: {
  personId: string | null;
  assignments: { personId: string }[];
}): string[] {
  if (job.assignments.length > 0) return job.assignments.map((a) => a.personId);
  return job.personId ? [job.personId] : [];
}

function buildIntervals(
  jobs: {
    id: string;
    jobDate: Date;
    startTime: string;
    durationMinutes: number;
    personId: string | null;
    assignments: { personId: string }[];
  }[],
  slotOverrides?: Map<string, (string | null)[]>
): JobInterval[] {
  const out: JobInterval[] = [];
  for (const job of jobs) {
    const start = toDateTimeFromDateAndTime(job.jobDate.toISOString(), job.startTime);
    if (!start) continue;
    const override = slotOverrides?.get(job.id);
    const personIds = override
      ? override.filter((id): id is string => Boolean(id))
      : jobPersonIds(job);
    out.push({
      jobId: job.id,
      start,
      end: new Date(start.getTime() + job.durationMinutes * 60_000),
      personIds,
    });
  }
  return out;
}

function intervalsOverlap(a: JobInterval, b: JobInterval): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

export const JOB_ASSIGNMENT_OVERLAP_MESSAGE =
  "Person is already assigned to an overlapping job on this show";

/** Reject if any person appears on two jobs on the same show with overlapping times. */
export async function assertJobAssignmentsNoOverlap(
  showId: string,
  jobId: string,
  slotPersonIds: (string | null)[]
): Promise<void> {
  const jobs = await prisma.eventShowJob.findMany({
    where: { showId },
    include: { assignments: { select: { personId: true } } },
  });
  const overrides = new Map<string, (string | null)[]>();
  overrides.set(jobId, slotPersonIds);
  const intervals = buildIntervals(jobs, overrides);
  for (let i = 0; i < intervals.length; i++) {
    const a = intervals[i]!;
    if (a.personIds.length === 0) continue;
    for (let j = i + 1; j < intervals.length; j++) {
      const b = intervals[j]!;
      if (b.personIds.length === 0) continue;
      if (!intervalsOverlap(a, b)) continue;
      const shared = a.personIds.some((pid) => b.personIds.includes(pid));
      if (shared) throw new Error(JOB_ASSIGNMENT_OVERLAP_MESSAGE);
    }
  }
}

/** After copy or direct assignment writes, validate all jobs on the show. */
export async function assertShowJobsHaveNoAssignmentOverlap(showId: string): Promise<void> {
  const jobs = await prisma.eventShowJob.findMany({
    where: { showId },
    include: { assignments: { select: { personId: true } } },
  });
  const intervals = buildIntervals(jobs);
  for (let i = 0; i < intervals.length; i++) {
    const a = intervals[i]!;
    if (a.personIds.length === 0) continue;
    for (let j = i + 1; j < intervals.length; j++) {
      const b = intervals[j]!;
      if (b.personIds.length === 0) continue;
      if (!intervalsOverlap(a, b)) continue;
      const shared = a.personIds.some((pid) => b.personIds.includes(pid));
      if (shared) throw new Error(JOB_ASSIGNMENT_OVERLAP_MESSAGE);
    }
  }
}

export function isJobFullyAssigned(job: {
  peopleNeeded: number;
  assignments: { slotIndex: number; personId: string }[];
}): boolean {
  const needed = normalizePeopleNeeded(job.peopleNeeded);
  const slots: (string | null)[] = Array(needed).fill(null);
  for (const a of job.assignments) {
    if (a.slotIndex >= 0 && a.slotIndex < needed) slots[a.slotIndex] = a.personId;
  }
  return slots.filter(Boolean).length >= needed;
}
