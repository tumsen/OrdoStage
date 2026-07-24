import { Hono } from "hono";
import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { prisma } from "../prisma";
import { auth } from "../auth";
import { canAction, canView } from "../requestRole";
import { isCountryFeatureEnabled } from "../countryFeatures";
import { isPostgresDatabaseUrl } from "../databaseUrl";
import {
  CreateLeaveAdjustmentSchema,
  PatchOrganizationLeavePolicySchema,
  PatchPersonLeaveProfileSchema,
  SetLeaveOpeningBalancesSchema,
} from "../types";
import {
  applyOpeningBalances,
  ensureOrgLeavePolicy,
  ensurePersonLeaveProfile,
  getLeaveBalanceSummary,
  getLeaveBalanceOverview,
  mapOrgLeavePolicy,
  mapPersonLeaveProfile,
  postLeaveTransaction,
  sumCompTimeUsedMinutesInRange,
} from "../services/leaveLedger";
import { resolveVacationYear, resolveLeaveNorms, positiveOvertimeMinutes, hoursPerWorkDayFromWeekly, minutesToVacationDays, accrueVacationEarnedForDateRange, contractMinutesForWeekdayPeriod, employmentStartYmd } from "../rules/leave/danishLeave";
import { DateTime } from "luxon";
import { getClientWallClockZone } from "../clientWallClock";

const leaveRouter = new Hono<{
  Variables: { user: typeof auth.$Infer.Session.user | null };
}>();

function iso(d: Date) {
  return d.toISOString();
}

function serializeLeavePolicy(row: Awaited<ReturnType<typeof ensureOrgLeavePolicy>>) {
  return {
    ...row,
    hoursPerVacationDayMode: row.hoursPerVacationDayMode as "contract_fifth" | "fixed",
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function serializePersonLeaveProfile(row: Awaited<ReturnType<typeof ensurePersonLeaveProfile>>) {
  return {
    ...row,
    sickLeaveStatus: row.sickLeaveStatus as "none" | "active",
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

async function leaveEnabled(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { countryFeatures: true },
  });
  return isCountryFeatureEnabled(org?.countryFeatures, "DK", "leaveManagement");
}

/** All leave/payroll country rules require DK leaveManagement to be enabled. */
leaveRouter.use("*", async (c, next) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!(await leaveEnabled(user.organizationId))) {
    return c.json(
      {
        error: {
          message: "Danish leave management is not enabled for this organization.",
          code: "FEATURE_DISABLED",
        },
      },
      403
    );
  }
  await next();
});

async function resolvePersonIdForUser(organizationId: string, email: string | null | undefined) {
  if (!email?.trim()) return null;
  let person = await prisma.person.findFirst({
    where: { organizationId, email },
    select: { id: true },
  });
  if (!person && isPostgresDatabaseUrl(process.env.DATABASE_URL)) {
    person = await prisma.person.findFirst({
      where: { organizationId, email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
  }
  return person?.id ?? null;
}

async function canReadPersonLeave(
  c: Context,
  personId: string,
  organizationId: string,
  userEmail: string | null | undefined
) {
  if (canAction(c, "time.read_all")) return true;
  const myPersonId = await resolvePersonIdForUser(organizationId, userEmail);
  return myPersonId === personId;
}

leaveRouter.get("/org/leave-policy", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "org.update") && !canAction(c, "time.read_all")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const row = await ensureOrgLeavePolicy(user.organizationId);
  return c.json({ data: serializeLeavePolicy(row) });
});

leaveRouter.patch("/org/leave-policy", zValidator("json", PatchOrganizationLeavePolicySchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "org.update")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  await ensureOrgLeavePolicy(user.organizationId);
  const body = c.req.valid("json");
  const row = await prisma.organizationLeavePolicy.update({
    where: { organizationId: user.organizationId },
    data: {
      ...(body.countryCode !== undefined ? { countryCode: body.countryCode } : {}),
      ...(body.vacationYearStartMonth !== undefined
        ? { vacationYearStartMonth: body.vacationYearStartMonth }
        : {}),
      ...(body.vacationYearStartDay !== undefined
        ? { vacationYearStartDay: body.vacationYearStartDay }
        : {}),
      ...(body.defaultVacationDaysPerYear !== undefined
        ? { defaultVacationDaysPerYear: body.defaultVacationDaysPerYear }
        : {}),
      ...(body.defaultExtraVacationDays !== undefined
        ? { defaultExtraVacationDays: body.defaultExtraVacationDays }
        : {}),
      ...(body.defaultWeeklyContractHours !== undefined
        ? { defaultWeeklyContractHours: body.defaultWeeklyContractHours }
        : {}),
      ...(body.hoursPerVacationDayMode !== undefined
        ? { hoursPerVacationDayMode: body.hoursPerVacationDayMode }
        : {}),
      ...(body.hoursPerVacationDayFixed !== undefined
        ? { hoursPerVacationDayFixed: body.hoursPerVacationDayFixed }
        : {}),
      ...(body.compTimeFromOvertimeEnabled !== undefined
        ? { compTimeFromOvertimeEnabled: body.compTimeFromOvertimeEnabled }
        : {}),
    },
  });
  return c.json({ data: serializeLeavePolicy(row) });
});

