import { getClientWallClockZone } from "../clientWallClock";
import { prisma } from "../prisma";
import {
  accrueVacationEarnedDays,
  categoryToLeaveBalanceType,
  minutesToVacationDays,
  resolveLeaveNorms,
  resolveNextVacationYear,
  resolveVacationYear,
  summarizeLeaveBalances,
  workDayDurationMinutesFromHoursPerDay,
} from "../rules/leave/danishLeave";
import type {
  LeaveBalanceSummary,
  LeaveBalanceType,
  OrganizationLeavePolicyData,
  PersonLeaveProfileData,
  VacationYear,
} from "../rules/leave/types";

export const DEFAULT_LEAVE_POLICY: OrganizationLeavePolicyData = {
  countryCode: "DK",
  vacationYearStartMonth: 9,
  vacationYearStartDay: 1,
  defaultVacationDaysPerYear: 25,
  defaultExtraVacationDays: 5,
  defaultWeeklyContractHours: 37,
  hoursPerVacationDayMode: "contract_fifth",
  hoursPerVacationDayFixed: null,
  compTimeFromOvertimeEnabled: true,
};

export function mapOrgLeavePolicy(row: {
  countryCode: string;
  vacationYearStartMonth: number;
  vacationYearStartDay: number;
  defaultVacationDaysPerYear: number;
  defaultExtraVacationDays: number;
  defaultWeeklyContractHours: number;
  hoursPerVacationDayMode: string;
  hoursPerVacationDayFixed: number | null;
  compTimeFromOvertimeEnabled: boolean;
}): OrganizationLeavePolicyData {
  return { ...row };
}

export function mapPersonLeaveProfile(
  row: {
    leaveCountryCode: string;
    useOrgDefaults: boolean;
    weeklyContractHours: number | null;
    monthlyContractHours: number | null;
    annualContractHours: number | null;
    vacationDaysPerYear: number | null;
    extraVacationDaysPerYear: number | null;
    sickLeaveStatus: string;
    sickLeaveNote: string | null;
  } | null
): PersonLeaveProfileData | null {
  if (!row) return null;
  return { ...row };
}

export async function ensureOrgLeavePolicy(organizationId: string) {
  const existing = await prisma.organizationLeavePolicy.findUnique({
    where: { organizationId },
  });
  if (existing) return existing;
  return prisma.organizationLeavePolicy.create({
    data: { organizationId, ...DEFAULT_LEAVE_POLICY },
  });
}

export async function ensurePersonLeaveProfile(organizationId: string, personId: string) {
  const existing = await prisma.personLeaveProfile.findUnique({ where: { personId } });
  if (existing) return existing;
  const policy = await ensureOrgLeavePolicy(organizationId);
  return prisma.personLeaveProfile.create({
    data: { personId, organizationId, organizationLeavePolicyId: policy.id },
  });
}

async function upsertBalanceAmount(
  organizationId: string,
  personId: string,
  vacationYearKey: string,
  balanceType: LeaveBalanceType,
  delta: number
) {
  const existing = await prisma.leaveBalance.findUnique({
    where: {
      personId_vacationYearKey_balanceType: { personId, vacationYearKey, balanceType },
    },
  });
  const nextAmount = Math.round(((existing?.amount ?? 0) + delta) * 100) / 100;
  await prisma.leaveBalance.upsert({
    where: {
      personId_vacationYearKey_balanceType: { personId, vacationYearKey, balanceType },
    },
    create: { organizationId, personId, vacationYearKey, balanceType, amount: nextAmount },
    update: { amount: nextAmount },
  });
}

