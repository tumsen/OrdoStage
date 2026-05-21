import {
  calendarDateKeyFromJobDate,
  localWallClockToUtcIso,
  normalizeTimeHHMM,
} from "@/lib/showTiming";
import { jobSlotPersonIds } from "@/lib/eventShowStaffing";
import type { EventShow, EventShowJob } from "@/lib/types";

type JobInterval = {
  jobId: string;
  startMs: number;
  endMs: number;
  personIds: string[];
};

export type JobAssignmentContext = {
  /** Full job list (defaults to show.jobs). */
  jobs?: EventShowJob[];
  /** Proposed slot ids per job id (e.g. while editing). */
  slotPersonIdsByJobId?: Record<string, (string | null)[]>;
};

function personIdsForJob(job: EventShowJob, ctx?: JobAssignmentContext): string[] {
  const override = ctx?.slotPersonIdsByJobId?.[job.id];
  if (override) return override.filter((id): id is string => Boolean(id));
  return jobSlotPersonIds(job).filter((id): id is string => Boolean(id));
}

export function jobTimeRangeMs(job: EventShowJob, show: EventShow): { startMs: number; endMs: number } | null {
  const fallback = show.showDate.slice(0, 10);
  const day = calendarDateKeyFromJobDate(job.jobDate ?? "", fallback);
  const time = normalizeTimeHHMM(job.startTime || "00:00");
  if (!time) return null;
  const startIso = localWallClockToUtcIso(day, time);
  if (!startIso) return null;
  const startMs = new Date(startIso).getTime();
  const duration = job.durationMinutes ?? 0;
  return { startMs, endMs: startMs + duration * 60_000 };
}

function buildIntervals(show: EventShow, ctx?: JobAssignmentContext): JobInterval[] {
  const jobs = ctx?.jobs ?? show.jobs ?? [];
  const out: JobInterval[] = [];
  for (const job of jobs) {
    const range = jobTimeRangeMs(job, show);
    if (!range) continue;
    const personIds = personIdsForJob(job, ctx);
    out.push({
      jobId: job.id,
      startMs: range.startMs,
      endMs: range.endMs,
      personIds,
    });
  }
  return out;
}

function intervalsOverlap(a: JobInterval, b: JobInterval): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

/** People assigned to other jobs on this show that overlap the given job's window. */
export function overlappingPersonIdsForJob(
  show: EventShow,
  jobId: string,
  ctx?: JobAssignmentContext
): Set<string> {
  const intervals = buildIntervals(show, ctx);
  const target = intervals.find((iv) => iv.jobId === jobId);
  if (!target) return new Set();
  const out = new Set<string>();
  for (const iv of intervals) {
    if (iv.jobId === jobId) continue;
    if (!intervalsOverlap(target, iv)) continue;
    for (const pid of iv.personIds) out.add(pid);
  }
  return out;
}

export function wouldPersonOverlapOnJob(
  show: EventShow,
  jobId: string,
  personId: string,
  ctx?: JobAssignmentContext
): boolean {
  return overlappingPersonIdsForJob(show, jobId, ctx).has(personId);
}
