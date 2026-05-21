import { prisma } from "../prisma";
import { wallClockInstantFromDateIsoAndHHMM } from "../clientWallClock";

const toDateTimeFromDateAndTime = wallClockInstantFromDateIsoAndHHMM;

export const MAX_JOB_PEOPLE_NEEDED = 50;

export function normalizePeopleNeeded(value: unknown, fallback = 1): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_JOB_PEOPLE_NEEDED, Math.max(1, Math.round(n)));
}

export async function validateOrgPeople(organizationId: string, personIds: string[]): Promise<boolean> {
  const unique = [...new Set(personIds.filter(Boolean))];
  if (unique.length === 0) return true;
  const count = await prisma.person.count({
    where: { organizationId, id: { in: unique } },
  });
  return count === unique.length;
}

/** Keep legacy personId in sync with first filled slot. */
export async function syncJobPrimaryPersonId(jobId: string): Promise<void> {
  const first = await prisma.eventShowJobPerson.findFirst({
    where: { jobId },
    orderBy: { slotIndex: "asc" },
    select: { personId: true },
  });
  await prisma.eventShowJob.update({
    where: { id: jobId },
    data: { personId: first?.personId ?? null },
  });
}

export async function setJobPeopleNeeded(jobId: string, peopleNeeded: number): Promise<void> {
  const n = normalizePeopleNeeded(peopleNeeded);
  await prisma.eventShowJob.update({
    where: { id: jobId },
    data: { peopleNeeded: n },
  });
  await prisma.eventShowJobPerson.deleteMany({
    where: { jobId, slotIndex: { gte: n } },
  });
  await syncJobPrimaryPersonId(jobId);
}

/** Replace all slot assignments; length must match job.peopleNeeded. */
export async function setJobSlotPersonIds(
  jobId: string,
  slotPersonIds: (string | null)[],
  organizationId: string
): Promise<void> {
  const job = await prisma.eventShowJob.findUnique({
    where: { id: jobId },
    select: { peopleNeeded: true },
  });
  if (!job) throw new Error("Job not found");
  const needed = job.peopleNeeded;
  if (slotPersonIds.length !== needed) {
    throw new Error("slotPersonIds length must match peopleNeeded");
  }
  const filled = slotPersonIds.filter((id): id is string => Boolean(id));
  const unique = new Set(filled);
  if (unique.size !== filled.length) throw new Error("duplicate person in slots");
  const ok = await validateOrgPeople(organizationId, filled);
  if (!ok) throw new Error("Person not found");

  await prisma.eventShowJobPerson.deleteMany({ where: { jobId } });
  const rows = slotPersonIds
    .map((personId, slotIndex) => (personId ? { jobId, personId, slotIndex } : null))
    .filter((row): row is { jobId: string; personId: string; slotIndex: number } => row !== null);
  if (rows.length > 0) {
    await prisma.eventShowJobPerson.createMany({ data: rows });
  }
  await syncJobPrimaryPersonId(jobId);
}

/** Legacy: assign people to slots 0..n-1 in order. */
export async function setJobAssignees(
  jobId: string,
  personIds: string[],
  organizationId: string
): Promise<void> {
  const job = await prisma.eventShowJob.findUnique({
    where: { id: jobId },
    select: { peopleNeeded: true },
  });
  if (!job) throw new Error("Job not found");
  const needed = normalizePeopleNeeded(Math.max(job.peopleNeeded, personIds.length || 1));
  if (needed !== job.peopleNeeded) {
    await setJobPeopleNeeded(jobId, needed);
  }
  const slots: (string | null)[] = Array(needed).fill(null);
  personIds.forEach((id, i) => {
    if (i < slots.length) slots[i] = id;
  });
  await setJobSlotPersonIds(jobId, slots, organizationId);
}

export async function addJobAssignee(
  jobId: string,
  personId: string,
  organizationId: string
): Promise<void> {
  const job = await prisma.eventShowJob.findUnique({
    where: { id: jobId },
    include: { assignments: { orderBy: { slotIndex: "asc" } } },
  });
  if (!job) throw new Error("Job not found");
  const slots: (string | null)[] = Array(job.peopleNeeded).fill(null);
  for (const a of job.assignments) {
    if (a.slotIndex < slots.length) slots[a.slotIndex] = a.personId;
  }
  const firstEmpty = slots.findIndex((id) => !id);
  if (firstEmpty < 0) throw new Error("All slots are filled");
  slots[firstEmpty] = personId;
  await setJobSlotPersonIds(jobId, slots, organizationId);
}

export async function removeJobAssignee(
  jobId: string,
  personId: string,
  organizationId: string
): Promise<void> {
  const job = await prisma.eventShowJob.findUnique({
    where: { id: jobId },
    include: { assignments: { orderBy: { slotIndex: "asc" } } },
  });
  if (!job) throw new Error("Job not found");
  const slots: (string | null)[] = Array(job.peopleNeeded).fill(null);
  for (const a of job.assignments) {
    if (a.slotIndex < slots.length) slots[a.slotIndex] = a.personId;
  }
  const idx = slots.findIndex((id) => id === personId);
  if (idx >= 0) slots[idx] = null;
  await setJobSlotPersonIds(jobId, slots, organizationId);
}

export async function copyJobAssignees(sourceJobId: string, targetJobId: string): Promise<void> {
  const source = await prisma.eventShowJob.findUnique({
    where: { id: sourceJobId },
    select: { peopleNeeded: true, assignments: { orderBy: { slotIndex: "asc" } } },
  });
  if (!source) return;
  await prisma.eventShowJob.update({
    where: { id: targetJobId },
    data: { peopleNeeded: source.peopleNeeded },
  });
  if (source.assignments.length === 0) {
    await syncJobPrimaryPersonId(targetJobId);
    return;
  }
  await prisma.eventShowJobPerson.deleteMany({ where: { jobId: targetJobId } });
  await prisma.eventShowJobPerson.createMany({
    data: source.assignments.map((a) => ({
      jobId: targetJobId,
      personId: a.personId,
      slotIndex: a.slotIndex,
    })),
  });
  await syncJobPrimaryPersonId(targetJobId);
}

export async function syncJobToSchedule(jobId: string): Promise<void> {
  const job = await prisma.eventShowJob.findUnique({
    where: { id: jobId },
    include: {
      person: { select: { id: true, organizationId: true, name: true } },
      assignments: {
        orderBy: { slotIndex: "asc" },
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
