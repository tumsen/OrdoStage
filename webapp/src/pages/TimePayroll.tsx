import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfDay,
} from "date-fns";
import { ArrowLeft, Download } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { PayrollExport } from "@/contracts/backendTypes";

function fmtMins(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.round(Math.abs(minutes) % 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtDays(days: number): string {
  return `${days.toFixed(2).replace(/\.?0+$/, "")}d`;
}

function today(): Date {
  return startOfDay(new Date());
}

function buildCsv(data: PayrollExport, lang: string): string {
  const da = lang === "da";
  const headers = da
    ? [
        "Navn",
        "Ugentlig norm",
        "Arbejdstimer",
        "Overarbejde",
        "Optjent ferie",
        "Afholdt ferie",
        "Restferie",
        "Feriefridage brugt",
        "Feriefridage rest",
        "Afspadsering optjent",
        "Afspadsering brugt",
        "Afspadsering rest",
        "Sygedage",
        "Godkendt",
      ]
    : [
        "Name",
        "Weekly norm",
        "Work hours",
        "Overtime",
        "Vacation earned",
        "Vacation used",
        "Vacation remaining",
        "Extra vacation used",
        "Extra vacation remaining",
        "Comp time earned",
        "Comp time used",
        "Comp time remaining",
        "Sick days",
        "Approved",
      ];

  const rows = data.people.map((p) => [
    p.personName,
    p.weeklyContractHours != null ? String(p.weeklyContractHours) : "",
    fmtMins(p.workMinutes),
    p.overtimeMinutes != null ? fmtMins(p.overtimeMinutes) : "",
    fmtDays(p.vacationEarnedDays),
    fmtDays(p.vacationUsedDays),
    fmtDays(p.vacationRemainingDays),
    fmtDays(p.extraVacationUsedDays),
    fmtDays(p.extraVacationRemainingDays),
    fmtMins(p.compTimeEarnedMinutes),
    fmtMins(p.compTimeUsedMinutes),
    fmtMins(p.compTimeRemainingMinutes),
    fmtDays(p.sickDays),
    p.timesheetApproved ? (da ? "Ja" : "Yes") : da ? "Nej" : "No",
  ]);

  const escape = (v: string) => {
    if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };

  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

export default function TimePayroll() {
  const { t, language } = useI18n();
  const { canAction } = usePermissions();
  const readAll = canAction("time.read_all");

  const now = today();
  const [from, setFrom] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(now), "yyyy-MM-dd"));
  const [approvedOnly, setApprovedOnly] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["time-payroll-export", from, to, approvedOnly],
    queryFn: () =>
      api.get<PayrollExport>(
        `/api/time/payroll-export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&approvedOnly=${approvedOnly ? "1" : "0"}`
      ),
    enabled: readAll && Boolean(from) && Boolean(to),
  });

  const exportCsv = () => {
    if (!data) return;
    const csv = buildCsv(data, language);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${data.from}-${data.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const presetMonth = (offset: number) => {
    const d = subMonths(now, offset);
    setFrom(format(startOfMonth(d), "yyyy-MM-dd"));
    setTo(format(endOfMonth(d), "yyyy-MM-dd"));
  };

  const rows = useMemo(() => data?.people ?? [], [data]);

  if (!readAll) {
    return (
      <div className="p-6 max-w-lg">
        <p className="text-sm text-white/55">{t("time.reportsNoAccess")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-[1600px] mx-auto w-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/time"
            className="inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white/70 mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("time.backToTime")}
          </Link>
          <h1 className="text-xl font-semibold text-white">{t("time.payrollTitle")}</h1>
          <p className="text-sm text-white/50 mt-1">{t("time.payrollSubtitle")}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-white/15 text-white/70 gap-1.5"
          disabled={!data || rows.length === 0}
          onClick={exportCsv}
        >
          <Download className="h-4 w-4" />
          {t("time.exportCsv")}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-white/50">From</Label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-white/5 border-white/10 text-white w-[160px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-white/50">To</Label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="bg-white/5 border-white/10 text-white w-[160px]"
          />
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="border-white/10 text-white/60" onClick={() => presetMonth(0)}>
            This month
          </Button>
          <Button type="button" variant="outline" size="sm" className="border-white/10 text-white/60" onClick={() => presetMonth(1)}>
            Last month
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm text-white/60 pb-1">
          <Checkbox checked={approvedOnly} onCheckedChange={(v) => setApprovedOnly(v === true)} />
          {t("time.payrollApprovedOnly")}
        </label>
        {data?.vacationYearKey ? (
          <p className="text-xs text-white/40 pb-1 ml-auto">
            {t("time.payrollVacationYear")}: <span className="text-white/70">{data.vacationYearKey}</span>
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-300">{(error as Error).message}</p>
      ) : isLoading ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-white/40">{t("time.payrollNoData")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm text-left min-w-[1200px]">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03] text-xs uppercase tracking-wide text-white/40">
                <th className="px-3 py-2.5 font-medium">{t("time.reportColPerson")}</th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColNorm")}</th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColWork")}</th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColOvertime")}</th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColVacEarned")}</th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColVacUsed")}</th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColVacLeft")}</th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColExtraUsed")}</th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColExtraLeft")}</th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColCompLeft")}</th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColSick")}</th>
                <th className="px-3 py-2.5 font-medium">{t("time.payrollColApproved")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.personId} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-3 py-2 text-white">{p.personName}</td>
                  <td className="px-3 py-2 tabular-nums text-white/70">
                    {p.weeklyContractHours != null ? `${p.weeklyContractHours}h` : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-white/70">{fmtMins(p.workMinutes)}</td>
                  <td className="px-3 py-2 tabular-nums text-white/70">
                    {p.overtimeMinutes != null ? fmtMins(p.overtimeMinutes) : "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-emerald-300/80">{fmtDays(p.vacationEarnedDays)}</td>
                  <td className="px-3 py-2 tabular-nums text-white/70">{fmtDays(p.vacationUsedDays)}</td>
                  <td
                    className={cn(
                      "px-3 py-2 tabular-nums",
                      p.vacationRemainingDays < 0 ? "text-red-300" : "text-emerald-300/80"
                    )}
                  >
                    {fmtDays(p.vacationRemainingDays)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-white/70">{fmtDays(p.extraVacationUsedDays)}</td>
                  <td className="px-3 py-2 tabular-nums text-teal-300/80">{fmtDays(p.extraVacationRemainingDays)}</td>
                  <td className="px-3 py-2 tabular-nums text-cyan-300/80">{fmtMins(p.compTimeRemainingMinutes)}</td>
                  <td className="px-3 py-2 tabular-nums text-orange-300/80">{fmtDays(p.sickDays)}</td>
                  <td className="px-3 py-2 text-white/50">{p.timesheetApproved ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
