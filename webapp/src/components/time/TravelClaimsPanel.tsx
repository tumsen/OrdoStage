import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { TravelDayMealsTable, type TravelDayLine } from "@/components/time/TravelDayMealsTable";
import { travelDurationHours } from "@/lib/danishTravelAllowance";
import type { TimeProject, TimeTravelClaim } from "@/contracts/backendTypes";

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function money(cents: number): string {
  return `${(cents / 100).toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.`;
}

type TravelDraft = {
  startsAt: string;
  endsAt: string;
  destination: string;
  purpose: string;
  country: "DK";
  allowanceType: "standard" | "tour_driver_denmark" | "tour_driver_abroad";
  timeProjectId: string;
  lodgingAllowance: boolean;
  lodgingCovered: boolean;
  foodCoveredByReceipts: boolean;
  transportsPeopleOrGoods: boolean;
  lodgingByReceipt: boolean;
  dayLines: TravelDayLine[];
  notes: string;
};

/** Employer handles SKAT eligibility; we always calculate as a standard eligible trip. */
const TRAVEL_ELIGIBILITY_DEFAULTS = {
  isTemporaryWorkplace: true,
  hasUsualResidence: true,
  overnightAwayFromHome: true,
  cannotReturnHome: true,
  twelveMonthRuleOk: true,
  salaryReductionAgreement: false,
  receivesBIncome: false,
  excludedWorkerType: false,
} as const;

function hasValidTravelTimeframe(startsAt: string, endsAt: string): boolean {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

function isoDateLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function travelDates(startsAt: string, endsAt: string): string[] {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);
  const dates: string[] = [];
  while (cursor <= endDay && dates.length < 370) {
    dates.push(isoDateLocal(cursor));
    cursor.setTime(addDays(cursor, 1).getTime());
  }
  return dates;
}

function makeDayLine(date: string, existing?: TravelDayLine): TravelDayLine {
  return {
    date,
    city: existing?.city ?? "",
    hotel: existing?.hotel ?? "",
    breakfastProvided: existing?.breakfastProvided ?? false,
    lunchProvided: existing?.lunchProvided ?? false,
    dinnerProvided: existing?.dinnerProvided ?? false,
    lodgingCovered: existing?.lodgingCovered ?? false,
    lodgingByReceipt: existing?.lodgingByReceipt ?? false,
  };
}