export async function postLeaveTransaction(input: {
  organizationId: string;
  personId: string;
  vacationYearKey: string;
  balanceType: LeaveBalanceType;
  amount: number;
  source: string;
  timeEntryId?: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  note?: string | null;
  createdByUserId?: string | null;
  effectiveDate?: string | null;
}) {
  if (input.amount === 0) return;
  const periodStart =
    input.periodStart ??
    (input.effectiveDate ? new Date(`${input.effectiveDate}T12:00:00`) : null);
  const periodEnd = input.periodEnd ?? periodStart;
  await prisma.leaveTransaction.create({
    data: {
      organizationId: input.organizationId,
      personId: input.personId,
      vacationYearKey: input.vacationYearKey,
      balanceType: input.balanceType,
      amount: input.amount,
      source: input.source,
      timeEntryId: input.timeEntryId ?? null,
      periodStart,
      periodEnd,
      note: input.note ?? null,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
  await upsertBalanceAmount(
    input.organizationId,
    input.personId,
    input.vacationYearKey,
    input.balanceType,
    input.amount
  );
}

export async function syncVacationEarnedForPerson(
  organizationId: string,
  personId: string,
  asOf: Date = new Date(),
  forcedVacationYear?: VacationYear
) {
  const policyRow = await ensureOrgLeavePolicy(organizationId);
  const policy = mapOrgLeavePolicy(policyRow);
  const profileRow = await prisma.personLeaveProfile.findUnique({ where: { personId } });
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId },
    select: { weeklyContractHours: true, vacationDaysPerYear: true },
  });
  if (!person) return;
  const norms = resolveLeaveNorms(policy, mapPersonLeaveProfile(profileRow), person);
  const vacationYear = forcedVacationYear ?? resolveVacationYear(asOf, policy);
  const earned = accrueVacationEarnedDays(
    norms,
    vacationYear,
    asOf,
    getClientWallClockZone()
  );
  const existing = await prisma.leaveBalance.findUnique({
    where: {
      personId_vacationYearKey_balanceType: {
        personId,
        vacationYearKey: vacationYear.key,
        balanceType: "vacation_earned",
      },
    },
  });
  const delta = earned - (existing?.amount ?? 0);
  if (Math.abs(delta) < 0.01) return;
  await postLeaveTransaction({
    organizationId,
    personId,
    vacationYearKey: vacationYear.key,
    balanceType: "vacation_earned",
    amount: delta,
    source: "opening_balance",
    note: "Accrued vacation sync",
  });
}

export async function applyTimeEntryToLeaveLedger(
  entry: {
    id: string;
    organizationId: string;
    personId: string;
    startsAt: Date;
    endsAt: Date;
    category: string;
  },
  options?: { createdByUserId?: string | null }
) {
  const balanceType = categoryToLeaveBalanceType(entry.category);
  if (!balanceType) return;

  await removeTimeEntryFromLeaveLedger(entry.id);

  const policyRow = await ensureOrgLeavePolicy(entry.organizationId);
  const policy = mapOrgLeavePolicy(policyRow);
  const profileRow = await prisma.personLeaveProfile.findUnique({
    where: { personId: entry.personId },
  });
  const person = await prisma.person.findFirst({
    where: { id: entry.personId },
    select: { weeklyContractHours: true, vacationDaysPerYear: true },
  });
  if (!person) return;
  const norms = resolveLeaveNorms(policy, mapPersonLeaveProfile(profileRow), person);
  const vacationYear = resolveVacationYear(entry.startsAt, policy);
  const durationMin = Math.max(
    0,
    Math.round((entry.endsAt.getTime() - entry.startsAt.getTime()) / 60_000)
  );
  const maxDayMin = workDayDurationMinutesFromHoursPerDay(norms.hoursPerVacationDay);
  const cappedDurationMin =
    maxDayMin > 0 ? Math.min(durationMin, maxDayMin) : durationMin;

  const amount =
    balanceType === "comp_time_used"
      ? cappedDurationMin
      : maxDayMin > 0 && Math.abs(cappedDurationMin - maxDayMin) <= 1
        ? 1
        : minutesToVacationDays(cappedDurationMin, norms.hoursPerVacationDay);
  if (amount <= 0) return;

  await syncVacationEarnedForPerson(entry.organizationId, entry.personId, entry.startsAt);
  await postLeaveTransaction({
    organizationId: entry.organizationId,
    personId: entry.personId,
    vacationYearKey: vacationYear.key,
    balanceType,
    amount,
    source: "time_entry",
    timeEntryId: entry.id,
    periodStart: entry.startsAt,
    periodEnd: entry.endsAt,
    createdByUserId: options?.createdByUserId ?? null,
  });
}

export async function removeTimeEntryFromLeaveLedger(timeEntryId: string) {
  const txs = await prisma.leaveTransaction.findMany({
    where: { timeEntryId, source: "time_entry" },
  });
  for (const tx of txs) {
    await upsertBalanceAmount(
      tx.organizationId,
      tx.personId,
      tx.vacationYearKey,
      tx.balanceType as LeaveBalanceType,
      -tx.amount
    );
  }
  await prisma.leaveTransaction.deleteMany({ where: { timeEntryId, source: "time_entry" } });
}

