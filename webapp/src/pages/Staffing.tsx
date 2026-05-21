import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { AlertTriangle, Clock, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { StaffingJobCard } from "@/components/staffing/StaffingJobCard";
import { DateInputWithWeekday } from "@/components/DateInputWithWeekday";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { isStaffingRequirementFilled } from "@/lib/eventShowStaffing";
import type { StaffingRequirementRow } from "@/lib/staffingPageContext";
import { cn } from "@/lib/utils";
import type { Person } from "@/lib/types";

type StaffingPerson = {
  id: string;
  name: string;
  email: string | null;
  planned: number;
  actual: number;
  conflicts: number;
  jobs: number;
};

type StaffingResponse = {
  people: StaffingPerson[];
  requirements: StaffingRequirementRow[];
  summary: {
    total: number;
    unassigned: number;
    conflicts: number;
    plannedMinutes: number;
    actualMinutes: number;
  };
};

function toIsoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function dateFromIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d : null;
}

function hours(minutes: number): string {
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}

export default function Staffing() {
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [listMode, setListMode] = useState<"upcoming" | "range">("upcoming");
  const [personFilter, setPersonFilter] = useState("all");
  const rangeFrom = toIsoDate(anchor);
  const rangeTo = toIsoDate(addDays(anchor, 13));

  const { data, isLoading } = useQuery({
    queryKey: ["staffing", listMode, rangeFrom, rangeTo],
    queryFn: () =>
      listMode === "upcoming"
        ? api.get<StaffingResponse>(`/api/staffing?mode=upcoming&from=${rangeFrom}&limit=250`)
        : api.get<StaffingResponse>(`/api/staffing?from=${rangeFrom}&to=${rangeTo}`),
  });

  const { data: roster = [] } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<Person[]>("/api/people"),
  });

  const people = data?.people ?? [];
  const allRequirements = useMemo(() => data?.requirements ?? [], [data?.requirements]);
  const summaryCards: Array<{ label: string; value: string | number; icon: LucideIcon }> = [
    { label: "Requirements", value: data?.summary.total ?? 0, icon: Users },
    { label: "Unassigned", value: data?.summary.unassigned ?? 0, icon: AlertTriangle },
    { label: "Conflicts", value: data?.summary.conflicts ?? 0, icon: AlertTriangle },
    {
      label: "Planned / actual",
      value: `${hours(data?.summary.plannedMinutes ?? 0)} / ${hours(data?.summary.actualMinutes ?? 0)}`,
      icon: Clock,
    },
  ];
  const requirements = useMemo(() => {
    if (personFilter === "all") return allRequirements;
    if (personFilter === "unassigned") {
      return allRequirements.filter((r) => !isStaffingRequirementFilled(r));
    }
    if (personFilter === "conflicts") return allRequirements.filter((r) => r.hasConflict);
    return allRequirements.filter((r) => r.personIds.includes(personFilter) || r.slotPersonIds.includes(personFilter));
  }, [allRequirements, personFilter]);

  return (
    <div className="app-page-fill md:app-page-fill flex flex-col gap-4 p-4 md:p-6 max-md:app-page-fill-mobile">
      <div className="shrink-0 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Staffing</h1>
          <p className="mt-1 text-sm text-white/45">
            Expand a job to assign people here, or open it in the event for full job settings.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-white/10 bg-white/[0.04] p-0.5">
            <button
              type="button"
              onClick={() => setListMode("upcoming")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                listMode === "upcoming" ? "bg-white/10 text-white" : "text-white/55"
              )}
            >
              Upcoming list
            </button>
            <button
              type="button"
              onClick={() => setListMode("range")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                listMode === "range" ? "bg-white/10 text-white" : "text-white/55"
              )}
            >
              Date range
            </button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/15 text-white"
            onClick={() => setAnchor((d) => addDays(d, -14))}
            disabled={listMode === "upcoming"}
          >
            Previous
          </Button>
          <DateInputWithWeekday
            value={rangeFrom}
            onChange={(value) => {
              const next = dateFromIsoDate(value);
              if (next) setAnchor(next);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/15 text-white"
            onClick={() => setAnchor((d) => addDays(d, 14))}
            disabled={listMode === "upcoming"}
          >
            Next
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-white/50 hover:text-white"
            onClick={() => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              setAnchor(today);
            }}
          >
            Today
          </Button>
          <Select value={personFilter} onValueChange={setPersonFilter}>
            <SelectTrigger className="w-[220px] border-white/10 bg-white/5 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72 border-white/10 bg-[#16161f] text-white">
              <SelectItem value="all">All requirements</SelectItem>
              <SelectItem value="unassigned">Unassigned only</SelectItem>
              <SelectItem value="conflicts">Conflicts only</SelectItem>
              {people.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-wide text-white/35">{label}</p>
              <Icon className="h-4 w-4 text-white/35" />
            </div>
            <p className="mt-2 text-lg font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[1fr_20rem]">
        <div className="min-h-0 overflow-auto rounded-xl border border-white/10 bg-white/[0.02] p-3">
          {isLoading ? (
            <div className="p-6 text-sm text-white/45">Loading staffing...</div>
          ) : requirements.length === 0 ? (
            <div className="p-6 text-sm text-white/45">
              {listMode === "upcoming"
                ? "No upcoming staffing requirements."
                : "No staffing requirements in this range."}
            </div>
          ) : (
            <div className="space-y-2">
              {listMode === "upcoming" ? (
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/45">
                  Showing the next {requirements.length} job assignments from {format(anchor, "d MMM yyyy")} onward.
                  Expand a row to assign people.
                </div>
              ) : null}
              {requirements.map((req) => (
                <StaffingJobCard
                  key={req.id}
                  req={req}
                  allRequirements={allRequirements}
                  roster={roster}
                  defaultOpen={!isStaffingRequirementFilled(req)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 overflow-auto rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <h2 className="text-sm font-semibold text-white">People availability</h2>
          <p className="mt-1 text-xs text-white/40">Planned workload and conflicts in the selected period.</p>
          <div className="mt-3 space-y-2">
            {people.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => setPersonFilter(person.id)}
                className={cn(
                  "w-full rounded-lg border p-3 text-left transition hover:bg-white/[0.04]",
                  person.conflicts > 0 ? "border-red-400/35 bg-red-500/8" : "border-white/10 bg-white/[0.02]"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-white">{person.name}</p>
                  <span className="text-xs text-white/45">{person.jobs} jobs</span>
                </div>
                <p className="mt-1 text-xs text-white/45">
                  Planned {hours(person.planned)} · Actual {hours(person.actual)}
                </p>
                {person.conflicts > 0 ? (
                  <p className="mt-1 text-xs font-medium text-red-200">{person.conflicts} overlapping assignment(s)</p>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
