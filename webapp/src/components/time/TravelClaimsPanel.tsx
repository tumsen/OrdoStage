import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { ChevronDown, ChevronRight, Lock, Plus, Trash2 } from "lucide-react";

import { AutoSaveStatus } from "@/components/AutoSaveStatus";
import { TravelDayMealsTable, type TravelDayLine } from "@/components/time/TravelDayMealsTable";
import { lodgingPlaceDisplayLabel } from "@/components/LodgingPlaceAutocomplete";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TimeProject, TimeTravelClaim } from "@/contracts/backendTypes";
import { useAutoSave, type AutoSaveStatus as AutoSaveStatusType } from "@/hooks/useAutoSave";
import { toast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { travelDurationHours } from "@/lib/danishTravelAllowance";

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

const DEFAULT_ALLOWANCE_TYPE = "standard" as const;
const DEFAULT_COUNTRY = "DK";

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

function makeDayLine(date: string, existing?: TravelDayLine, inheritTimeProjectId = "__none__"): TravelDayLine {
  return {
    date,
    city: existing?.city ?? "",
    hotel: existing?.hotel ?? "",
    lodgingPlaceId: existing?.lodgingPlaceId ?? "",
    lodgingLabel: existing?.lodgingLabel ?? "",
    breakfastProvided: existing?.breakfastProvided ?? false,
    lunchProvided: existing?.lunchProvided ?? false,
    dinnerProvided: existing?.dinnerProvided ?? false,
    lodgingCovered: existing?.lodgingCovered ?? false,
    lodgingByReceipt: existing?.lodgingByReceipt ?? false,
    timeProjectId: existing?.timeProjectId ?? inheritTimeProjectId,
  };
}

function serializeDayLinesForApi(dayLines: TravelDayLine[]) {
  return dayLines.map((line) => ({
    ...line,
    timeProjectId: line.timeProjectId === "__none__" ? null : line.timeProjectId,
  }));
}

function createEmptyDraft(base = new Date()): TravelDraft {
  const start = new Date(base);
  start.setHours(8, 0, 0, 0);
  const end = new Date(start.getTime() + 26 * 60 * 60_000);
  const startsAt = toDatetimeLocalValue(start);
  const endsAt = toDatetimeLocalValue(end);
  return {
    startsAt,
    endsAt,
    lodgingAllowance: false,
    lodgingCovered: false,
    foodCoveredByReceipts: false,
    transportsPeopleOrGoods: false,
    lodgingByReceipt: false,
    dayLines: travelDates(startsAt, endsAt).map((date) => makeDayLine(date)),
    notes: "",
  };
}

function claimToDraft(claim: TimeTravelClaim): TravelDraft {
  return {
    startsAt: toDatetimeLocalValue(new Date(claim.startsAt)),
    endsAt: toDatetimeLocalValue(new Date(claim.endsAt)),
    lodgingAllowance: claim.lodgingAllowance,
    lodgingCovered: claim.lodgingCovered,
    foodCoveredByReceipts: claim.foodCoveredByReceipts,
    transportsPeopleOrGoods: claim.transportsPeopleOrGoods,
    lodgingByReceipt: claim.lodgingByReceipt,
    dayLines: claim.dayLines.map((line) =>
      makeDayLine(line.date, {
        ...line,
        lodgingLabel: line.lodgingLabel || lodgingPlaceDisplayLabel(line),
        timeProjectId: line.timeProjectId ?? "__none__",
      })
    ),
    notes: claim.notes ?? "",
  };
}

function buildClaimBody(draft: TravelDraft) {
  const primaryProjectId = draft.dayLines[0]?.timeProjectId;
  return {
    startsAt: new Date(draft.startsAt).toISOString(),
    endsAt: new Date(draft.endsAt).toISOString(),
    country: DEFAULT_COUNTRY,
    allowanceType: DEFAULT_ALLOWANCE_TYPE,
    timeProjectId: primaryProjectId && primaryProjectId !== "__none__" ? primaryProjectId : null,
    breakfastProvided: draft.dayLines.some((line) => line.breakfastProvided),
    lunchProvided: draft.dayLines.some((line) => line.lunchProvided),
    dinnerProvided: draft.dayLines.some((line) => line.dinnerProvided),
    lodgingAllowance: draft.lodgingAllowance,
    lodgingCovered: draft.lodgingCovered,
    foodCoveredByReceipts: draft.foodCoveredByReceipts,
    ...TRAVEL_ELIGIBILITY_DEFAULTS,
    transportsPeopleOrGoods: draft.transportsPeopleOrGoods,
    lodgingByReceipt: draft.lodgingByReceipt,
    dayLines: serializeDayLinesForApi(draft.dayLines),
    notes: draft.notes.trim() || null,
  };
}

function formatClaimRange(startsAt: string, endsAt: string): string {
  return `${format(parseISO(startsAt), "d MMM yyyy HH:mm")} – ${format(parseISO(endsAt), "d MMM yyyy HH:mm")}`;
}

function linkedProjectNames(
  claim: { timeProjectId: string | null; dayLines: { timeProjectId?: string | null }[] },
  projectById: Map<string, TimeProject>
): string[] {
  const ids = new Set<string>();
  if (claim.timeProjectId) ids.add(claim.timeProjectId);
  for (const line of claim.dayLines) {
    if (line.timeProjectId) ids.add(line.timeProjectId);
  }
  return [...ids]
    .map((id) => projectById.get(id)?.name)
    .filter((name): name is string => Boolean(name));
}

function TravelClaimCollapsedMeta({
  projectNames,
  totalCents,
}: {
  projectNames: string[];
  totalCents: number | null;
}) {
  return (
    <div className="mt-1 space-y-0.5">
      <p className="text-[11px] text-white/50">
        {projectNames.length > 0 ? projectNames.join(" · ") : "Ingen projekt tilknyttet"}
      </p>
      {totalCents !== null ? (
        <p className="text-[11px] font-medium tabular-nums text-white/80">{money(totalCents)}</p>
      ) : null}
    </div>
  );
}

function useSyncedDayLines(
  draft: TravelDraft,
  setDraft: React.Dispatch<React.SetStateAction<TravelDraft>>,
  enabled = true
) {
  useEffect(() => {
    if (!enabled) return;
    setDraft((current) => {
      const dates = travelDates(current.startsAt, current.endsAt);
      const byDate = new Map(current.dayLines.map((line) => [line.date, line]));
      const inheritTimeProjectId = current.dayLines[0]?.timeProjectId ?? "__none__";
      const nextLines = dates.map((date) => makeDayLine(date, byDate.get(date), inheritTimeProjectId));
      const unchanged =
        nextLines.length === current.dayLines.length &&
        nextLines.every((line, idx) => line.date === current.dayLines[idx]?.date);
      return unchanged ? current : { ...current, dayLines: nextLines };
    });
  }, [draft.startsAt, draft.endsAt, setDraft, enabled]);
}

function TravelClaimForm({
  draft,
  setDraft,
  projects,
  readOnly = false,
}: {
  draft: TravelDraft;
  setDraft: React.Dispatch<React.SetStateAction<TravelDraft>>;
  projects: TimeProject[];
  readOnly?: boolean;
}) {
  useSyncedDayLines(draft, setDraft, !readOnly);

  const timeframeSet = hasValidTravelTimeframe(draft.startsAt, draft.endsAt);
  const allowanceHours = travelDurationHours(
    new Date(draft.startsAt).getTime(),
    new Date(draft.endsAt).getTime()
  );
  const canClaimLodging = !draft.transportsPeopleOrGoods && !draft.lodgingByReceipt;

  const updateDayLine = (date: string, patch: Partial<TravelDayLine>) =>
    setDraft((d) => {
      const isFirstDay = d.dayLines[0]?.date === date;
      const dayLines = d.dayLines.map((line) => {
        if (line.date === date) return { ...line, ...patch };
        if (isFirstDay && patch.timeProjectId !== undefined) {
          return { ...line, timeProjectId: patch.timeProjectId };
        }
        return line;
      });
      return { ...d, dayLines };
    });

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:max-w-xl">
        <div>
          <Label className="text-xs text-white/50">Start</Label>
          <Input
            type="datetime-local"
            value={draft.startsAt}
            onChange={(e) => setDraft((d) => ({ ...d, startsAt: e.target.value }))}
            readOnly={readOnly}
            className="mt-1 border-white/10 bg-white/5 text-white read-only:cursor-default read-only:opacity-100"
          />
        </div>
        <div>
          <Label className="text-xs text-white/50">End</Label>
          <Input
            type="datetime-local"
            value={draft.endsAt}
            onChange={(e) => setDraft((d) => ({ ...d, endsAt: e.target.value }))}
            readOnly={readOnly}
            className="mt-1 border-white/10 bg-white/5 text-white read-only:cursor-default read-only:opacity-100"
          />
        </div>
      </div>

      {!timeframeSet ? (
        <p className="text-[11px] text-white/35">Set start and end to list travel days and employer-covered meals.</p>
      ) : allowanceHours < 24 ? (
        <p className="rounded-md border border-amber-400/20 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-100">
          Rejsen skal vare mindst 24 timer, før skattefri kostgodtgørelse kan udbetales (fx 20 timer giver ingen
          godtgørelse).
        </p>
      ) : (
        <TravelDayMealsTable
          dayLines={draft.dayLines}
          startsAt={new Date(draft.startsAt)}
          endsAt={new Date(draft.endsAt)}
          allowanceType={DEFAULT_ALLOWANCE_TYPE}
          allowanceHours={allowanceHours}
          foodCoveredByReceipts={draft.foodCoveredByReceipts}
          lodgingAllowance={draft.lodgingAllowance}
          lodgingByReceipt={draft.lodgingByReceipt}
          transportsPeopleOrGoods={draft.transportsPeopleOrGoods}
          projects={projects}
          onUpdateLine={updateDayLine}
          readOnly={readOnly}
          country={DEFAULT_COUNTRY.toLowerCase()}
        />
      )}

      <div className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["foodCoveredByReceipts", "Kost som udlæg efter regning"],
            ["lodgingAllowance", "Logigodtgørelse (268 kr./døgn)"],
            ["lodgingByReceipt", "Alt logi som udlæg efter regning"],
            ["transportsPeopleOrGoods", "Transporterer varer/personer"],
          ].map(([key, label]) => (
            <label
              key={key}
              className={`flex items-center gap-2 text-xs text-white/65 ${readOnly ? "cursor-default" : ""}`}
            >
              <Checkbox
                checked={Boolean(draft[key as keyof TravelDraft])}
                disabled={readOnly}
                onCheckedChange={(checked) => setDraft((d) => ({ ...d, [key]: checked === true }))}
              />
              {label}
            </label>
          ))}
        </div>
        {!readOnly && !canClaimLodging && draft.lodgingAllowance ? (
          <p className="rounded-md border border-amber-400/20 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100">
            Logigodtgørelse kan ikke kombineres med transport af varer/personer eller udlæg efter regning for logi.
          </p>
        ) : null}
        {!readOnly && !draft.lodgingAllowance && allowanceHours >= 24 && !draft.lodgingByReceipt ? (
          <p className="text-[11px] leading-snug text-white/40">
            Betaler du selv for overnatning uden kvitteringsudlæg, kan du få logigodtgørelse — markér «Logigodtgørelse»
            og lad logi-felterne i tabellen stå tomme.
          </p>
        ) : null}
        <div>
          <Label className="text-xs text-white/50">Notes</Label>
          <Textarea
            value={draft.notes}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            placeholder="Notes / documentation"
            readOnly={readOnly}
            className="mt-1 min-h-16 border-white/10 bg-white/5 text-white read-only:cursor-default read-only:opacity-100"
          />
        </div>
      </div>
    </div>
  );
}