export function TravelClaimsPanel({
  rangeFrom,
  rangeTo,
  personQuery,
  canEdit,
  projects,
}: {
  rangeFrom: string;
  rangeTo: string;
  personQuery: string;
  canEdit: boolean;
  projects: TimeProject[];
}) {
  const queryClient = useQueryClient();
  const queryKey = ["time-travel-claims", rangeFrom, rangeTo, personQuery];
  const now = useMemo(() => new Date(), []);
  const [draft, setDraft] = useState<TravelDraft>(() => {
    const start = new Date(now);
    start.setHours(8, 0, 0, 0);
    const end = new Date(start.getTime() + 26 * 60 * 60_000);
    const startsAt = toDatetimeLocalValue(start);
    const endsAt = toDatetimeLocalValue(end);
    return {
      startsAt,
      endsAt,
      destination: "",
      purpose: "",
      country: "DK",
      allowanceType: "standard",
      timeProjectId: "__none__",
      lodgingAllowance: false,
      lodgingCovered: false,
      foodCoveredByReceipts: false,
      transportsPeopleOrGoods: false,
      lodgingByReceipt: false,
      dayLines: travelDates(startsAt, endsAt).map((date) => makeDayLine(date)),
      notes: "",
    };
  });

  useEffect(() => {
    setDraft((current) => {
      const dates = travelDates(current.startsAt, current.endsAt);
      const byDate = new Map(current.dayLines.map((line) => [line.date, line]));
      const nextLines = dates.map((date) => makeDayLine(date, byDate.get(date)));
      const unchanged =
        nextLines.length === current.dayLines.length &&
        nextLines.every((line, idx) => line.date === current.dayLines[idx]?.date);
      return unchanged ? current : { ...current, dayLines: nextLines };
    });
  }, [draft.startsAt, draft.endsAt]);

  const { data: claims } = useQuery({
    queryKey,
    queryFn: () =>
      api.get<TimeTravelClaim[]>(`/api/time/travel-claims?from=${rangeFrom}&to=${rangeTo}${personQuery}`),
  });

  const createClaim = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<TimeTravelClaim>("/api/time/travel-claims", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-travel-claims"] });
      toast({ title: "Travel claim created" });
    },
    onError: () => toast({ title: "Could not save travel claim", variant: "destructive" }),
  });

  const deleteClaim = useMutation({
    mutationFn: (id: string) => api.delete(`/api/time/travel-claims/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-travel-claims"] });
      toast({ title: "Travel claim deleted" });
    },
    onError: () => toast({ title: "Could not delete travel claim", variant: "destructive" }),
  });

  function submit() {
    if (!draft.destination.trim() || !draft.purpose.trim()) {
      toast({ title: "Destination and purpose are required", variant: "destructive" });
      return;
    }
    createClaim.mutate({
      startsAt: new Date(draft.startsAt).toISOString(),
      endsAt: new Date(draft.endsAt).toISOString(),
      destination: draft.destination.trim(),
      purpose: draft.purpose.trim(),
      country: draft.country,
      allowanceType: draft.allowanceType,
      timeProjectId: draft.timeProjectId === "__none__" ? null : draft.timeProjectId,
      breakfastProvided: draft.dayLines.some((line) => line.breakfastProvided),
      lunchProvided: draft.dayLines.some((line) => line.lunchProvided),
      dinnerProvided: draft.dayLines.some((line) => line.dinnerProvided),
      lodgingAllowance: draft.lodgingAllowance,
      lodgingCovered: draft.lodgingCovered,
      foodCoveredByReceipts: draft.foodCoveredByReceipts,
      ...TRAVEL_ELIGIBILITY_DEFAULTS,
      transportsPeopleOrGoods: draft.transportsPeopleOrGoods,
      lodgingByReceipt: draft.lodgingByReceipt,
      dayLines: draft.dayLines,
      notes: draft.notes.trim() || null,
    });
  }

  const total = (claims ?? []).reduce((sum, claim) => sum + claim.totalAmountCents, 0);
  const timeframeSet = hasValidTravelTimeframe(draft.startsAt, draft.endsAt);
  const allowanceHours = travelDurationHours(
    new Date(draft.startsAt).getTime(),
    new Date(draft.endsAt).getTime()
  );
  const canClaimLodging =
    draft.allowanceType === "standard" && !draft.transportsPeopleOrGoods && !draft.lodgingByReceipt;
  const updateDayLine = (date: string, patch: Partial<TravelDayLine>) =>
    setDraft((d) => ({
      ...d,
      dayLines: d.dayLines.map((line) => (line.date === date ? { ...line, ...patch } : line)),
    }));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Travel allowance</h3>
            <p className="mt-1 text-xs text-white/45">
              Register travel and employer-covered meals. Amounts use current Danish rates and your day-by-day input.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wide text-white/35">Range total</p>
            <p className="text-sm font-semibold text-white">{money(total)}</p>
          </div>
        </div>

        {canEdit ? (
          <div className="mt-4 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:max-w-xl">
              <div>
                <Label className="text-xs text-white/50">Start</Label>
                <Input
                  type="datetime-local"
                  value={draft.startsAt}
                  onChange={(e) => setDraft((d) => ({ ...d, startsAt: e.target.value }))}
                  className="mt-1 border-white/10 bg-white/5 text-white"
                />
              </div>
              <div>
                <Label className="text-xs text-white/50">End</Label>
                <Input
                  type="datetime-local"
                  value={draft.endsAt}
                  onChange={(e) => setDraft((d) => ({ ...d, endsAt: e.target.value }))}
                  className="mt-1 border-white/10 bg-white/5 text-white"
                />
              </div>
            </div>

            {!timeframeSet ? (
              <p className="text-[11px] text-white/35">Set start and end to list travel days and employer-covered meals.</p>
            ) : allowanceHours < 24 ? (
              <p className="rounded-md border border-amber-400/20 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100">
                Rejsen skal vare mindst 24 timer for at udløse diæt.
              </p>
            ) : (
              <TravelDayMealsTable
                dayLines={draft.dayLines}
                allowanceType={draft.allowanceType}
                allowanceHours={allowanceHours}
                foodCoveredByReceipts={draft.foodCoveredByReceipts}
                onUpdateLine={updateDayLine}
              />
            )}

            <div className="grid gap-3 lg:grid-cols-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-white/50">Destination</Label>
                <Input
                  value={draft.destination}
                  onChange={(e) => setDraft((d) => ({ ...d, destination: e.target.value }))}
                  placeholder="City / venue"
                  className="mt-1 border-white/10 bg-white/5 text-white"
                />
              </div>
              <div>
                <Label className="text-xs text-white/50">Allowance type</Label>
                <Select
                  value={draft.allowanceType}
                  onValueChange={(allowanceType) =>
                    setDraft((d) => ({ ...d, allowanceType: allowanceType as TravelDraft["allowanceType"] }))
                  }
                >
                  <SelectTrigger className="mt-1 border-white/10 bg-white/5 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#16161f] text-white">
                    <SelectItem value="standard">Standard meals</SelectItem>
                    <SelectItem value="tour_driver_denmark">Tour driver Denmark</SelectItem>
                    <SelectItem value="tour_driver_abroad">Tour driver abroad</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs text-white/50">Rule set</Label>
                <Select
                  value={draft.country}
                  onValueChange={(country) => setDraft((d) => ({ ...d, country: country as TravelDraft["country"] }))}
                >
                  <SelectTrigger className="mt-1 border-white/10 bg-white/5 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#16161f] text-white">
                    <SelectItem value="DK">Denmark - SKAT travel allowance rules</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-white/40">
                  Denmark is the first country rule set. Other country-specific travel and vacation rules can be added here later.
                </p>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs text-white/50">Project / event</Label>
                <Select
                  value={draft.timeProjectId}
                  onValueChange={(timeProjectId) => setDraft((d) => ({ ...d, timeProjectId }))}
                >
                  <SelectTrigger className="mt-1 border-white/10 bg-white/5 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 border-white/10 bg-[#16161f] text-white">
                    <SelectItem value="__none__">No project</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <Label className="text-xs text-white/50">Purpose</Label>
                <Textarea
                  value={draft.purpose}
                  onChange={(e) => setDraft((d) => ({ ...d, purpose: e.target.value }))}
                  placeholder="What was this trip for?"
                  className="mt-1 min-h-20 border-white/10 bg-white/5 text-white"
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["foodCoveredByReceipts", "Meals by receipts"],
                  ["lodgingAllowance", "Claim lodging allowance"],
                  ["lodgingByReceipt", "All lodging by receipt"],
                  ["transportsPeopleOrGoods", "Transports people/goods"],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-xs text-white/65">
                    <Checkbox
                      checked={Boolean(draft[key as keyof TravelDraft])}
                      onCheckedChange={(checked) =>
                        setDraft((d) => ({ ...d, [key]: checked === true }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              {!canClaimLodging && draft.lodgingAllowance ? (
                <p className="rounded-md border border-amber-400/20 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100">
                  Lodging allowance is not combined with tour-driver rates, transport of people/goods, or receipt-based lodging.
                </p>
              ) : null}
              <Textarea
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                placeholder="Notes / documentation"
                className="min-h-16 border-white/10 bg-white/5 text-white"
              />
              <Button type="button" onClick={submit} disabled={createClaim.isPending}>
                Add travel claim
              </Button>
            </div>
          </div>
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            This period is approved or read-only. Ask an admin to reopen it before changing travel claims.
          </p>
        )}
      </div>

      <div className="space-y-2">
        {(claims ?? []).length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/40">
            No travel claims in this range.
          </div>
        ) : (
          (claims ?? []).map((claim) => (
            <div key={claim.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{claim.destination}</p>
                  <p className="mt-0.5 text-[11px] text-white/45">
                    {format(parseISO(claim.startsAt), "d MMM yyyy HH:mm")} –{" "}
                    {format(parseISO(claim.endsAt), "d MMM yyyy HH:mm")}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-white/65">{claim.purpose}</p>
                  {claim.notes ? (
                    <p className="mt-1 line-clamp-2 text-[11px] text-white/40">{claim.notes}</p>
                  ) : null}
                  <p className="mt-1.5 text-[10px] text-white/35 leading-snug">
                    Rate year {claim.rateYear} · Meals {money(claim.foodRateCents)}/day · Lodging{" "}
                    {money(claim.lodgingRateCents)}/day
                  </p>
                  {claim.totalAmountCents === 0 ? (
                    <p className="mt-1 text-[10px] text-amber-200/80 leading-snug">
                      Calculated as 0 — check trip length, meals covered, and allowance options.
                    </p>
                  ) : null}
                  {claim.dayLines.length > 0 ? (
                    <div className="mt-2 overflow-x-auto rounded-md border border-white/10">
                      <table className="w-full min-w-[28rem] border-collapse text-left text-[11px]">
                        <thead>
                          <tr className="border-b border-white/10 bg-black/25 text-[10px] font-medium uppercase tracking-wide text-white/40">
                            <th className="whitespace-nowrap px-2 py-1">Date</th>
                            <th className="min-w-[5rem] px-1 py-1">City</th>
                            <th className="min-w-[5rem] px-1 py-1">Hotel</th>
                            <th className="px-2 py-1">Covered</th>
                          </tr>
                        </thead>
                        <tbody>
                          {claim.dayLines.map((line) => {
                            const covered = [
                              line.breakfastProvided ? "B" : null,
                              line.lunchProvided ? "L" : null,
                              line.dinnerProvided ? "D" : null,
                              line.lodgingCovered ? "H" : null,
                              line.lodgingByReceipt ? "R" : null,
                            ].filter(Boolean);
                            return (
                              <tr key={line.date} className="border-t border-white/10 text-white/65">
                                <td className="whitespace-nowrap px-2 py-0.5 tabular-nums">
                                  {format(parseISO(line.date), "EEE d MMM")}
                                </td>
                                <td className="max-w-[10rem] truncate px-1 py-0.5">{line.city || "—"}</td>
                                <td className="max-w-[10rem] truncate px-1 py-0.5">{line.hotel || "—"}</td>
                                <td className="px-2 py-0.5 text-white/50">
                                  {covered.length > 0 ? covered.join(" ") : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-start gap-2">
                  <div className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-right">
                    <p className="text-[9px] uppercase tracking-wide text-white/35">Total</p>
                    <p className="text-sm font-semibold text-white">{money(claim.totalAmountCents)}</p>
                    <p className="mt-0.5 text-[9px] text-white/40 leading-tight">
                      Meals {money(claim.foodAmountCents)} · Lodging {money(claim.lodgingAmountCents)}
                    </p>
                  </div>
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-white/45 hover:text-red-200"
                      onClick={() => deleteClaim.mutate(claim.id)}
                      disabled={deleteClaim.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
