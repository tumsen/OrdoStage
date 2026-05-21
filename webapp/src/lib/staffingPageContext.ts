import { jobSlotPersonIds } from "@/lib/eventShowStaffing";
import type { EventShow, EventShowJob } from "@/lib/types";

/** Job row from GET /api/staffing (assign in place on Staffing page). */
export type StaffingRequirementRow = {
  id: string;
  title: string;
  eventId: string;
  eventTitle: string;
  showId: string;
  showDate: string;
  showTime: string;
  jobDate: string;
  startTime: string;
  durationMinutes: number;
  venueName: string;
  departmentName: string | null;
  departmentColor: string | null;
  personId: string | null;
  personIds: string[];
  slotPersonIds: (string | null)[];
  peopleNeeded: number;
  hasConflict: boolean;
  startsAt: string;
  endsAt: string;
};

export function staffingRequirementToJob(req: StaffingRequirementRow): EventShowJob {
  return {
    id: req.id,
    showId: req.showId,
    title: req.title,
    jobDate: req.jobDate,
    startTime: req.startTime,
    durationMinutes: req.durationMinutes,
    venueId: "",
    personId: req.personId,
    peopleNeeded: req.peopleNeeded,
    slotPersonIds: req.slotPersonIds,
    sortOrder: 0,
  } as EventShowJob;
}

/** Minimal show shell so overlap checks work across jobs on the same show. */
export function buildStaffingShowContext(
  requirements: StaffingRequirementRow[],
  showId: string
): EventShow {
  const rows = requirements.filter((r) => r.showId === showId);
  const head = rows[0];
  const jobs = rows.map(staffingRequirementToJob);
  return {
    id: showId,
    showDate: (head?.showDate ?? "").slice(0, 10),
    showTime: head?.showTime ?? "00:00",
    durationMinutes: 0,
    jobs,
  } as EventShow;
}

export function slotPersonIdsFromRequirement(req: StaffingRequirementRow): (string | null)[] {
  const job = staffingRequirementToJob(req);
  return jobSlotPersonIds(job);
}