export async function accrueCompTimeFromOvertime(input: {
  organizationId: string;
  personId: string;
  periodStart: Date;
  periodEnd: Date;
  overtimeMinutes: number;
  createdByUserId?: string | null;
}) {
  if (input.overtimeMinutes <= 0) return;
  const policyRow = await ensureOrgLeavePolicy(input.organizationId);
  if (!policyRow.compTimeFromOvertimeEnabled) return;
  const policy = mapOrgLeavePolicy(policyRow);
  const vacationYear = resolveVacationYear(input.periodStart, policy);

  const existing = await prisma.leaveTransaction.findFirst({
    where: {
      organizationId: input.organizationId,
      personId: input.personId,
      source: "overtime_accrual",
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    },
  });
  if (existing) return;

  await postLeaveTransaction({
    organizationId: input.organizationId,
    personId: input.personId,
    vacationYearKey: vacationYear.key,
    balanceType: "comp_time_earned",
    amount: input.overtimeMinutes,
    source: "overtime_accrual",
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    note: `Overtime ${input.overtimeMinutes} min`,
    createdByUserId: input.createdByUserId,
  });
}

export async function applyOpeningBalances(input: {
  organizationId: string;
  personId: string;
  vacationYearKey?: string;
  note: string;
  createdByUserId?: string | null;
  effectiveDate?: string;
  vacationRemainingDays?: number;
  vacationEffectiveDate?: string;
  extraVacationRemainingDays?: number;
  extraVacationEffectiveDate?: string;
  compTimeRemainingMinutes?: number;
  compTimeEffectiveDate?: string;
  sickDays?: number;
}): Promise<LeaveBalanceSummary> {
  const asOf = new Date();
  const policyRow = await ensureOrgLeavePolicy(input.organizationId);
  const policy = mapOrgLeavePolicy(policyRow);
  const vacationYearKey =
    input.vacationYearKey ?? resolveVacationYear(asOf, policy).key;

  await syncVacationEarnedForPerson(input.organizationId, input.personId, asOf);

  const profileRow = await prisma.personLeaveProfile.findUnique({
    where: { personId: input.personId },
  });
  const person = await prisma.person.findFirst({
    where: { id: input.personId, organizationId: input.organizationId },
    select: { weeklyContractHours: true, vacationDaysPerYear: true },
  });
  const norms = resolveLeaveNorms(policy, mapPersonLeaveProfile(profileRow), person ?? undefined);

  const rows = await prisma.leaveBalance.findMany({
    where: { personId: input.personId, vacationYearKey },
  });
  const map: Record<string, number> = {};
  for (const r of rows) map[r.balanceType] = r.amount;

  const earned = accrueVacationEarnedDays(
    norms,
    resolveVacationYear(asOf, policy),
    asOf,
    getClientWallClockZone()
  );
  const current = summarizeLeaveBalances(vacationYearKey, norms, earned, map);

  const postDelta = async (
    balanceType: LeaveBalanceType,
    delta: number,
    effectiveDate?: string
  ) => {
    if (Math.abs(delta) < 0.001) return;
    await postLeaveTransaction({
      organizationId: input.organizationId,
      personId: input.personId,
      vacationYearKey,
      balanceType,
      amount: delta,
      source: "opening_balance",
      note: input.note,
      createdByUserId: input.createdByUserId ?? null,
      effectiveDate: effectiveDate ?? input.effectiveDate,
    });
  };

  if (input.vacationRemainingDays !== undefined) {
    // Keep accrued vacation_earned as Ferieloven optjening; hit remaining via used.
    const targetUsed = earned - input.vacationRemainingDays;
    const delta = targetUsed - current.vacationUsedDays;
    await postDelta("vacation_used", delta, input.vacationEffectiveDate);
  }

  if (input.extraVacationRemainingDays !== undefined) {
    const targetUsed =
      norms.extraVacationDaysPerYear - input.extraVacationRemainingDays;
    const delta = targetUsed - current.extraVacationUsedDays;
    await postDelta("extra_vacation_used", delta, input.extraVacationEffectiveDate);
  }

  if (input.compTimeRemainingMinutes !== undefined) {
    const delta = input.compTimeRemainingMinutes - current.compTimeRemainingMinutes;
    await postDelta("comp_time_earned", delta, input.compTimeEffectiveDate);
  }

  if (input.sickDays !== undefined) {
    const delta = input.sickDays - current.sickDays;
    await postDelta("sick_days", delta);
  }

  return getLeaveBalanceSummary(input.organizationId, input.personId, asOf);
}

