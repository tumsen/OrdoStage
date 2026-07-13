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
  mapOrgLeavePolicy,
  mapPersonLeaveProfile,
  postLeaveTransaction,
} from "../services/leaveLedger";
import { resolveVacationYear, resolveLeaveNorms } from "../rules/leave/danishLeave";

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
  const leave = await getLeaveBalanceSummary(user.organizationId, personId);
  return c.json({ data: leave });
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
      extraVacationRemainingDays: body.extraVacationRemainingDays,
      compTimeRemainingMinutes: body.compTimeRemainingMinutes,
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
  const from = new Date(fromStr);
  const to = new Date(toStr);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    return c.json({ error: { message: "Invalid date range", code: "BAD_REQUEST" } }, 400);
  }

  const policyRow = await ensureOrgLeavePolicy(user.organizationId);
  const policy = mapOrgLeavePolicy(policyRow);
  const vacationYear = resolveVacationYear(from, policy);

  const people = await prisma.person.findMany({
    where: { organizationId: user.organizationId, isActive: true },
    select: {
      id: true,
      name: true,
      weeklyContractHours: true,
      vacationDaysPerYear: true,
      leaveProfile: true,
    },
    orderBy: { name: "asc" },
  });

  const entries = await prisma.timeEntry.findMany({
    where: {
      organizationId: user.organizationId,
      startsAt: { gte: from, lte: to },
    },
    select: {
      personId: true,
      startsAt: true,
      endsAt: true,
      category: true,
    },
  });

  const rangeDays = Math.max(1, (to.getTime() - from.getTime()) / 86_400_000);

  const approvals = approvedOnly
    ? await prisma.timesheetApproval.findMany({
        where: {
          organizationId: user.organizationId,
          status: "approved",
          periodStart: { lte: to },
          periodEnd: { gte: from },
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
    const personEntries = entries.filter((e) => e.personId === p.id);
    let workMinutes = 0;
    for (const e of personEntries) {
      if ((e.category || "work") === "work") {
        workMinutes += Math.max(0, (e.endsAt.getTime() - e.startsAt.getTime()) / 60_000);
      }
    }
    const contractMinutes =
      norms.weeklyContractHours != null ? (rangeDays / 7) * norms.weeklyContractHours * 60 : null;
    const overtimeMinutes = contractMinutes != null ? workMinutes - contractMinutes : null;

    if (overtimeMinutes != null && overtimeMinutes > 0) {
      const { accrueCompTimeFromOvertime } = await import("../services/leaveLedger");
      await accrueCompTimeFromOvertime({
        organizationId: user.organizationId,
        personId: p.id,
        periodStart: from,
        periodEnd: to,
        overtimeMinutes: Math.round(overtimeMinutes),
        createdByUserId: user.id,
      });
    }

    const leave = await getLeaveBalanceSummary(user.organizationId, p.id, to);

    exportPeople.push({
      personId: p.id,
      personName: p.name,
      weeklyContractHours: norms.weeklyContractHours,
      monthlyContractHours: norms.monthlyContractHours,
      annualContractHours: norms.annualContractHours,
      workMinutes: Math.round(workMinutes),
      overtimeMinutes: overtimeMinutes != null ? Math.round(overtimeMinutes) : null,
      vacationEarnedDays: leave.vacationEarnedDays,
      vacationUsedDays: leave.vacationUsedDays,
      vacationRemainingDays: leave.vacationRemainingDays,
      extraVacationUsedDays: leave.extraVacationUsedDays,
      extraVacationRemainingDays: leave.extraVacationRemainingDays,
      compTimeEarnedMinutes: leave.compTimeEarnedMinutes,
      compTimeUsedMinutes: leave.compTimeUsedMinutes,
      compTimeRemainingMinutes: leave.compTimeRemainingMinutes,
      sickDays: leave.sickDays,
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
