import { DateTime } from "luxon";
import { prisma } from "../prisma";
import { getClientWallClockZone } from "../clientWallClock";
import { isCountryFeatureEnabled } from "../countryFeatures";
import {
  employmentStartYmd,
  hoursPerWorkDayFromWeekly,
  resolveLeaveNorms,
  resolveVacationYear,
} from "../rules/leave/danishLeave";
import {
  ensureOrgLeavePolicy,
  mapOrgLeavePolicy,
  mapPersonLeaveProfile,
  postLeaveTransaction,
  removeTimeEntryFromLeaveLedger,
} from "./leaveLedger";

export const TIMESHEET_COMP_SETTLEMENT_SOURCE = "timesheet_settlement";
const APPROVAL_NOTE_PREFIX = "timesheetApprovalId:";
/** Legacy note prefix for auto-created afspadsering fill entries (cleaned on settle/reopen). */
export const SETTLEMENT_ENTRY_NOTE_PREFIX = "timesheetSettlementEntry:";

type DayParts = {
  workMinutes: number;
  vacationMinutes: number;
  extraVacationMinutes: number;
  holidayMinutes: number;
};

function emptyDayParts(): DayParts {
  return {
    workMinutes: 0,
    vacationMinutes: 0,
    extraVacationMinutes: 0,
    holidayMinutes: 0,
  };
}

/** Minutes that count toward the daily/weekly norm (not N/A, sick, travel, or settlement markers). */
export function normFulfillingMinutes(parts: DayParts): number {
  return (
    parts.workMinutes +
    parts.vacationMinutes +
    parts.extraVacationMinutes +
    parts.holidayMinutes
  );
}

/**
 * Under-norm minutes per weekday, capped so fulfilling + new under-norm use
 * does not exceed the person's weekly contract (e.g. 37h).
 * Visual N/A (`comp_time`) blocks are ignored — they do not fill the week.
 */
export function distributeWeeklyCompFillMinutes(input: {
  weekdayStats: Array<{
    fulfillingMinutes: number;
    /** @deprecated Ignored — visual blocks do not affect settlement. */
    existingCompMinutes?: number;
  }>;
  dailyNormMinutes: number;
  weeklyNormMinutes: number;
}): number[] {
  const { weekdayStats, dailyNormMinutes, weeklyNormMinutes } = input;
  let weekFulfilling = 0;
  const rawCaps: number[] = [];
  for (const d of weekdayStats) {
    weekFulfilling += d.fulfillingMinutes;
    rawCaps.push(Math.max(0, dailyNormMinutes - d.fulfillingMinutes));
  }
  let fillBudget = Math.max(0, weeklyNormMinutes - weekFulfilling);
  return rawCaps.map((cap) => {
    const fill = Math.min(cap, fillBudget);
    fillBudget -= fill;
    return fill;
  });
}

/** @deprecated Visual blocks no longer consume balance; kept for callers/tests. */
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

