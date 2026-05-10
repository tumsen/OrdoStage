import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
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
  allowanceType: "standard" | "tour_driver_denmark" | "tour_driver_abroad";
  timeProjectId: string;
  breakfastProvided: boolean;
  lunchProvided: boolean;
  dinnerProvided: boolean;
  lodgingAllowance: boolean;
  lodgingCovered: boolean;
  foodCoveredByReceipts: boolean;
  notes: string;
};

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
    return {
      startsAt: toDatetimeLocalValue(start),
      endsAt: toDatetimeLocalValue(end),
      destination: "",
      purpose: "",
      allowanceType: "standard",
      timeProjectId: "__none__",
      breakfastProvided: false,
      lunchProvided: false,
      dinnerProvided: false,
      lodgingAllowance: false,
      lodgingCovered: false,
      foodCoveredByReceipts: false,
      notes: "",
    };
  });

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
      allowanceType: draft.allowanceType,
      timeProjectId: draft.timeProjectId === "__none__" ? null : draft.timeProjectId,
      breakfastProvided: draft.breakfastProvided,
      lunchProvided: draft.lunchProvided,
      dinnerProvided: draft.dinnerProvided,
      lodgingAllowance: draft.lodgingAllowance,
      lodgingCovered: draft.lodgingCovered,
      foodCoveredByReceipts: draft.foodCoveredByReceipts,
      notes: draft.notes.trim() || null,
    });
  }

  const total = (claims ?? []).reduce((sum, claim) => sum + claim.totalAmountCents, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Travel allowance</h3>
            <p className="mt-1 text-xs text-white/45">
              Danish tax-free travel allowance for trips of at least 24 hours. Time tracking remains the source for actual worked hours.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wide text-white/35">Range total</p>
            <p className="text-sm font-semibold text-white">{money(total)}</p>
          </div>
        </div>

        {canEdit ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="grid gap-3 sm:grid-cols-2">
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
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-white/50">Purpose</Label>
                <Textarea
                  value={draft.purpose}
                  onChange={(e) => setDraft((d) => ({ ...d, purpose: e.target.value }))}
                  placeholder="Work purpose and temporary workplace"
                  className="mt-1 min-h-20 border-white/10 bg-white/5 text-white"
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["breakfastProvided", "Breakfast provided"],
                  ["lunchProvided", "Lunch provided"],
                  ["dinnerProvided", "Dinner provided"],
                  ["foodCoveredByReceipts", "Meals by receipts"],
                  ["lodgingAllowance", "Claim lodging allowance"],
                  ["lodgingCovered", "Lodging covered/free"],
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
            <div key={claim.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-white">{claim.destination}</p>
                  <p className="mt-0.5 text-xs text-white/45">
                    {format(parseISO(claim.startsAt), "d MMM yyyy HH:mm")} - {format(parseISO(claim.endsAt), "d MMM yyyy HH:mm")}
                  </p>
                  <p className="mt-2 text-sm text-white/70">{claim.purpose}</p>
                  {claim.notes ? <p className="mt-1 text-xs text-white/45">{claim.notes}</p> : null}
                </div>
                <div className="flex items-start gap-2">
                  <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-right">
                    <p className="text-[10px] uppercase tracking-wide text-white/35">Total</p>
                    <p className="text-sm font-semibold text-white">{money(claim.totalAmountCents)}</p>
                    <p className="mt-1 text-[10px] text-white/40">
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