leaveRouter.get("/people/:id/leave-profile", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "time.read_all")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const personId = c.req.param("id");
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!person) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  const profile = await ensurePersonLeaveProfile(user.organizationId, personId);
  const leave = await getLeaveBalanceSummary(user.organizationId, personId);
  return c.json({
    data: {
      profile: serializePersonLeaveProfile(profile),
      leave,
    },
  });
});

leaveRouter.patch(
  "/people/:id/leave-profile",
  zValidator("json", PatchPersonLeaveProfileSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId) {
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    }
    if (!canAction(c, "time.read_all")) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }
    const personId = c.req.param("id");
    const body = c.req.valid("json");
    const person = await prisma.person.findFirst({
      where: { id: personId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!person) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
    await ensurePersonLeaveProfile(user.organizationId, personId);
    const row = await prisma.personLeaveProfile.update({
      where: { personId },
      data: {
        ...(body.useOrgDefaults !== undefined ? { useOrgDefaults: body.useOrgDefaults } : {}),
        ...(body.weeklyContractHours !== undefined
          ? { weeklyContractHours: body.weeklyContractHours }
          : {}),
        ...(body.monthlyContractHours !== undefined
          ? { monthlyContractHours: body.monthlyContractHours }
          : {}),
        ...(body.annualContractHours !== undefined
          ? { annualContractHours: body.annualContractHours }
          : {}),
        ...(body.vacationDaysPerYear !== undefined
          ? { vacationDaysPerYear: body.vacationDaysPerYear }
          : {}),
        ...(body.extraVacationDaysPerYear !== undefined
          ? { extraVacationDaysPerYear: body.extraVacationDaysPerYear }
          : {}),
        ...(body.sickLeaveStatus !== undefined ? { sickLeaveStatus: body.sickLeaveStatus } : {}),
        ...(body.sickLeaveNote !== undefined ? { sickLeaveNote: body.sickLeaveNote } : {}),
      },
    });
    if (body.weeklyContractHours !== undefined || body.vacationDaysPerYear !== undefined) {
      await prisma.person.update({
        where: { id: personId },
        data: {
          ...(body.weeklyContractHours !== undefined
            ? { weeklyContractHours: body.weeklyContractHours }
            : {}),
          ...(body.vacationDaysPerYear !== undefined
            ? { vacationDaysPerYear: body.vacationDaysPerYear }
            : {}),
        },
      });
    }
    const leave = await getLeaveBalanceSummary(user.organizationId, personId);
    return c.json({
      data: {
        profile: serializePersonLeaveProfile(row),
        leave,
      },
    });
  }
);

