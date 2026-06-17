import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Lock, Plus, Trash2 } from "lucide-react";

import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { AutoSaveStatus } from "@/components/AutoSaveStatus";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { TimeMileageClaim, TimeProject } from "@/contracts/backendTypes";
import { useAutoSave, type AutoSaveStatus as AutoSaveStatusType } from "@/hooks/useAutoSave";
import { toast } from "@/hooks/use-toast";
import { api, isApiError } from "@/lib/api";
import {
  CAR_KM_YEAR_LIMIT,
  computeMileagePayout,
  describeMileagePayout,
  formatKrPerKm,
  formatMoneyDkk,
  SKAT_MILEAGE_RATE_SUMMARY,
  SKAT_MILEAGE_URL,
  type MileageVehicleType,
} from "@/lib/danishMileageAllowance";

type MileageDraft = {
  tripDate: string;
  fromPlace: string;
  toPlace: string;
  purpose: string;
  vehicleType: MileageVehicleType;
  distanceKm: string;
  timeProjectId: string;
  salaryReductionAgreement: boolean;
  receivesBIncome: boolean;
  notes: string;
};

function money(cents: number): string {
  return formatMoneyDkk(cents);
}

function createEmptyMileageDraft(base = new Date()): MileageDraft {
  const pad = (n: number) => String(n).padStart(2, "0");
  const tripDate = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
  return {
    tripDate,
    fromPlace: "",
    toPlace: "",
    purpose: "",
    vehicleType: "car",
    distanceKm: "",
    timeProjectId: "__none__",
    salaryReductionAgreement: false,
    receivesBIncome: false,
    notes: "",
  };
}

function claimToDraft(claim: TimeMileageClaim): MileageDraft {
  return {
    tripDate: claim.tripDate.slice(0, 10),
    fromPlace: claim.fromPlace,
    toPlace: claim.toPlace,
    purpose: claim.purpose,
    vehicleType: claim.vehicleType,
    distanceKm: String(claim.distanceKm),
    timeProjectId: claim.timeProjectId ?? "__none__",
    salaryReductionAgreement: claim.salaryReductionAgreement,
    receivesBIncome: claim.receivesBIncome,
    notes: claim.notes ?? "",
  };
}