function SavedTravelClaimCard({
  claim,
  expanded,
  onExpandedChange,
  locked,
  isEditing,
  editDraft,
  setEditDraft,
  projects,
  projectById,
  canEdit,
  onReopen,
  onCloseEdit,
  onDelete,
  isDeleting,
  autoSaveStatus,
  autoSaveError,
}: {
  claim: TimeTravelClaim;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  locked: boolean;
  isEditing: boolean;
  editDraft: TravelDraft | null;
  setEditDraft: React.Dispatch<React.SetStateAction<TravelDraft | null>>;
  projects: TimeProject[];
  projectById: Map<string, TimeProject>;
  canEdit: boolean;
  onReopen: () => void;
  onCloseEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  autoSaveStatus: AutoSaveStatusType;
  autoSaveError: string | null;
}) {
  const projectNames = linkedProjectNames(claim, projectById);
  const viewDraft = useMemo(() => claimToDraft(claim), [claim]);
  const noopSetDraft = useCallback((_value: React.SetStateAction<TravelDraft>) => {}, []);

  return (
    <Collapsible open={expanded} onOpenChange={onExpandedChange} className="rounded-xl border border-white/10 bg-white/[0.02]">
      <div className="flex flex-wrap items-start gap-2 p-3">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-1 py-0.5 text-left hover:bg-white/[0.04]"
          >
            {expanded ? (
              <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-white/45" />
            ) : (
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-white/45" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-white">{formatClaimRange(claim.startsAt, claim.endsAt)}</p>
                {locked && !isEditing ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/45">
                    <Lock className="h-3 w-3" />
                    Låst
                  </span>
                ) : null}
                {isEditing ? (
                  <span className="rounded-md border border-sky-400/25 bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-100">
                    Redigeres
                  </span>
                ) : null}
              </div>
              {!expanded ? (
                <TravelClaimCollapsedMeta projectNames={projectNames} totalCents={claim.totalAmountCents} />
              ) : claim.notes ? (
                <p className="mt-1 line-clamp-1 text-[11px] text-white/50">{claim.notes}</p>
              ) : null}
            </div>
          </button>
        </CollapsibleTrigger>
        <div className="flex shrink-0 items-start gap-2">
          {expanded ? (
            <div className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-right">
              <p className="text-[9px] uppercase tracking-wide text-white/35">Total</p>
              <p className="text-sm font-semibold text-white">{money(claim.totalAmountCents)}</p>
            </div>
          ) : null}
          {canEdit && locked && !isEditing ? (
            <Button type="button" variant="outline" size="sm" className="h-8 border-white/15 text-white hover:bg-white/10" onClick={onReopen}>
              Åbn til redigering
            </Button>
          ) : null}
          {canEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-white/45 hover:text-red-200"
              onClick={onDelete}
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <CollapsibleContent className="border-t border-white/10 px-3 pb-3 pt-3">
        {isEditing && editDraft ? (
          <div className="space-y-3">
            <TravelClaimForm
              draft={editDraft}
              setDraft={(value) =>
                setEditDraft((current) => {
                  if (!current) return current;
                  return typeof value === "function" ? value(current) : value;
                })
              }
              projects={projects}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <AutoSaveStatus status={autoSaveStatus} error={autoSaveError} />
              <Button type="button" variant="ghost" size="sm" className="text-white/50" onClick={onCloseEdit}>
                Luk redigering
              </Button>
            </div>
          </div>
        ) : (
          <TravelClaimForm draft={viewDraft} setDraft={noopSetDraft} projects={projects} readOnly />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
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
  const [expandedClaims, setExpandedClaims] = useState<Record<string, boolean>>({});
  const [editingClaimId, setEditingClaimId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TravelDraft | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const editingClaimIdRef = useRef(editingClaimId);
  const editDraftRef = useRef(editDraft);
  editingClaimIdRef.current = editingClaimId;
  editDraftRef.current = editDraft;

  const { data: claims } = useQuery({
    queryKey,
    queryFn: () =>
      api.get<TimeTravelClaim[]>(`/api/time/travel-claims?from=${rangeFrom}&to=${rangeTo}${personQuery}`),
  });

  const updateClaim = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<TimeTravelClaim>(`/api/time/travel-claims/${id}`, body),
  });

  const deleteClaim = useMutation({
    mutationFn: (id: string) => api.delete(`/api/time/travel-claims/${id}`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["time-travel-claims"] });
      if (editingClaimId === id) {
        setEditingClaimId(null);
        setEditDraft(null);
      }
      toast({ title: "Travel claim deleted" });
    },
    onError: () => toast({ title: "Could not delete travel claim", variant: "destructive" }),
  });

  const autoSave = useAutoSave({
    enabled: canEdit && editingClaimId !== null && editDraft !== null,
    resetKey: editingClaimId,
    getSnapshot: () => editDraftRef.current,
    save: async () => {
      const id = editingClaimIdRef.current;
      const draft = editDraftRef.current;
      if (!id || !draft || !hasValidTravelTimeframe(draft.startsAt, draft.endsAt)) return;
      const updated = await updateClaim.mutateAsync({ id, body: buildClaimBody(draft) });
      queryClient.setQueryData<TimeTravelClaim[]>(queryKey, (current) =>
        current ? current.map((claim) => (claim.id === updated.id ? updated : claim)) : current
      );
    },
  });

  const { schedule, flush, markSaved, status: autoSaveStatus, error: autoSaveError } = autoSave;

  useEffect(() => {
    if (editingClaimId && editDraft) {
      schedule();
    }
  }, [editDraft, editingClaimId, schedule]);

  async function closeEditing() {
    await flush();
    setEditingClaimId(null);
    setEditDraft(null);
    queryClient.invalidateQueries({ queryKey: ["time-travel-claims"] });
  }

  async function handleAddTravelClaim() {
    if (!canEdit || isAdding) return;
    setIsAdding(true);
    try {
      if (editingClaimId) {
        await closeEditing();
      }
      const created = await api.post<TimeTravelClaim>(
        "/api/time/travel-claims",
        buildClaimBody(createEmptyDraft())
      );
      queryClient.invalidateQueries({ queryKey: ["time-travel-claims"] });
      const draft = claimToDraft(created);
      setEditingClaimId(created.id);
      setEditDraft(draft);
      setExpandedClaims((current) => ({ ...current, [created.id]: true }));
      markSaved(draft);
    } catch {
      toast({ title: "Could not create travel claim", variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  }

  const total = (claims ?? []).reduce((sum, claim) => sum + claim.totalAmountCents, 0);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);

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
          <div className="flex flex-wrap items-start gap-2">
            {canEdit ? (
              <Button
                type="button"
                size="sm"
                className="h-9 bg-white text-black hover:bg-white/90"
                onClick={() => void handleAddTravelClaim()}
                disabled={isAdding}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add travel claim
              </Button>
            ) : null}
            <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-right">
              <p className="text-[10px] uppercase tracking-wide text-white/35">Range total</p>
              <p className="text-sm font-semibold text-white">{money(total)}</p>
            </div>
          </div>
        </div>

        {!canEdit ? (
          <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            This period is approved or read-only. Ask an admin to reopen it before changing travel claims.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        {(claims ?? []).length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/40">
            No travel claims in this range.
          </div>
        ) : (
          (claims ?? []).map((claim) => (
            <SavedTravelClaimCard
              key={claim.id}
              claim={claim}
              expanded={Boolean(expandedClaims[claim.id])}
              onExpandedChange={(open) => setExpandedClaims((current) => ({ ...current, [claim.id]: open }))}
              locked={editingClaimId !== claim.id}
              isEditing={editingClaimId === claim.id}
              editDraft={editingClaimId === claim.id ? editDraft : null}
              setEditDraft={setEditDraft}
              projects={projects}
              projectById={projectById}
              canEdit={canEdit}
              onReopen={() => {
                void (async () => {
                  if (editingClaimId && editingClaimId !== claim.id) {
                    await closeEditing();
                  }
                  setEditingClaimId(claim.id);
                  setEditDraft(claimToDraft(claim));
                  setExpandedClaims((current) => ({ ...current, [claim.id]: true }));
                })();
              }}
              onCloseEdit={() => void closeEditing()}
              onDelete={() => deleteClaim.mutate(claim.id)}
              isDeleting={deleteClaim.isPending}
              autoSaveStatus={editingClaimId === claim.id ? autoSaveStatus : "idle"}
              autoSaveError={editingClaimId === claim.id ? autoSaveError : null}
            />
          ))
        )}
      </div>
    </div>
  );
}
