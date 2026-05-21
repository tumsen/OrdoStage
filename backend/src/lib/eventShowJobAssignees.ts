import { prisma } from "../prisma";
import { wallClockInstantFromDateIsoAndHHMM } from "../clientWallClock";

const toDateTimeFromDateAndTime = wallClockInstantFromDateIsoAndHHMM;

export async function validateOrgPeople(organizationId: string, personIds: string[]): Promise<boolean> {
  const unique = [...new Set(personIds.filter(Boolean))];
  if (unique.length === 0) return true;
  const count = await prisma.person.count({
    where: { organizationId, id: { in: unique } },
  });
  return count === unique.length;
}

/** Keep legacy personId in sync with first assignee (for older readers). */
export async function syncJobPrimaryPersonId(jobId: string): Promise<void> {
  const first = await prisma.eventShowJobPerson.findFirst({
    where: { jobId },
    orderBy: { createdAt: "asc" },
    select: { personId: true },
  });
  await prisma.eventShowJob.update({
    where: { id: jobId },
    data: { personId: first?.personId ?? null },
  });
}

export async function addJobAssignee(
  jobId: string,
  personId: string,
  organizationId: string
): Promise<void> {
  const ok = await validateOrgPeople(organizationId, [personId]);
  if (!ok) throw new Error("Person not found");
  await prisma.eventShowJobPerson.upsert({
    where: { jobId_personId: { jobId, personId } },
    update: {},
    create: { jobId, personId },
  });
  await syncJobPrimaryPersonId(jobId);
}

export async function removeJobAssignee(jobId: string, personId: string): Promise<void> {
  await prisma.eventShowJobPerson.deleteMany({ where: { jobId, personId } });
  await syncJobPrimaryPersonId(jobId);
}

export async function setJobAssignees(
  jobId: string,
  personIds: string[],
  organizationId: string
): Promise<void> {
  const unique = [...new Set(personIds.filter(Boolean))];
  const ok = await validateOrgPeople(organizationId, unique);
  if (!ok) throw new Error("Person not found");
  await prisma.eventShowJobPerson.deleteMany({ where: { jobId } });
  if (unique.length > 0) {
    await prisma.eventShowJobPerson.createMany({
      data: unique.map((personId) => ({ jobId, personId })),
    });
  }
  await syncJobPrimaryPersonId(jobId);
}

export async function copyJobAssignees(sourceJobId: string, targetJobId: string): Promise<void> {
  const rows = await prisma.eventShowJobPerson.findMany({
    where: { jobId: sourceJobId },
    select: { personId: true },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) return;
  await prisma.eventShowJobPerson.createMany({
    data: rows.map((r) => ({ jobId: targetJobId, personId: r.personId })),
    skipDuplicates: true,
  });
  await syncJobPrimaryPersonId(targetJobId);
}

export async function syncJobToSchedule(jobId: string): Promise<void> {
  const job = await prisma.eventShowJob.findUnique({
    where: { id: jobId },
    include: {
      person: { select: { id: true, organizationId: true, name: true } },
      assignments: {
        orderBy: { createdAt: "asc" },
        include: { person: { select: { id: true, organizationId: true, name: true } } },
      },
      show: { include: { event: true } },
    },
  });
  if (!job) return;

  const assignees = job.assignments.map((a) => a.person);
  const marker = `[event-show-job:${job.id}]`;
  const existing = await prisma.internalBooking.findFirst({
    where: {
      organizationId: job.show.event.organizationId,
      title: { startsWith: marker },
    },
    select: { id: true },
  });

  if (assignees.length === 0) {
    if (existing?.id) {
      await prisma.internalBooking.delete({ where: { id: existing.id } });
    }
    return;
  }

  const startDate = toDateTimeFromDateAndTime(job.jobDate.toISOString(), job.startTime);
  if (!startDate) return;
  const endDate = new Date(startDate.getTime() + job.durationMinutes * 60 * 1000);
  const names = assignees.map((p) => p.name).join(", ");
  const title = `${marker} ${job.show.event.title} - ${job.title} - ${names}`;
  const orgId = assignees[0]!.organizationId;

  const bookingId =
    existing?.id ??
    (
      await prisma.internalBooking.create({
        data: {
          organizationId: orgId,
          title,
          description: null,
          startDate,
          endDate,
          type: "other",
          venueId: job.venueId || null,
        },
        select: { id: true },
      })
    ).id;

  await prisma.internalBooking.update({
    where: { id: bookingId },
    data: {
      title,
      description: null,
      startDate,
      endDate,
      venueId: job.venueId || null,
    },
  });
  await prisma.internalBookingPerson.deleteMany({ where: { bookingId } });
  if (assignees.length > 0) {
    await prisma.internalBookingPerson.createMany({
      data: assignees.map((p) => ({ bookingId, personId: p.id, role: null })),
    });
  }
}
