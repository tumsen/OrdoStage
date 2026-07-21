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
  applyTimeEntryToLeaveLedger,
  ensureOrgLeavePolicy,
  mapOrgLeavePolicy,
  mapPersonLeaveProfile,
  postLeaveTransaction,
  removeTimeEntryFromLeaveLedger,
} from "./leaveLedger";
import { ensureLeaveTimeProject } from "./leaveTimeProjects";

export const TIMESHEET_COMP_SETTLEMENT_SOURCE = "timesheet_settlement";
const APPROVAL_NOTE_PREFIX = "timesheetApprovalId:";
export const SETTLEMENT_ENTRY_NOTE_PREFIX = "timesheetSettlementEntry:";

type DayParts = {
  workMinutes: number;
  vacationMinutes: number;
  extraVacationMinutes: number;
  holidayMinutes: number;
  compTimeMinutes: number;
};

function emptyDayParts(): DayParts {
  return {
    workMinutes: 0,
    vacationMinutes: 0,
    extraVacationMinutes: 0,
    holidayMinutes: 0,
    compTimeMinutes: 0,
  };
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

/**
 * Afspadsering auto-fill per weekday, capped so fulfilling + existing comp + new fill
 * does not exceed the person's weekly contract (e.g. 37h), even when other days are over daily norm.
 */
export function distributeWeeklyCompFillMinutes(input: {
  weekdayStats: Array<{
    fulfillingMinutes: number;
    existingCompMinutes: number;
  }>;
  dailyNormMinutes: number;
  weeklyNormMinutes: number;
}): number[] {
  const { weekdayStats, dailyNormMinutes, weeklyNormMinutes } = input;
  let weekFulfilling = 0;
  let weekComp = 0;
  const rawCaps: number[] = [];
  for (const d of weekdayStats) {
    weekFulfilling += d.fulfillingMinutes;
    weekComp += d.existingCompMinutes;
    rawCaps.push(
      Math.max(0, dailyNormMinutes - d.fulfillingMinutes - d.existingCompMinutes)
    );
  }
  let fillBudget = Math.max(0, weeklyNormMinutes - weekFulfilling - weekComp);
  return rawCaps.map((cap) => {
    const fill = Math.min(cap, fillBudget);
    fillBudget -= fill;
    return fill;
  });
}

/** Cap desired per-day fill so total blocks never exceed available comp-time balance. */
export function capFillMinutesByAvailableBalance(
  desiredFillMinutesPerDay: number[],
  availableMinutes: number
): number[] {
  let budget = Math.max(0, availableMinutes);
  return desiredFillMinutesPerDay.map((want) => {
    const take = Math.min(Math.max(0, want), budget);
    budget -= take;
    return take;
  });
}

async function getCompTimeRemainingMinutes(
  organizationId: string,
  personId: string,
  vacationYearKey: string
): Promise<number> {
  const rows = await prisma.leaveBalance.findMany({
    where: {
      organizationId,
      personId,
      vacationYearKey,
      balanceType: { in: ["comp_time_earned", "comp_time_used"] },
    },
    select: { balanceType: true, amount: true },
  });
  let earned = 0;
  let used = 0;
  for (const r of rows) {
    if (r.balanceType === "comp_time_earned") earned = r.amount;
    if (r.balanceType === "comp_time_used") used = r.amount;
  }
  return Math.round(earned - used);
}

function addCategoryMinutes(parts: DayParts, category: string, minutes: number) {
  if (category === "work") parts.workMinutes += minutes;
  else if (category === "vacation") parts.vacationMinutes += minutes;
  else if (category === "extra_vacation") parts.extraVacationMinutes += minutes;
  else if (category === "holiday") parts.holidayMinutes += minutes;
  else if (category === "comp_time") parts.compTimeMinutes += minutes;
}

function aggregateByLocalDay(
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
  fallbackUserId?: string | null
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

async function deleteSettlementFillEntries(input: {
  organizationId: string;
  personId?: string;
  timesheetApprovalId?: string;
  periodStart?: Date;
  periodEnd?: Date;
}) {
  const whereNote = input.timesheetApprovalId
    ? { startsWith: `${SETTLEMENT_ENTRY_NOTE_PREFIX}${input.timesheetApprovalId}` as const }
    : { startsWith: SETTLEMENT_ENTRY_NOTE_PREFIX };

  const rows = await prisma.timeEntry.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.personId ? { personId: input.personId } : {}),
      ...(input.periodStart && input.periodEnd
        ? { startsAt: { lt: input.periodEnd }, endsAt: { gt: input.periodStart } }
        : {}),
      OR: [
        { note: whereNote },
        { category: { in: ["comp_settlement_earned", "comp_settlement_used"] } },
      ],
    },
    select: { id: true },
  });
  for (const row of rows) {
    await removeTimeEntryFromLeaveLedger(row.id);
  }
  if (rows.length > 0) {
    await prisma.timeEntry.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
  }
}

