import { prisma } from "../prisma";
import { isJobFullyAssigned } from "./eventShowJobConflicts";

/** Derive per-department staffing OK from job fill state and persist on the show. */
export async function syncShowStaffingOkFromJobs(showId: string): Promise<void> {
  const show = await prisma.eventShow.findUnique({
    where: { id: showId },
    select: {
      event: {
        select: {
          teams: { select: { teamId: true } },
        },
      },
      jobs: {
        select: {
          departmentId: true,
          peopleNeeded: true,
          assignments: { select: { slotIndex: true, personId: true } },
        },
      },
    },
  });
  if (!show) return;

  const map: Record<string, boolean> = {};
  for (const { teamId } of show.event.teams) {
    const deptJobs = show.jobs.filter((j) => j.departmentId === teamId);
    map[teamId] =
      deptJobs.length === 0 || deptJobs.every((j) => isJobFullyAssigned(j));
  }

  await prisma.eventShow.update({
    where: { id: showId },
    data: { staffingOkByDepartment: map },
  });
}