function parseDistanceKm(value: string): number {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function buildClaimBody(draft: MileageDraft) {
  return {
    tripDate: draft.tripDate,
    fromPlace: draft.fromPlace.trim(),
    toPlace: draft.toPlace.trim(),
    purpose: draft.purpose.trim(),
    country: "DK",
    vehicleType: draft.vehicleType,
    distanceKm: parseDistanceKm(draft.distanceKm),
    salaryReductionAgreement: draft.salaryReductionAgreement,
    receivesBIncome: draft.receivesBIncome,
    timeProjectId: draft.timeProjectId === "__none__" ? null : draft.timeProjectId,
    notes: draft.notes.trim() || null,
  };
}

function formatClaimRoute(fromPlace: string, toPlace: string): string {
  const from = fromPlace.trim() || "—";
  const to = toPlace.trim() || "—";
  return `${from} → ${to}`;
}

function vehicleLabel(type: MileageVehicleType): string {
  return type === "bicycle" ? "Cykel/knallert" : "Bil/motorcykel";
}

function mileageRouteLookupKey(from: string, to: string, vehicleType: MileageVehicleType): string {
  return `${from.trim().toLowerCase()}→${to.trim().toLowerCase()}|${vehicleType}`;
}

async function lookupMileageDistance(from: string, to: string, vehicleType: MileageVehicleType) {
  return api.get<{ distanceKm: number; durationMinutes?: number | null }>(
    `/api/time/mileage-distance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&vehicleType=${vehicleType}`
  );
}

function MileageClaimForm({
  draft,
  setDraft,
  projects,
  readOnly = false,
  carKmYtdBeforeTrip,
}: {
  draft: MileageDraft;
  setDraft: React.Dispatch<React.SetStateAction<MileageDraft>>;
  projects: TimeProject[];
  readOnly?: boolean;
  carKmYtdBeforeTrip: number;
}) {
  const distanceManualRef = useRef(false);
  const lastAutoLookupKeyRef = useRef<string | null>(null);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);

  const rateYear = Number.parseInt(draft.tripDate.slice(0, 4), 10) || new Date().getFullYear();
  const distanceKm = parseDistanceKm(draft.distanceKm);
  const payout = computeMileagePayout({
    vehicleType: draft.vehicleType,
    distanceKm,
    rateYear,
    carKmYtdBeforeTrip,
    salaryReductionAgreement: draft.salaryReductionAgreement,
    receivesBIncome: draft.receivesBIncome,
  });

  const runDistanceLookup = useCallback(async (options?: { force?: boolean }) => {
    const from = draft.fromPlace.trim();
    const to = draft.toPlace.trim();
    if (from.length < 3 || to.length < 3 || from.toLowerCase() === to.toLowerCase()) {
      setDistanceError("Angiv start- og slutadresse for at beregne km.");
      return;
    }

    const lookupKey = mileageRouteLookupKey(from, to, draft.vehicleType);
    if (!options?.force && lastAutoLookupKeyRef.current === lookupKey) return;

    setDistanceLoading(true);
    setDistanceError(null);
    try {
      const result = await lookupMileageDistance(from, to, draft.vehicleType);
      setDraft((current) => ({ ...current, distanceKm: String(result.distanceKm) }));
      setDurationMinutes(result.durationMinutes ?? null);
      lastAutoLookupKeyRef.current = lookupKey;
      distanceManualRef.current = false;
    } catch (error) {
      setDistanceError(
        isApiError(error) ? error.message : "Kunne ikke beregne kørselsafstand mellem adresserne."
      );
    } finally {
      setDistanceLoading(false);
    }
  }, [draft.fromPlace, draft.toPlace, draft.vehicleType, setDraft]);

  const runDistanceLookupRef = useRef(runDistanceLookup);
  runDistanceLookupRef.current = runDistanceLookup;

  useEffect(() => {
    distanceManualRef.current = false;
    lastAutoLookupKeyRef.current = null;
  }, [draft.fromPlace, draft.toPlace, draft.vehicleType]);

  useEffect(() => {
    if (readOnly || distanceManualRef.current) return;
    const from = draft.fromPlace.trim();
    const to = draft.toPlace.trim();
    if (from.length < 3 || to.length < 3 || from.toLowerCase() === to.toLowerCase()) return;

    const lookupKey = mileageRouteLookupKey(from, to, draft.vehicleType);
    if (lastAutoLookupKeyRef.current === lookupKey) return;

    const timer = window.setTimeout(() => {
      void runDistanceLookupRef.current();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [draft.fromPlace, draft.toPlace, draft.vehicleType, readOnly]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:max-w-2xl">
        <div>
          <Label className="text-xs text-white/50">Dato</Label>
          <Input
            type="date"
            value={draft.tripDate}
            onChange={(e) => setDraft((d) => ({ ...d, tripDate: e.target.value }))}
            readOnly={readOnly}
            className="mt-1 border-white/10 bg-white/5 text-white read-only:cursor-default read-only:opacity-100"
          />
        </div>
        <div>
          <Label className="text-xs text-white/50">Køretøj</Label>
          <Select
            value={draft.vehicleType}
            onValueChange={(vehicleType: MileageVehicleType) => setDraft((d) => ({ ...d, vehicleType }))}
            disabled={readOnly}
          >
            <SelectTrigger className="mt-1 border-white/10 bg-white/5 text-white disabled:cursor-default disabled:opacity-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#16161f] text-white">
              <SelectItem value="car">Bil / motorcykel</SelectItem>
              <SelectItem value="bicycle">Cykel / knallert / EU-knallert</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-white/50">Fra</Label>
          <div className="mt-1">
            <AddressAutocomplete
              value={draft.fromPlace}
              onChange={(fromPlace) => setDraft((d) => ({ ...d, fromPlace }))}
              placeholder="Startadresse"
              readOnly={readOnly}
              country="dk"
              types="geocode"
              aria-label="Startadresse"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs text-white/50">Til</Label>
          <div className="mt-1">
            <AddressAutocomplete
              value={draft.toPlace}
              onChange={(toPlace) => setDraft((d) => ({ ...d, toPlace }))}
              placeholder="Slutadresse"
              readOnly={readOnly}
              country="dk"
              types="geocode"
              aria-label="Slutadresse"
            />
          </div>
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs text-white/50">Kilometer</Label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Input
              type="number"
              min={0}
              step="0.1"
              value={draft.distanceKm}
              onChange={(e) => {
                distanceManualRef.current = true;
                setDraft((d) => ({ ...d, distanceKm: e.target.value }));
              }}
              placeholder="0"
              readOnly={readOnly}
              className="h-9 w-28 border-white/10 bg-white/5 text-white read-only:cursor-default read-only:opacity-100"
            />
            {!readOnly ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 border-white/15 text-white hover:bg-white/10"
                disabled={distanceLoading}
                onClick={() => void runDistanceLookup({ force: true })}
              >
                {distanceLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Beregn km
              </Button>
            ) : null}
            {distanceLoading ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-white/45">
                <Loader2 className="h-3 w-3 animate-spin" />
                Beregner rute…
              </span>
            ) : null}
            {!distanceLoading && durationMinutes != null && distanceKm > 0 ? (
              <span className="text-[11px] text-white/40">ca. {durationMinutes} min kørsel</span>
            ) : null}
          </div>
          {distanceError && !readOnly ? (
            <p className="mt-1 text-[11px] text-amber-200/90">{distanceError}</p>
          ) : !readOnly ? (
            <p className="mt-1 text-[11px] text-white/35">
              Km beregnes automatisk fra adresserne (Google Maps). Du kan stadig rette tallet manuelt.
            </p>
          ) : null}
        </div>
        <div>
          <Label className="text-xs text-white/50">Projekt</Label>
          <Select
            value={draft.timeProjectId}
            onValueChange={(timeProjectId) => setDraft((d) => ({ ...d, timeProjectId }))}
            disabled={readOnly}
          >
            <SelectTrigger className="mt-1 border-white/10 bg-white/5 text-white disabled:cursor-default disabled:opacity-100">
              <SelectValue placeholder="No project" />
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

      <div>
        <Label className="text-xs text-white/50">Formål</Label>
        <Input
          value={draft.purpose}
          onChange={(e) => setDraft((d) => ({ ...d, purpose: e.target.value }))}
          placeholder="Erhvervsmæssig kørsel"
          readOnly={readOnly}
          className="mt-1 border-white/10 bg-white/5 text-white read-only:cursor-default read-only:opacity-100"
        />
      </div>

      <details className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white/55">
        <summary className="cursor-pointer font-medium text-white/70">SKAT kørselsgodtgørelse</summary>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 leading-snug">
          {SKAT_MILEAGE_RATE_SUMMARY.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <a
          href={SKAT_MILEAGE_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[10px] text-blue-300 hover:text-blue-200"
        >
          SKAT: kørselsgodtgørelse
          <ExternalLink size={10} />
        </a>
      </details>

      {draft.vehicleType === "car" ? (
        <p className="text-[11px] leading-snug text-white/45">
          Bil km i {rateYear} (ekskl. denne tur): {carKmYtdBeforeTrip.toLocaleString("da-DK")} /{" "}
          {CAR_KM_YEAR_LIMIT.toLocaleString("da-DK")} km til høj sats (
          {formatKrPerKm(payout.rateCentsPerKmHigh)}).
        </p>
      ) : null}

      {distanceKm > 0 ? (
        <p className="rounded-md border border-blue-400/15 bg-blue-500/10 px-2 py-1.5 text-[11px] leading-snug text-blue-100/90">
          <span className="font-medium text-blue-50">Udbetaling: </span>
          {describeMileagePayout({
            vehicleType: draft.vehicleType,
            distanceKm,
            rateYear,
            carKmYtdBeforeTrip,
            salaryReductionAgreement: draft.salaryReductionAgreement,
            receivesBIncome: draft.receivesBIncome,
          })}
        </p>
      ) : null}

      <div className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["salaryReductionAgreement", "Nedsat løn mod godtgørelse"],
            ["receivesBIncome", "Modtager B-indkomst"],
          ].map(([key, label]) => (
            <label
              key={key}
              className={`flex items-center gap-2 text-xs text-white/65 ${readOnly ? "cursor-default" : ""}`}
            >
              <Checkbox
                checked={Boolean(draft[key as keyof MileageDraft])}
                disabled={readOnly}
                onCheckedChange={(checked) => setDraft((d) => ({ ...d, [key]: checked === true }))}
              />
              {label}
            </label>
          ))}
        </div>
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

function SavedMileageClaimCard({
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
  carKmYtdBeforeTrip,
}: {
  claim: TimeMileageClaim;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  locked: boolean;
  isEditing: boolean;
  editDraft: MileageDraft | null;
  setEditDraft: React.Dispatch<React.SetStateAction<MileageDraft | null>>;
  projects: TimeProject[];
  projectById: Map<string, TimeProject>;
  canEdit: boolean;
  onReopen: () => void;
  onCloseEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  autoSaveStatus: AutoSaveStatusType;
  autoSaveError: string | null;
  carKmYtdBeforeTrip: number;
}) {
  const viewDraft = useMemo(() => claimToDraft(claim), [claim]);
  const noopSetDraft = useCallback((_value: React.SetStateAction<MileageDraft>) => {}, []);
  const projectName = claim.timeProjectId ? projectById.get(claim.timeProjectId)?.name : null;

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
                <p className="text-sm font-medium text-white">{formatClaimRoute(claim.fromPlace, claim.toPlace)}</p>
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
                <div className="mt-1 space-y-0.5">
                  <p className="text-[11px] text-white/50">
                    {format(parseISO(claim.tripDate), "d MMM yyyy")} · {vehicleLabel(claim.vehicleType)} ·{" "}
                    {claim.distanceKm.toLocaleString("da-DK")} km
                    {projectName ? ` · ${projectName}` : ""}
                  </p>
                  <p className="text-[11px] font-medium tabular-nums text-white/80">{money(claim.totalAmountCents)}</p>
                </div>
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
            <MileageClaimForm
              draft={editDraft}
              setDraft={(value) =>
                setEditDraft((current) => {
                  if (!current) return current;
                  return typeof value === "function" ? value(current) : value;
                })
              }
              projects={projects}
              carKmYtdBeforeTrip={carKmYtdBeforeTrip}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <AutoSaveStatus status={autoSaveStatus} error={autoSaveError} />
              <Button type="button" variant="ghost" size="sm" className="text-white/50" onClick={onCloseEdit}>
                Luk redigering
              </Button>
            </div>
          </div>
        ) : (
          <MileageClaimForm
            draft={viewDraft}
            setDraft={noopSetDraft}
            projects={projects}
            readOnly
            carKmYtdBeforeTrip={carKmYtdBeforeTrip}
          />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function MileageClaimsPanel({
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
  const queryKey = ["time-mileage-claims", rangeFrom, rangeTo, personQuery];
  const [expandedClaims, setExpandedClaims] = useState<Record<string, boolean>>({});
  const [editingClaimId, setEditingClaimId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<MileageDraft | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const editingClaimIdRef = useRef(editingClaimId);
  const editDraftRef = useRef(editDraft);
  editingClaimIdRef.current = editingClaimId;
  editDraftRef.current = editDraft;

  const { data: claims } = useQuery({
    queryKey,
    queryFn: () =>
      api.get<TimeMileageClaim[]>(`/api/time/mileage-claims?from=${rangeFrom}&to=${rangeTo}${personQuery}`),
  });

  const editYear = editDraft?.tripDate.slice(0, 4) ?? "";
  const { data: yearClaims } = useQuery({
    queryKey: ["time-mileage-claims-year", editYear, personQuery],
    queryFn: () =>
      api.get<TimeMileageClaim[]>(
        `/api/time/mileage-claims?from=${editYear}-01-01&to=${editYear}-12-31${personQuery}`
      ),
    enabled: Boolean(editYear),
  });

  const carKmYtdBeforeTrip = useMemo(() => {
    if (!yearClaims || !editDraft || editDraft.vehicleType !== "car") return 0;
    return yearClaims
      .filter((claim) => claim.vehicleType === "car" && claim.id !== editingClaimId)
      .reduce((sum, claim) => sum + claim.distanceKm, 0);
  }, [yearClaims, editDraft, editingClaimId]);

  const updateClaim = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch<TimeMileageClaim>(`/api/time/mileage-claims/${id}`, body),
  });

  const deleteClaim = useMutation({
    mutationFn: (id: string) => api.delete(`/api/time/mileage-claims/${id}`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["time-mileage-claims"] });
      if (editingClaimId === id) {
        setEditingClaimId(null);
        setEditDraft(null);
      }
      toast({ title: "Mileage claim deleted" });
    },
    onError: () => toast({ title: "Could not delete mileage claim", variant: "destructive" }),
  });

  const autoSave = useAutoSave({
    enabled: canEdit && editingClaimId !== null && editDraft !== null,
    resetKey: editingClaimId,
    getSnapshot: () => editDraftRef.current,
    save: async () => {
      const id = editingClaimIdRef.current;
      const draft = editDraftRef.current;
      if (!id || !draft || !draft.tripDate) return;
      const updated = await updateClaim.mutateAsync({ id, body: buildClaimBody(draft) });
      queryClient.setQueryData<TimeMileageClaim[]>(queryKey, (current) =>
        current ? current.map((claim) => (claim.id === updated.id ? updated : claim)) : current
      );
      queryClient.invalidateQueries({ queryKey: ["time-mileage-claims-year"] });
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
    queryClient.invalidateQueries({ queryKey: ["time-mileage-claims"] });
  }

  async function handleAddMileageClaim() {
    if (!canEdit || isAdding) return;
    setIsAdding(true);
    try {
      if (editingClaimId) {
        await closeEditing();
      }
      const created = await api.post<TimeMileageClaim>(
        "/api/time/mileage-claims",
        buildClaimBody(createEmptyMileageDraft())
      );
      queryClient.invalidateQueries({ queryKey: ["time-mileage-claims"] });
      const draft = claimToDraft(created);
      setEditingClaimId(created.id);
      setEditDraft(draft);
      setExpandedClaims((current) => ({ ...current, [created.id]: true }));
      markSaved(draft);
    } catch {
      toast({ title: "Could not create mileage claim", variant: "destructive" });
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
            <h3 className="text-sm font-semibold text-white">Kørselsgodtgørelse</h3>
            <p className="mt-1 text-xs text-white/45">
              Registrer erhvervsmæssig kørsel med SKATs skattefrie km-satser. Bil over 20.000 km/år falder til lavere
              sats.
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            {canEdit ? (
              <Button
                type="button"
                size="sm"
                className="h-9 bg-white text-black hover:bg-white/90"
                onClick={() => void handleAddMileageClaim()}
                disabled={isAdding}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add mileage claim
              </Button>
            ) : null}
            <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-right">
              <p className="text-[10px] uppercase tracking-wide text-white/35">Range total</p>
              <p className="text-sm font-semibold text-white">{money(total)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {(claims ?? []).length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/40">
            No mileage claims in this range.
          </div>
        ) : (
          (claims ?? []).map((claim) => {
            const claimYear = claim.tripDate.slice(0, 4);
            const ytdForClaim =
              claim.vehicleType === "car"
                ? (yearClaims ?? claims ?? [])
                    .filter(
                      (row) =>
                        row.vehicleType === "car" &&
                        row.tripDate.slice(0, 4) === claimYear &&
                        row.id !== claim.id &&
                        (editingClaimId !== claim.id || row.id !== editingClaimId)
                    )
                    .reduce((sum, row) => sum + row.distanceKm, 0)
                : 0;

            return (
              <SavedMileageClaimCard
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
                carKmYtdBeforeTrip={
                  editingClaimId === claim.id && editDraft?.vehicleType === "car" ? carKmYtdBeforeTrip : ytdForClaim
                }
              />
            );
          })
        )}
      </div>
    </div>
  );
}