leaveRouter.get("/time/leave-balances/:personId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const personId = c.req.param("personId");
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!person) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);
  const allowed = await canReadPersonLeave(c, personId, user.organizationId, user.email);
  if (!allowed) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const overview = await getLeaveBalanceOverview(user.organizationId, personId);
  const leave = overview.current;
  const nextVacationYear = {
    vacationYearKey: overview.next.vacationYearKey,
    vacationEarnedDays: overview.next.vacationEarnedDays,
    vacationUsedDays: overview.next.vacationUsedDays,
    vacationRemainingDays: overview.next.vacationRemainingDays,
    extraVacationRemainingDays: overview.next.extraVacationRemainingDays,
  };
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    const zone = getClientWallClockZone();
    const rangeStart = DateTime.fromFormat(from, "yyyy-MM-dd", { zone }).startOf("day").toJSDate();
    const rangeEndExclusive = DateTime.fromFormat(to, "yyyy-MM-dd", { zone })
      .plus({ days: 1 })
      .startOf("day")
      .toJSDate();
    const usedByPerson = await sumCompTimeUsedMinutesInRange(
      user.organizationId,
      [personId],
      rangeStart,
      rangeEndExclusive
    );
    return c.json({
      data: {
        ...leave,
        nextVacationYear,
        compTimePeriodUsedMinutes: Math.round(usedByPerson.get(personId) ?? 0),
      },
    });
  }
  return c.json({
    data: {
      ...leave,
      nextVacationYear,
    },
  });
});