function fillWindowAfterDayLoad(
  dateKey: string,
  durationMinutes: number,
  zone: string,
  dayEntries: Array<{ endsAt: Date }>
): { startsAt: Date; endsAt: Date } {
  let start = DateTime.fromFormat(dateKey, "yyyy-MM-dd", { zone }).set({
    hour: 8,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
  for (const e of dayEntries) {
    const end = DateTime.fromJSDate(e.endsAt, { zone });
    if (end > start) start = end;
  }
  const ends = start.plus({ minutes: durationMinutes });
  return { startsAt: start.toJSDate(), endsAt: ends.toJSDate() };
}

export type TimesheetCompSettlementDay = {
  date: string;
  fulfillingMinutes: number;
  dailyNormMinutes: number;
  /** Net ledger effect for the day: +overtime earned, −afspadsering fill created. */
  deltaMinutes: number;
  /** Afspadsering minutes auto-created as time entries on under-norm days. */
  fillMinutes: number;
};

export type TimesheetCompSettlementResult = {
  applied: boolean;
  dailyNormMinutes: number;
  weeklyNormMinutes: number;
  totalDeltaMinutes: number;
  /** Minustid: under-norm minutes booked on ledger without afspadsering time entries. */
  deficitLedgerMinutes: number;
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
    weeklyNormMinutes: 0,
    totalDeltaMinutes: 0,
    deficitLedgerMinutes: 0,
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

  // Remove legacy settlement blocks / previous auto-fill for this week before settling.
  await deleteSettlementFillEntries({
    organizationId: input.organizationId,
    personId: input.personId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });

  const person = await prisma.person.findFirst({
    where: { id: input.personId, organizationId: input.organizationId },
    select: { weeklyContractHours: true, vacationDaysPerYear: true, leaveProfile: true },
  });
  if (!person) return empty;

  const policy = mapOrgLeavePolicy(policyRow);
  const norms = resolveLeaveNorms(policy, mapPersonLeaveProfile(person.leaveProfile), person);
  const dailyNormMinutes = Math.round(hoursPerWorkDayFromWeekly(norms.weeklyContractHours) * 60);
  const weeklyNormMinutes = Math.round(norms.weeklyContractHours * 60);

  const entries = await prisma.timeEntry.findMany({
    where: {
      organizationId: input.organizationId,
      personId: input.personId,
      startsAt: { lt: input.periodEnd },
      endsAt: { gt: input.periodStart },
    },
    select: { startsAt: true, endsAt: true, category: true },
  });

  const byDay = aggregateByLocalDay(entries, input.periodStart, input.periodEnd, zone);
  const weekdayKeys = weekdayDateKeysInPeriod(input.periodStart, input.periodEnd, zone);

  const userId = await resolveUserIdForPerson(
    input.organizationId,
    input.personId,
    input.createdByUserId
  );
  if (!userId) return empty;

  const compProjectId = await ensureLeaveTimeProject(input.organizationId, "comp_time");

  const weekdayStats = weekdayKeys.map((dateKey) => {
    const parts = byDay.get(dateKey) ?? emptyDayParts();
    return {
      dateKey,
      fulfillingMinutes: Math.round(normFulfillingMinutes(parts)),
      existingCompMinutes: Math.round(parts.compTimeMinutes),
    };
  });

  const fillByDayIndex = distributeWeeklyCompFillMinutes({
    weekdayStats: weekdayStats.map((d) => ({
      fulfillingMinutes: d.fulfillingMinutes,
      existingCompMinutes: d.existingCompMinutes,
    })),
    dailyNormMinutes,
    weeklyNormMinutes,
  });

  const vacationYearForWeek = resolveVacationYear(input.periodStart, policy);

  // Credit overtime first so same-week earnings count toward available afspadsering.
  for (let i = 0; i < weekdayStats.length; i++) {
    const { dateKey, fulfillingMinutes } = weekdayStats[i]!;
    const overtimeMinutes = Math.max(0, fulfillingMinutes - dailyNormMinutes);
    if (overtimeMinutes <= 0) continue;
    const dayInstant = DateTime.fromFormat(dateKey, "yyyy-MM-dd", { zone }).startOf("day");
    const vacationYear = resolveVacationYear(dayInstant.toJSDate(), policy);
    await postLeaveTransaction({
      organizationId: input.organizationId,
      personId: input.personId,
      vacationYearKey: vacationYear.key,
      balanceType: "comp_time_earned",
      amount: overtimeMinutes,
      source: TIMESHEET_COMP_SETTLEMENT_SOURCE,
      periodStart: dayInstant.toJSDate(),
      periodEnd: dayInstant.plus({ days: 1 }).toJSDate(),
      effectiveDate: dateKey,
      note: `${APPROVAL_NOTE_PREFIX}${input.timesheetApprovalId} date:${dateKey} fulfilling:${fulfillingMinutes} norm:${dailyNormMinutes}`,
      createdByUserId: input.createdByUserId,
    });
  }

  const compRemaining = await getCompTimeRemainingMinutes(
    input.organizationId,
    input.personId,
    vacationYearForWeek.key
  );
  const blockFillByDayIndex = capFillMinutesByAvailableBalance(fillByDayIndex, compRemaining);
  const totalDesiredFill = fillByDayIndex.reduce((s, m) => s + m, 0);
  const totalBlockFill = blockFillByDayIndex.reduce((s, m) => s + m, 0);
  const deficitLedgerMinutes = Math.max(0, totalDesiredFill - totalBlockFill);

  const days: TimesheetCompSettlementDay[] = [];
  let totalDeltaMinutes = 0;

  for (let i = 0; i < weekdayStats.length; i++) {
    const { dateKey, fulfillingMinutes } = weekdayStats[i]!;
    const desiredFill = fillByDayIndex[i] ?? 0;
    const fillMinutes = blockFillByDayIndex[i] ?? 0;
    const overtimeMinutes = Math.max(0, fulfillingMinutes - dailyNormMinutes);
    if (overtimeMinutes === 0 && fillMinutes === 0 && desiredFill === 0) continue;

    let dayDelta = overtimeMinutes > 0 ? overtimeMinutes : 0;

    if (fillMinutes > 0) {
      const dayEntries = entries.filter((e) => {
        const key = DateTime.fromJSDate(e.startsAt, { zone }).toFormat("yyyy-MM-dd");
        return key === dateKey;
      });
      const { startsAt, endsAt } = fillWindowAfterDayLoad(dateKey, fillMinutes, zone, dayEntries);
      const created = await prisma.timeEntry.create({
        data: {
          organizationId: input.organizationId,
          userId,
          personId: input.personId,
          startsAt,
          endsAt,
          kind: "custom",
          category: "comp_time",
          timeProjectId: compProjectId,
          isLocked: true,
          note: `${SETTLEMENT_ENTRY_NOTE_PREFIX}${input.timesheetApprovalId}:${dateKey}`,
        },
      });
      await applyTimeEntryToLeaveLedger(created, { createdByUserId: input.createdByUserId });
      dayDelta -= fillMinutes;
    }

    days.push({
      date: dateKey,
      fulfillingMinutes,
      dailyNormMinutes,
      deltaMinutes: dayDelta,
      fillMinutes,
    });
    totalDeltaMinutes += dayDelta;
  }

  if (deficitLedgerMinutes > 0) {
    await postLeaveTransaction({
      organizationId: input.organizationId,
      personId: input.personId,
      vacationYearKey: vacationYearForWeek.key,
      balanceType: "comp_time_used",
      amount: deficitLedgerMinutes,
      source: TIMESHEET_COMP_SETTLEMENT_SOURCE,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      note: `${APPROVAL_NOTE_PREFIX}${input.timesheetApprovalId} undernorm_deficit:${deficitLedgerMinutes}`,
      createdByUserId: input.createdByUserId,
    });
    totalDeltaMinutes -= deficitLedgerMinutes;
  }

  return {
    applied: totalDeltaMinutes !== 0 || days.length > 0 || deficitLedgerMinutes > 0,
    dailyNormMinutes,
    weeklyNormMinutes,
    totalDeltaMinutes,
    deficitLedgerMinutes,
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

  for (const txn of txns) {
    await postLeaveTransaction({
      organizationId: txn.organizationId,
      personId: txn.personId,
      vacationYearKey: txn.vacationYearKey,
      balanceType: txn.balanceType as "comp_time_earned" | "comp_time_used",
      amount: -txn.amount,
      source: "reversal",
      periodStart: txn.periodStart,
      periodEnd: txn.periodEnd,
      note: `Reopen timesheet ${input.timesheetApprovalId}`,
      createdByUserId: input.createdByUserId,
    });
    await prisma.leaveTransaction.delete({ where: { id: txn.id } });
  }

  await deleteSettlementFillEntries({
    organizationId: input.organizationId,
    timesheetApprovalId: input.timesheetApprovalId,
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
