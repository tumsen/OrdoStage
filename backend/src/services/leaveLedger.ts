import { prisma } from "../prisma";
import {
  accrueVacationEarnedDays,
  categoryToLeaveBalanceType,
  minutesToVacationDays,
  resolveLeaveNorms,
  resolveVacationYear,
  summarizeLeaveBalances,
} from "../rules/leave/danishLeave";
import type {
  LeaveBalanceSummary,
  LeaveBalanceType,
  OrganizationLeavePolicyData,
  PersonLeaveProfileData,
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
}) {
  if (input.amount === 0) return;
  await prisma.leaveTransaction.create({
    data: {
      organizationId: input.organizationId,
      personId: input.personId,
      vacationYearKey: input.vacationYearKey,
      balanceType: input.balanceType,
      amount: input.amount,
      source: input.source,
      timeEntryId: input.timeEntryId ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
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
  asOf: Date = new Date()
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
  const vacationYear = resolveVacationYear(asOf, policy);
  const earned = accrueVacationEarnedDays(norms, vacationYear, asOf);
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

  const amount =
    balanceType === "comp_time_used"
      ? durationMin
      : minutesToVacationDays(durationMin, norms.hoursPerVacationDay);
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

export async function getLeaveBalanceSummary(
  organizationId: string,
  personId: string,
  asOf: Date = new Date()
): Promise<LeaveBalanceSummary> {
  const policyRow = await ensureOrgLeavePolicy(organizationId);
  const policy = mapOrgLeavePolicy(policyRow);
  const profileRow = await prisma.personLeaveProfile.findUnique({ where: { personId } });
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId },
    select: { weeklyContractHours: true, vacationDaysPerYear: true },
  });
  const norms = resolveLeaveNorms(policy, mapPersonLeaveProfile(profileRow), person ?? undefined);
  const vacationYear = resolveVacationYear(asOf, policy);
  await syncVacationEarnedForPerson(organizationId, personId, asOf);

  const rows = await prisma.leaveBalance.findMany({
    where: { personId, vacationYearKey: vacationYear.key },
  });
  const map: Record<string, number> = {};
  for (const r of rows) map[r.balanceType] = r.amount;

  const earned = accrueVacationEarnedDays(norms, vacationYear, asOf);
  return summarizeLeaveBalances(vacationYear.key, norms, earned, map);
}