leaveRouter.post(
  "/time/leave-opening-balances",
  zValidator("json", SetLeaveOpeningBalancesSchema),
  async (c) => {
    const user = c.get("user");
    if (!user?.organizationId || !user.id) {
      return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
    }
    if (!canAction(c, "time.read_all")) {
      return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
    }
    const body = c.req.valid("json");
    const person = await prisma.person.findFirst({
      where: { id: body.personId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!person) return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);

    const hasField =
      body.vacationRemainingDays !== undefined ||
      body.extraVacationRemainingDays !== undefined ||
      body.compTimeRemainingMinutes !== undefined ||
      body.sickDays !== undefined;
    if (!hasField) {
      return c.json(
        { error: { message: "At least one balance field is required", code: "BAD_REQUEST" } },
        400
      );
    }

    const leave = await applyOpeningBalances({
      organizationId: user.organizationId,
      personId: body.personId,
      vacationYearKey: body.vacationYearKey,
      note: body.note,
      createdByUserId: user.id,
      effectiveDate: body.effectiveDate,
      vacationRemainingDays: body.vacationRemainingDays,
      vacationEffectiveDate: body.vacationEffectiveDate,
      extraVacationRemainingDays: body.extraVacationRemainingDays,
      extraVacationEffectiveDate: body.extraVacationEffectiveDate,
      compTimeRemainingMinutes: body.compTimeRemainingMinutes,
      compTimeEffectiveDate: body.compTimeEffectiveDate,
      sickDays: body.sickDays,
    });

    return c.json({ data: leave });
  }
);

leaveRouter.post("/time/leave-adjustments", zValidator("json", CreateLeaveAdjustmentSchema), async (c) => {
  const user = c.get("user");
  if (!user?.organizationId || !user.id) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "time.read_all")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const body = c.req.valid("json");
  const person = await prisma.person.findFirst({
    where: { id: body.personId, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!person) return c.json({ error: { message: "Person not found", code: "NOT_FOUND" } }, 404);

  const policyRow = await ensureOrgLeavePolicy(user.organizationId);
  const policy = mapOrgLeavePolicy(policyRow);
  const vacationYearKey =
    body.vacationYearKey ?? resolveVacationYear(new Date(), policy).key;

  await postLeaveTransaction({
    organizationId: user.organizationId,
    personId: body.personId,
    vacationYearKey,
    balanceType: body.balanceType,
    amount: body.amount,
    source: "manual_adjustment",
    note: body.note,
    createdByUserId: user.id,
    effectiveDate: body.effectiveDate,
  });

  const leave = await getLeaveBalanceSummary(user.organizationId, body.personId);
  return c.json({ data: leave });
});

leaveRouter.get("/time/leave-transactions/:personId", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canView(c, "time")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const personId = c.req.param("personId");
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!person) return c.json({ error: { message: "Not found", code: "NOT_FOUND" } }, 404);

  const allowed = await canReadPersonLeave(c, personId, user.organizationId, user.email);
  if (!allowed) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }

  const vacationYearKey = c.req.query("vacationYearKey");
  const rows = await prisma.leaveTransaction.findMany({
    where: {
      organizationId: user.organizationId,
      personId,
      ...(vacationYearKey ? { vacationYearKey } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const userIds = [...new Set(rows.map((r) => r.createdByUserId).filter(Boolean))] as string[];
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const data = rows.map((r) => {
    const creator = r.createdByUserId ? userById.get(r.createdByUserId) : undefined;
    return {
      id: r.id,
      personId: r.personId,
      vacationYearKey: r.vacationYearKey,
      balanceType: r.balanceType,
      amount: r.amount,
      source: r.source,
      note: r.note,
      timeEntryId: r.timeEntryId,
      periodStart: r.periodStart ? iso(r.periodStart) : null,
      periodEnd: r.periodEnd ? iso(r.periodEnd) : null,
      createdByUserId: r.createdByUserId,
      createdByName: creator?.name ?? null,
      createdByEmail: creator?.email ?? null,
      createdAt: iso(r.createdAt),
    };
  });

  return c.json({ data });
});

leaveRouter.get("/time/payroll-export", async (c) => {
  const user = c.get("user");
  if (!user?.organizationId) {
    return c.json({ error: { message: "Unauthorized", code: "UNAUTHORIZED" } }, 401);
  }
  if (!canAction(c, "time.read_all")) {
    return c.json({ error: { message: "Forbidden", code: "FORBIDDEN" } }, 403);
  }
  const fromStr = c.req.query("from");
  const toStr = c.req.query("to");
  const approvedOnly = c.req.query("approvedOnly") === "1";
  if (!fromStr || !toStr) {
    return c.json({ error: { message: "from and to required", code: "BAD_REQUEST" } }, 400);
  }
  const zone = getClientWallClockZone();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
    return c.json({ error: { message: "from and to must be yyyy-MM-dd", code: "BAD_REQUEST" } }, 400);
  }
  const from = DateTime.fromFormat(fromStr, "yyyy-MM-dd", { zone }).startOf("day").toJSDate();
  const toInclusive = DateTime.fromFormat(toStr, "yyyy-MM-dd", { zone }).endOf("day").toJSDate();
  const toExclusive = DateTime.fromFormat(toStr, "yyyy-MM-dd", { zone })
    .plus({ days: 1 })
    .startOf("day")
    .toJSDate();
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(toInclusive.getTime())) {
    return c.json({ error: { message: "Invalid date range", code: "BAD_REQUEST" } }, 400);
  }

  const policyRow = await ensureOrgLeavePolicy(user.organizationId);
  const policy = mapOrgLeavePolicy(policyRow);
  const vacationYear = resolveVacationYear(from, policy);

  const people = await prisma.person.findMany({
    where: { organizationId: user.organizationId, isActive: true, showInPayroll: true },
    select: {
      id: true,
      name: true,
      weeklyContractHours: true,
      vacationDaysPerYear: true,
      employmentStartDate: true,
      leaveProfile: true,
    },
    orderBy: { name: "asc" },
  });

  const entries = await prisma.timeEntry.findMany({
    where: {
      organizationId: user.organizationId,
      startsAt: { gte: from, lt: toExclusive },
    },
    select: {
      personId: true,
      startsAt: true,
      endsAt: true,
      category: true,
    },
  });

  const approvals = approvedOnly
    ? await prisma.timesheetApproval.findMany({
        where: {
          organizationId: user.organizationId,
          status: "approved",
          periodStart: { lt: toExclusive },
          periodEnd: { gt: from },
        },
        select: { personId: true },
      })
    : [];
  const approvedIds = new Set(approvals.map((a) => a.personId));

  const exportPeople = [];
  for (const p of people) {
    if (approvedOnly && !approvedIds.has(p.id)) continue;

    const norms = resolveLeaveNorms(
      policy,
      mapPersonLeaveProfile(p.leaveProfile),
      p
    );
    const hireYmd = employmentStartYmd(p.employmentStartDate);
    const hireStartMs = hireYmd
      ? DateTime.fromFormat(hireYmd, "yyyy-MM-dd", { zone }).startOf("day").toMillis()
      : Number.NEGATIVE_INFINITY;
    const personEntries = entries.filter((e) => e.personId === p.id);
    let workMinutes = 0;
    let vacationMinutes = 0;
    let extraVacationMinutes = 0;
    let holidayMinutes = 0;
    let sickMinutes = 0;
    for (const e of personEntries) {
      const clippedStart = Math.max(e.startsAt.getTime(), hireStartMs);
      const clippedEnd = e.endsAt.getTime();
      const dur = Math.max(0, (clippedEnd - clippedStart) / 60_000);
      if (dur <= 0) continue;
      const cat = e.category || "work";
      if (cat === "work") workMinutes += dur;
      else if (cat === "vacation") vacationMinutes += dur;
      else if (cat === "extra_vacation") extraVacationMinutes += dur;
      else if (cat === "holiday") holidayMinutes += dur;
      else if (cat === "sick") sickMinutes += dur;
    }
    const hoursPerDay = hoursPerWorkDayFromWeekly(norms.weeklyContractHours);
    const vacationUsedInPeriod = minutesToVacationDays(vacationMinutes, hoursPerDay);
    const extraVacationUsedInPeriod = minutesToVacationDays(extraVacationMinutes, hoursPerDay);
    const sickDaysInPeriod = minutesToVacationDays(sickMinutes, hoursPerDay);
    const contractMinutes = contractMinutesForWeekdayPeriod(
      norms.weeklyContractHours,
      fromStr,
      toStr,
      hireYmd,
      zone
    );
    const overtimeMinutes = positiveOvertimeMinutes(
      { workMinutes, vacationMinutes, extraVacationMinutes, holidayMinutes, sickMinutes },
      contractMinutes,
      { includeLeaveInNorm: true }
    );

    if (overtimeMinutes != null && overtimeMinutes > 0) {
      const { accrueCompTimeFromOvertime } = await import("../services/leaveLedger");
      const { hasTimesheetCompSettlementInRange } = await import("../services/timesheetCompSettlement");
      const alreadySettled = await hasTimesheetCompSettlementInRange(
        user.organizationId,
        p.id,
        from,
        toExclusive
      );
      if (!alreadySettled) {
        await accrueCompTimeFromOvertime({
          organizationId: user.organizationId,
          personId: p.id,
          periodStart: from,
          periodEnd: toExclusive,
          overtimeMinutes: Math.round(overtimeMinutes),
          createdByUserId: user.id,
        });
      }
    }

    // Used + earned-in-period from the selected from–to range (e.g. month for payroll).
    // Remaining / comp are ferieår saldo as of period end (samtidighedsferie).
    const leave = await getLeaveBalanceSummary(user.organizationId, p.id, toInclusive);
    const vacationEarnFrom = hireYmd && hireYmd > fromStr ? hireYmd : fromStr;
    const vacationEarnedInPeriod =
      vacationEarnFrom <= toStr
        ? accrueVacationEarnedForDateRange(
            norms.vacationDaysPerYear,
            vacationEarnFrom,
            toStr,
            zone
          )
        : 0;

    exportPeople.push({
      personId: p.id,
      personName: p.name,
      weeklyContractHours: norms.weeklyContractHours,
      monthlyContractHours: norms.monthlyContractHours,
      annualContractHours: norms.annualContractHours,
      workMinutes: Math.round(workMinutes),
      overtimeMinutes: overtimeMinutes != null ? Math.round(overtimeMinutes) : null,
      vacationEarnedDays: vacationEarnedInPeriod,
      vacationUsedDays: vacationUsedInPeriod,
      vacationRemainingDays: leave.vacationRemainingDays,
      extraVacationUsedDays: extraVacationUsedInPeriod,
      extraVacationRemainingDays: leave.extraVacationRemainingDays,
      compTimeEarnedMinutes: leave.compTimeEarnedMinutes,
      compTimeUsedMinutes: leave.compTimeUsedMinutes,
      compTimeRemainingMinutes: leave.compTimeRemainingMinutes,
      sickDays: sickDaysInPeriod,
      timesheetApproved: approvedIds.has(p.id),
      leave,
    });
  }

  return c.json({
    data: {
      from: fromStr,
      to: toStr,
      vacationYearKey: vacationYear.key,
      people: exportPeople,
    },
  });
});

export default leaveRouter;
