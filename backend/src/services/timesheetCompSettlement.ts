import { DateTime } from "luxon";
import { prisma } from "../prisma";
import { getClientWallClockZone } from "../clientWallClock";
import { isCountryFeatureEnabled } from "../countryFeatures";
import {
  hoursPerWorkDayFromWeekly,
  resolveLeaveNorms,
  resolveVacationYear,
} from "../rules/leave/danishLeave";
import {
  ensureOrgLeavePolicy,
  mapOrgLeavePolicy,
  mapPersonLeaveProfile,
  postLeaveTransaction,
} from "./leaveLedger";

export const TIMESHEET_COMP_SETTLEMENT_SOURCE = "timesheet_settlement";
const APPROVAL_NOTE_PREFIX = "timesheetApprovalId:";
export const SETTLEMENT_ENTRY_NOTE_PREFIX = "timesheetSettlementEntry:";

type DayParts = {
  workMinutes: number;
  vacationMinutes: number;
  extraVacationMinutes: number;
  holidayMinutes: number;
};

function emptyDayParts(): DayParts {
  return { workMinutes: 0, vacationMinutes: 0, extraVacationMinutes: 0, holidayMinutes: 0 };
}

/** Minutes that count toward the daily norm (not afspadsering, sick, or travel). */
export function normFulfillingMinutes(parts: DayParts): number {
  return (
    parts.workMinutes +
    parts.vacationMinutes +
    parts.extraVacationMinutes +
    parts.holidayMinutes
  );
}

function addCategoryMinutes(parts: DayParts, category: string, minutes: number) {
  if (category === "work") parts.workMinutes += minutes;
  else if (category === "vacation") parts.vacationMinutes += minutes;
  else if (category === "extra_vacation") parts.extraVacationMinutes += minutes;
  else if (category === "holiday") parts.holidayMinutes += minutes;
}

function aggregateNormFulfillingByLocalDay(
  entries: Array<{ startsAt: Date; endsAt: Date; category: string }>,
  periodStart: Date,
  periodEnd: Date,
  zone: string
): Map<string, DayParts> {
  const map = new Map<string, DayParts>();
  const startMs = periodStart.getTime();
  const endMs = periodEnd.getTime();
  for (const row of entries) {
    const clippedStart = Math.max(row.startsAt.getTime(), startMs);
    const clippedEnd = Math.min(row.endsAt.getTime(), endMs);
    const durMin = Math.max(0, (clippedEnd - clippedStart) / 60_000);
    if (durMin <= 0) continue;
    const cat = row.category || "work";
    if (cat === "comp_settlement_earned" || cat === "comp_settlement_used") continue;
    const dateKey = DateTime.fromMillis(clippedStart, { zone }).toFormat("yyyy-MM-dd");
    if (!map.has(dateKey)) map.set(dateKey, emptyDayParts());
    addCategoryMinutes(map.get(dateKey)!, cat, durMin);
  }
  return map;
}

/** Mon–Fri calendar dates in `[periodStart, periodEnd)` in the client zone. */
function weekdayDateKeysInPeriod(periodStart: Date, periodEnd: Date, zone: string): string[] {
  const keys: string[] = [];
  let cursor = DateTime.fromJSDate(periodStart, { zone }).startOf("day");
  const end = DateTime.fromJSDate(periodEnd, { zone }).startOf("day");
  while (cursor < end) {
    if (cursor.weekday >= 1 && cursor.weekday <= 5) {
      keys.push(cursor.toFormat("yyyy-MM-dd"));
    }
    cursor = cursor.plus({ days: 1 });
  }
  return keys;
}

async function resolveUserIdForPerson(
  organizationId: string,
  personId: string,
  fallbackUserId?: string | null,
): Promise<string | null> {
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId },
    select: { email: true },
  });
  const email = person?.email?.trim();
  if (email) {
    const membership = await prisma.organizationMembership.findFirst({
      where: {
        organizationId,
        user: { email: { equals: email, mode: "insensitive" } },
      },
      select: { userId: true },
    });
    if (membership) return membership.userId;
  }
  return fallbackUserId ?? null;
}