export async function getLeaveBalanceSummary(
  organizationId: string,
  personId: string,
  asOf: Date = new Date(),
  forcedVacationYear?: VacationYear
): Promise<LeaveBalanceSummary> {
  const policyRow = await ensureOrgLeavePolicy(organizationId);
  const policy = mapOrgLeavePolicy(policyRow);
  const profileRow = await prisma.personLeaveProfile.findUnique({ where: { personId } });
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId },
    select: { weeklyContractHours: true, vacationDaysPerYear: true },
  });
  const norms = resolveLeaveNorms(policy, mapPersonLeaveProfile(profileRow), person ?? undefined);
  const vacationYear = forcedVacationYear ?? resolveVacationYear(asOf, policy);
  await syncVacationEarnedForPerson(organizationId, personId, asOf, vacationYear);

  const rows = await prisma.leaveBalance.findMany({
    where: { personId, vacationYearKey: vacationYear.key },
  });
  const map: Record<string, number> = {};
  for (const r of rows) map[r.balanceType] = r.amount;

  const earned = accrueVacationEarnedDays(
    norms,
    vacationYear,
    asOf,
    getClientWallClockZone()
  );
  return summarizeLeaveBalances(vacationYear.key, norms, earned, map);
}

/** Current ferieår + next ferieår vacation overview (as of today). */
export async function getLeaveBalanceOverview(
  organizationId: string,
  personId: string,
  asOf: Date = new Date()
): Promise<{
  current: LeaveBalanceSummary;
  next: LeaveBalanceSummary;
}> {
  const policyRow = await ensureOrgLeavePolicy(organizationId);
  const policy = mapOrgLeavePolicy(policyRow);
  const currentYear = resolveVacationYear(asOf, policy);
  const nextYear = resolveNextVacationYear(currentYear, policy);
  const current = await getLeaveBalanceSummary(organizationId, personId, asOf, currentYear);
  const next = await getLeaveBalanceSummary(organizationId, personId, asOf, nextYear);
  return { current, next };
}

/**
 * Comp-time (afspadsering) minutes earned in a half-open UTC range, from leave ledger posts
 * (overtime accrual, opening balance, manual adjustment). Does not accrue overtime as a side effect.
 */
export async function sumCompTimeEarnedMinutesInRange(
  organizationId: string,
  personIds: string[],
  rangeStart: Date,
  rangeEndExclusive: Date,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (personIds.length === 0) return map;

  const rows = await prisma.leaveTransaction.findMany({
    where: {
      organizationId,
      personId: { in: personIds },
      balanceType: "comp_time_earned",
      OR: [
        {
          periodStart: { gte: rangeStart, lt: rangeEndExclusive },
        },
        {
          periodStart: null,
          createdAt: { gte: rangeStart, lt: rangeEndExclusive },
        },
      ],
    },
    select: { personId: true, amount: true },
  });

  for (const row of rows) {
    map.set(row.personId, (map.get(row.personId) ?? 0) + row.amount);
  }
  return map;
}

/**
 * Afspadsering used in range from leave ledger (`comp_time_used`), not from visual N/A
 * calendar blocks (`category=comp_time`).
 */
export async function sumCompTimeUsedMinutesInRange(
  organizationId: string,
  personIds: string[],
  rangeStart: Date,
  rangeEndExclusive: Date
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (personIds.length === 0) return map;

  const rows = await prisma.leaveTransaction.findMany({
    where: {
      organizationId,
      personId: { in: personIds },
      balanceType: "comp_time_used",
      OR: [
        {
          periodStart: { gte: rangeStart, lt: rangeEndExclusive },
        },
        {
          periodStart: null,
          createdAt: { gte: rangeStart, lt: rangeEndExclusive },
        },
      ],
    },
    select: { personId: true, amount: true },
  });

  for (const row of rows) {
    map.set(row.personId, (map.get(row.personId) ?? 0) + row.amount);
  }
  return map;
}

/** Net afspadsering change in range: earned − used (ledger only). */
export async function computeCompTimePeriodDeltaMinutes(
  organizationId: string,
  personId: string,
  rangeStart: Date,
  rangeEndExclusive: Date
): Promise<number> {
  const earned = await sumCompTimeEarnedMinutesInRange(
    organizationId,
    [personId],
    rangeStart,
    rangeEndExclusive
  );
  const used = await sumCompTimeUsedMinutesInRange(
    organizationId,
    [personId],
    rangeStart,
    rangeEndExclusive
  );
  return Math.round((earned.get(personId) ?? 0) - (used.get(personId) ?? 0));
}