function addCategoryMinutes(parts: DayParts, category: string, minutes: number) {
  if (category === "work") parts.workMinutes += minutes;
  else if (category === "vacation") parts.vacationMinutes += minutes;
  else if (category === "extra_vacation") parts.extraVacationMinutes += minutes;
  else if (category === "holiday") parts.holidayMinutes += minutes;
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
    if (
      cat === "comp_time" ||
      cat === "comp_settlement_earned" ||
      cat === "comp_settlement_used" ||
      cat === "sick" ||
      cat === "travel_allowance"
    ) {
      continue;
    }
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

/** Remove legacy auto-fill afspadsering time entries created by older settlement. */
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

export type TimesheetCompSettlementDay = {
  date: string;
  fulfillingMinutes: number;
  dailyNormMinutes: number;
  /** Net ledger effect for the day: +overtime earned, −under-norm use. */
  deltaMinutes: number;
  /** Always 0 — settlement no longer creates calendar fill blocks. */
  fillMinutes: number;
};

export type TimesheetCompSettlementResult = {
  applied: boolean;
  dailyNormMinutes: number;
  weeklyNormMinutes: number;
  totalDeltaMinutes: number;
  /** Under-norm minutes booked on the leave ledger (no calendar blocks). */
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

  // Clean legacy auto-fill blocks from older settlement versions.
  await deleteSettlementFillEntries({
    organizationId: input.organizationId,
    personId: input.personId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });

  // Drop legacy time_entry ledger posts for visual N/A blocks in this week so
  // under-norm settlement owns the saldo (no double debit).
  {
    const visualBlocks = await prisma.timeEntry.findMany({
      where: {
        organizationId: input.organizationId,
        personId: input.personId,
        category: "comp_time",
        startsAt: { lt: input.periodEnd },
        endsAt: { gt: input.periodStart },
      },
      select: { id: true },
    });
    for (const row of visualBlocks) {
      await removeTimeEntryFromLeaveLedger(row.id);
    }
  }

  const person = await prisma.person.findFirst({
    where: { id: input.personId, organizationId: input.organizationId },
    select: {
      weeklyContractHours: true,
      vacationDaysPerYear: true,
      employmentStartDate: true,
      leaveProfile: true,
    },
  });
  if (!person) return empty;

  const policy = mapOrgLeavePolicy(policyRow);
  const norms = resolveLeaveNorms(policy, mapPersonLeaveProfile(person.leaveProfile), person);
  const dailyNormMinutes = Math.round(hoursPerWorkDayFromWeekly(norms.weeklyContractHours) * 60);
  const hireYmd = employmentStartYmd(person.employmentStartDate);

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
  const weekdayKeys = weekdayDateKeysInPeriod(input.periodStart, input.periodEnd, zone).filter(
    (dateKey) => !hireYmd || dateKey >= hireYmd
  );
  // Mid-week hire → only remaining weekdays count toward the weekly norm.
  const weeklyNormMinutes = dailyNormMinutes * weekdayKeys.length;

  const userId = await resolveUserIdForPerson(
    input.organizationId,
    input.personId,
    input.createdByUserId
  );
  if (!userId) return empty;

  const weekdayStats = weekdayKeys.map((dateKey) => {
    const parts = byDay.get(dateKey) ?? emptyDayParts();
    return {
      dateKey,
      fulfillingMinutes: Math.round(normFulfillingMinutes(parts)),
    };
  });

  const underNormByDayIndex = distributeWeeklyCompFillMinutes({
    weekdayStats: weekdayStats.map((d) => ({
      fulfillingMinutes: d.fulfillingMinutes,
    })),
    dailyNormMinutes,
    weeklyNormMinutes,
  });

  const vacationYearForWeek = resolveVacationYear(input.periodStart, policy);

  // Credit overtime first so same-week earnings count toward the balance before under-norm use.
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

  const deficitLedgerMinutes = underNormByDayIndex.reduce((s, m) => s + m, 0);

  const days: TimesheetCompSettlementDay[] = [];
  let totalDeltaMinutes = 0;

  for (let i = 0; i < weekdayStats.length; i++) {
    const { dateKey, fulfillingMinutes } = weekdayStats[i]!;
    const underNormMinutes = underNormByDayIndex[i] ?? 0;
    const overtimeMinutes = Math.max(0, fulfillingMinutes - dailyNormMinutes);
    if (overtimeMinutes === 0 && underNormMinutes === 0) continue;

    const dayDelta = overtimeMinutes - underNormMinutes;
    days.push({
      date: dateKey,
      fulfillingMinutes,
      dailyNormMinutes,
      deltaMinutes: dayDelta,
      fillMinutes: 0,
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
      note: `${APPROVAL_NOTE_PREFIX}${input.timesheetApprovalId} undernorm:${deficitLedgerMinutes}`,
      createdByUserId: input.createdByUserId,
    });
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