function settlementCalendarEntryWindow(
  dateKey: string,
  fulfillingMinutes: number,
  deltaMinutes: number,
  zone: string,
): { startsAt: Date; endsAt: Date; category: "comp_settlement_earned" | "comp_settlement_used" } {
  const duration = Math.abs(deltaMinutes);
  const dayStart = DateTime.fromFormat(dateKey, "yyyy-MM-dd", { zone }).set({
    hour: 8,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  const start = dayStart.plus({ minutes: Math.max(0, fulfillingMinutes) });
  const end = start.plus({ minutes: duration });
  return {
    startsAt: start.toJSDate(),
    endsAt: end.toJSDate(),
    category: deltaMinutes > 0 ? "comp_settlement_earned" : "comp_settlement_used",
  };
}

async function createSettlementCalendarEntry(input: {
  organizationId: string;
  personId: string;
  userId: string;
  timesheetApprovalId: string;
  dateKey: string;
  fulfillingMinutes: number;
  deltaMinutes: number;
  zone: string;
}) {
  const { startsAt, endsAt, category } = settlementCalendarEntryWindow(
    input.dateKey,
    input.fulfillingMinutes,
    input.deltaMinutes,
    input.zone
  );
  await prisma.timeEntry.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      personId: input.personId,
      startsAt,
      endsAt,
      kind: "custom",
      category,
      isLocked: true,
      note: `${SETTLEMENT_ENTRY_NOTE_PREFIX}${input.timesheetApprovalId}:${input.dateKey}`,
    },
  });
}

export type TimesheetCompSettlementDay = {
  date: string;
  fulfillingMinutes: number;
  dailyNormMinutes: number;
  deltaMinutes: number;
};

export type TimesheetCompSettlementResult = {
  applied: boolean;
  dailyNormMinutes: number;
  totalDeltaMinutes: number;
  days: TimesheetCompSettlementDay[];
};

export async function settleCompTimeForTimesheetApproval(input: {
  organizationId: string;
  personId: string;
  periodStart: Date;
  periodEnd: Date;
  timesheetApprovalId: string;
  createdByUserId?: string | null;
  zone?: string;
}): Promise<TimesheetCompSettlementResult> {
  const zone = input.zone ?? getClientWallClockZone();
  const empty: TimesheetCompSettlementResult = {
    applied: false,
    dailyNormMinutes: 0,
    totalDeltaMinutes: 0,
    days: [],
  };

  const org = await prisma.organization.findUnique({
    where: { id: input.organizationId },
    select: { countryFeatures: true },
  });
  if (!org || !(await isCountryFeatureEnabled(org.countryFeatures, "DK", "leaveManagement"))) {
    return empty;
  }

  const policyRow = await ensureOrgLeavePolicy(input.organizationId);
  if (!policyRow.compTimeFromOvertimeEnabled) return empty;

  const existing = await prisma.leaveTransaction.findFirst({
    where: {
      organizationId: input.organizationId,
      personId: input.personId,
      source: TIMESHEET_COMP_SETTLEMENT_SOURCE,
      note: { startsWith: `${APPROVAL_NOTE_PREFIX}${input.timesheetApprovalId}` },
    },
  });
  if (existing) {
    return empty;
  }

  const person = await prisma.person.findFirst({
    where: { id: input.personId, organizationId: input.organizationId },
    select: { weeklyContractHours: true, vacationDaysPerYear: true, leaveProfile: true },
  });
  if (!person) return empty;

  const policy = mapOrgLeavePolicy(policyRow);
  const norms = resolveLeaveNorms(policy, mapPersonLeaveProfile(person.leaveProfile), person);
  const dailyNormMinutes = Math.round(hoursPerWorkDayFromWeekly(norms.weeklyContractHours) * 60);

  const entries = await prisma.timeEntry.findMany({
    where: {
      organizationId: input.organizationId,
      personId: input.personId,
      startsAt: { lt: input.periodEnd },
      endsAt: { gt: input.periodStart },
    },
    select: { startsAt: true, endsAt: true, category: true },
  });

  const byDay = aggregateNormFulfillingByLocalDay(
    entries,
    input.periodStart,
    input.periodEnd,
    zone
  );
  const weekdayKeys = weekdayDateKeysInPeriod(input.periodStart, input.periodEnd, zone);

  const userId = await resolveUserIdForPerson(
    input.organizationId,
    input.personId,
    input.createdByUserId
  );
  if (!userId) return empty;

  const days: TimesheetCompSettlementDay[] = [];
  let totalDeltaMinutes = 0;

  for (const dateKey of weekdayKeys) {
    const parts = byDay.get(dateKey) ?? emptyDayParts();
    const fulfillingMinutes = Math.round(normFulfillingMinutes(parts));
    const deltaMinutes = fulfillingMinutes - dailyNormMinutes;
    if (deltaMinutes === 0) continue;

    const dayInstant = DateTime.fromFormat(dateKey, "yyyy-MM-dd", { zone }).startOf("day");
    const vacationYear = resolveVacationYear(dayInstant.toJSDate(), policy);

    await postLeaveTransaction({
      organizationId: input.organizationId,
      personId: input.personId,
      vacationYearKey: vacationYear.key,
      balanceType: "comp_time_earned",
      amount: deltaMinutes,
      source: TIMESHEET_COMP_SETTLEMENT_SOURCE,
      periodStart: dayInstant.toJSDate(),
      periodEnd: dayInstant.plus({ days: 1 }).toJSDate(),
      effectiveDate: dateKey,
      note: `${APPROVAL_NOTE_PREFIX}${input.timesheetApprovalId} date:${dateKey} fulfilling:${fulfillingMinutes} norm:${dailyNormMinutes}`,
      createdByUserId: input.createdByUserId,
    });

    await createSettlementCalendarEntry({
      organizationId: input.organizationId,
      personId: input.personId,
      userId,
      timesheetApprovalId: input.timesheetApprovalId,
      dateKey,
      fulfillingMinutes,
      deltaMinutes,
      zone,
    });

    days.push({
      date: dateKey,
      fulfillingMinutes,
      dailyNormMinutes,
      deltaMinutes,
    });
    totalDeltaMinutes += deltaMinutes;
  }

  return {
    applied: totalDeltaMinutes !== 0,
    dailyNormMinutes,
    totalDeltaMinutes,
    days,
  };
}

/** Undo daily settlement so the week can be edited and approved again. */
export async function reverseCompTimeForTimesheetReopen(input: {
  organizationId: string;
  timesheetApprovalId: string;
  createdByUserId?: string | null;
}): Promise<number> {
  const txns = await prisma.leaveTransaction.findMany({
    where: {
      organizationId: input.organizationId,
      source: TIMESHEET_COMP_SETTLEMENT_SOURCE,
      note: { startsWith: `${APPROVAL_NOTE_PREFIX}${input.timesheetApprovalId}` },
    },
  });
  if (txns.length === 0) {
    await prisma.timeEntry.deleteMany({
      where: {
        organizationId: input.organizationId,
        note: { startsWith: `${SETTLEMENT_ENTRY_NOTE_PREFIX}${input.timesheetApprovalId}:` },
      },
    });
    return 0;
  }

  for (const txn of txns) {
    await postLeaveTransaction({
      organizationId: txn.organizationId,
      personId: txn.personId,
      vacationYearKey: txn.vacationYearKey,
      balanceType: txn.balanceType as "comp_time_earned",
      amount: -txn.amount,
      source: "reversal",
      periodStart: txn.periodStart,
      periodEnd: txn.periodEnd,
      note: `Reopen timesheet ${input.timesheetApprovalId}`,
      createdByUserId: input.createdByUserId,
    });
    await prisma.leaveTransaction.delete({ where: { id: txn.id } });
  }

  await prisma.timeEntry.deleteMany({
    where: {
      organizationId: input.organizationId,
      note: { startsWith: `${SETTLEMENT_ENTRY_NOTE_PREFIX}${input.timesheetApprovalId}:` },
    },
  });

  return txns.length;
}

export async function hasTimesheetCompSettlementInRange(
  organizationId: string,
  personId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<boolean> {
  const hit = await prisma.leaveTransaction.findFirst({
    where: {
      organizationId,
      personId,
      source: TIMESHEET_COMP_SETTLEMENT_SOURCE,
      periodStart: { lt: rangeEnd },
      periodEnd: { gt: rangeStart },
    },
    select: { id: true },
  });
  return Boolean(hit);
}
