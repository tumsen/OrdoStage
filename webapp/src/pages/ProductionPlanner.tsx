import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Clapperboard, Download, Plus, ListPlus } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoneyFromCents } from "@/lib/formatMoney";
import type { Production, ProductionPlannerResponse } from "@/lib/types";
import { usePermissions } from "@/hooks/usePermissions";
import {
  usePersistedProductionId,
  useSyncProductionSelection,
} from "@/hooks/usePersistedProductionId";
import { DateInputWithWeekday } from "@/components/DateInputWithWeekday";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductionGantt } from "@/components/productionPlanner/ProductionGantt";
import { ProductionCostPanel } from "@/components/productionPlanner/ProductionCostPanel";
import { ProductionCrewPanel } from "@/components/productionPlanner/ProductionCrewPanel";
import { ProductionTaskEditor } from "@/components/productionPlanner/ProductionTaskEditor";
import { downloadProductionPlanPDF } from "@/components/productionPlanner/ProductionPlanPDF";
import { ProductionSelector } from "@/components/productionPlanner/ProductionSelector";
import { CreateProductionDialog } from "@/components/productionPlanner/CreateProductionDialog";
import { AddProductionPhaseDialog } from "@/components/productionPlanner/AddProductionPhaseDialog";
import { TASK_CATEGORY_COLORS, TASK_CATEGORY_LABELS, CRITICAL_PATH_LEGEND } from "@/lib/productionPlannerTheme";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  apiRangeForPlanner,
  clampGanttZoom,
  ganttTaskBoundsFromLines,
  ganttTaskSpanFromLines,
  MAX_GANTT_ZOOM,
  midpointOfRange,
  MIN_GANTT_ZOOM,
  readPersistedGanttZoom,
  visibleRangeForZoom,
  visibleRangeWithFixedStart,
  writePersistedGanttZoom,
  zoomLabel,
} from "@/lib/productionGanttRange";
import { startOfDay } from "date-fns";
import { resolveTimelineScaleFromZoom } from "@/lib/productionGanttTimeline";

const LEGEND_CATEGORIES = [
  "planning_window",
  "set_build",
  "rehearsal",
  "tech",
  "premiere",
  "deadline",
  "cost",
] as const;

const INITIAL_API_RANGE = apiRangeForPlanner(undefined);

type RangePreset = "today" | null;

export default function ProductionPlanner() {
  const queryClient = useQueryClient();
  const { canView, canAction } = usePermissions();
  const canAccess = canView("schedule") || canView("events");
  const canEdit = canAction("write.schedule") || canAction("write.events");

  const { productionId, setProductionId } = usePersistedProductionId();
  const { data: productionsList } = useQuery({
    queryKey: ["productions"],
    queryFn: () => api.get<Production[]>("/api/productions"),
    enabled: canAccess,
  });
  const productionIds = useMemo(
    () => (productionsList ?? []).map((p) => p.id),
    [productionsList]
  );
  useSyncProductionSelection(productionId, setProductionId, productionIds);

  const [zoom, setZoomState] = useState(() => readPersistedGanttZoom(0));

  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"budget" | "crew">("crew");
  const [taskEditorOpen, setTaskEditorOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [phaseOpen, setPhaseOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [visibleFrom, setVisibleFrom] = useState(INITIAL_API_RANGE.from);
  const [visibleTo, setVisibleTo] = useState(INITIAL_API_RANGE.to);
  const [rangeManual, setRangeManual] = useState(false);
  const [rangePreset, setRangePreset] = useState<RangePreset>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["production-planner", productionId],
    queryFn: () => {
      const params = new URLSearchParams({
        from: INITIAL_API_RANGE.from,
        to: INITIAL_API_RANGE.to,
      });
      if (productionId) params.set("productionId", productionId);
      return api.get<ProductionPlannerResponse>(`/api/production-planner?${params}`);
    },
    enabled: canAccess && !!productionId,
  });

  const selectedRow = data?.rows[0] ?? null;

  const productionSpan = useMemo(
    () => (selectedRow?.ganttLines.length ? ganttTaskSpanFromLines(selectedRow.ganttLines) : null),
    [selectedRow?.ganttLines]
  );

  const productionBounds = useMemo(
    () => (selectedRow?.ganttLines.length ? ganttTaskBoundsFromLines(selectedRow.ganttLines) : null),
    [selectedRow?.ganttLines]
  );

  const rangeInitFor = useRef<string | null>(null);

  useEffect(() => {
    if (rangeInitFor.current !== productionId) {
      rangeInitFor.current = null;
    }
  }, [productionId]);

  useEffect(() => {
    if (!productionId || !productionSpan) return;
    if (rangeInitFor.current === productionId) return;
    rangeInitFor.current = productionId;
    setRangeManual(false);
    setRangePreset(null);
    const center = midpointOfRange(productionSpan.from, productionSpan.to);
    const next = visibleRangeForZoom(zoom, center, productionSpan);
    setVisibleFrom(next.from);
    setVisibleTo(next.to);
  }, [productionId, productionSpan, zoom]);

  const applyZoomRange = useCallback(
    (nextZoom: number, anchor?: Date) => {
      const center = anchor ?? midpointOfRange(visibleFrom, visibleTo);
      const next = visibleRangeForZoom(nextZoom, center, productionSpan);
      setVisibleFrom(next.from);
      setVisibleTo(next.to);
    },
    [productionSpan, visibleFrom, visibleTo]
  );

  const applyTodayRange = useCallback(
    (nextZoom: number, fromYmd: string) => {
      const next = visibleRangeWithFixedStart(fromYmd, nextZoom, startOfDay(new Date()));
      setVisibleTo(next.to);
    },
    []
  );

  const handleZoomChange = useCallback(
    (value: number) => {
      const next = clampGanttZoom(value);
      setZoomState(next);
      writePersistedGanttZoom(next);
      if (rangePreset === "today") {
        applyTodayRange(next, visibleFrom);
        return;
      }
      if (!rangeManual) {
        applyZoomRange(next);
      }
    },
    [applyTodayRange, applyZoomRange, rangeManual, rangePreset, visibleFrom]
  );

  const showToday = useCallback(() => {
    setRangePreset("today");
    setRangeManual(false);
    applyTodayRange(zoom, visibleFrom);
  }, [applyTodayRange, visibleFrom, zoom]);

  const showFullProduction = useCallback(() => {
    if (!productionBounds) return;
    setRangePreset(null);
    setRangeManual(true);
    setVisibleFrom(productionBounds.from);
    setVisibleTo(productionBounds.to);
    setZoomState(MIN_GANTT_ZOOM);
    writePersistedGanttZoom(MIN_GANTT_ZOOM);
  }, [productionBounds]);

  const visibleDayCount = useMemo(() => {
    const a = startOfDay(new Date(`${visibleFrom}T12:00:00`));
    const b = startOfDay(new Date(`${visibleTo}T12:00:00`));
    return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1);
  }, [visibleFrom, visibleTo]);

  const selectedLine = useMemo(
    () => selectedRow?.ganttLines.find((l) => l.lineId === selectedLineId) ?? null,
    [selectedRow, selectedLineId]
  );

  const existingPhases = useMemo(
    () =>
      (selectedRow?.ganttLines ?? [])
        .filter((l) => l.kind === "phase" && l.task.phaseId)
        .map((l) => ({ id: l.task.phaseId!, title: l.label })),
    [selectedRow]
  );

  useEffect(() => {
    if (!selectedRow?.ganttLines.length) {
      setSelectedLineId(null);
      return;
    }
    if (!selectedLineId || !selectedRow.ganttLines.some((l) => l.lineId === selectedLineId)) {
      const firstPhase = selectedRow.ganttLines.find((l) => l.kind === "phase");
      setSelectedLineId(firstPhase?.lineId ?? selectedRow.ganttLines[0]!.lineId);
    }
  }, [selectedRow, selectedLineId]);

  const openTaskEditor = useCallback((lineId: string) => {
    setSelectedLineId(lineId);
    setTaskEditorOpen(true);
  }, []);

  const invalidatePlanner = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["production-planner"] });
  }, [queryClient]);

  const rescheduleMutation = useMutation({
    mutationFn: ({
      phaseId,
      startDate,
      endDate,
    }: {
      phaseId: string;
      startDate: string;
      endDate: string | null;
    }) =>
      api.patch(`/api/productions/phases/${phaseId}`, { startDate, endDate }),
    onSuccess: () => invalidatePlanner(),
  });

  const handlePhaseReschedule = useCallback(
    async (phaseId: string, dates: { startDate: string; endDate: string | null }) => {
      try {
        await rescheduleMutation.mutateAsync({ phaseId, ...dates });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not reschedule phase";
        toast({ title: msg, variant: "destructive" });
        throw e;
      }
    },
    [rescheduleMutation]
  );

  function handleProductionCreated(production: Production) {
    setProductionId(production.id);
    invalidatePlanner();
    queryClient.invalidateQueries({ queryKey: ["productions"] });
  }

  if (!canAccess) {
    return (
      <div className="p-8 text-center text-white/50 text-sm">
        You do not have access to the production planner.
      </div>
    );
  }

  return (
    <div className="app-page-fill flex flex-col gap-4 p-4 md:p-6 max-md:app-page-fill-mobile min-h-0">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2 text-red-400/90 mb-1">
            <Clapperboard className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-widest">Production</span>
          </div>
          <h1 className="text-xl md:text-2xl font-semibold text-white tracking-tight">
            Production planner
          </h1>
          <p className="text-sm text-white/45 mt-1 max-w-xl">
            Gantt plan per show: each phase on its own row, with finish-to-start dependencies between
            deadlines.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {canEdit ? (
            <>
              <Button
                type="button"
                size="sm"
                className="h-9 bg-red-900/80 hover:bg-red-800 text-white"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                New production
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 border-white/10 text-white/80"
                disabled={!productionId}
                onClick={() => setPhaseOpen(true)}
              >
                <ListPlus className="h-4 w-4 mr-1.5" />
                Add plan line
              </Button>
            </>
          ) : null}
          {selectedRow ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 border-white/10 text-white/80"
              disabled={pdfLoading}
              onClick={async () => {
                setPdfLoading(true);
                try {
                  await downloadProductionPlanPDF(selectedRow);
                } catch {
                  toast({ title: "Could not generate PDF", variant: "destructive" });
                } finally {
                  setPdfLoading(false);
                }
              }}
            >
              <Download className="h-4 w-4 mr-1.5" />
              {pdfLoading ? "Generating…" : "Download PDF"}
            </Button>
          ) : null}
          {selectedRow ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-right">
              <p className="text-[10px] uppercase text-white/40">Production budget</p>
              <p className="text-sm font-semibold text-yellow-300/90 tabular-nums">
                {formatMoneyFromCents(
                  selectedRow.costSummary.plannedCents,
                  data?.currencyCode ?? "EUR"
                )}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-3 shrink-0">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-white/40">Production</p>
          <ProductionSelector value={productionId} onChange={setProductionId} />
        </div>
      </div>

      <div className="flex flex-col gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="sm"
            variant={rangePreset === "today" ? "default" : "outline"}
            className={cn(
              "h-9",
              rangePreset === "today"
                ? "bg-red-900 hover:bg-red-800 text-white border-red-700/50"
                : "border-white/10 text-white/80"
            )}
            disabled={!productionId}
            onClick={showToday}
          >
            Today
          </Button>
          <DateInputWithWeekday
            value={visibleFrom}
            disabled={!productionId}
            onChange={(v) => {
              if (!v) return;
              setRangePreset(null);
              setRangeManual(true);
              setVisibleFrom(v);
              if (v > visibleTo) setVisibleTo(v);
            }}
          />
          <span className="text-white/30 text-xs">to</span>
          <DateInputWithWeekday
            value={visibleTo}
            disabled={!productionId}
            onChange={(v) => {
              if (!v) return;
              setRangePreset(null);
              setRangeManual(true);
              setVisibleTo(v);
              if (v < visibleFrom) setVisibleFrom(v);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 border-white/10 text-white/80"
            disabled={!productionBounds}
            onClick={showFullProduction}
          >
            Full production
          </Button>
          {productionId ? (
            <p className="text-sm text-white/50 tabular-nums self-center">
              {visibleFrom} — {visibleTo}
              <span className="text-[10px] text-white/35 ml-2">({visibleDayCount} days)</span>
              {productionBounds ? (
                <span className="text-[10px] text-white/25 ml-1">
                  · plan {productionBounds.dayCount}d
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px] max-w-md space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="gantt-zoom" className="text-[10px] uppercase text-white/40">
                Day resolution
              </Label>
              <span className="text-[10px] text-white/45">
                {zoomLabel(zoom, resolveTimelineScaleFromZoom(zoom))}
                {rangePreset === "today"
                  ? " · end follows zoom"
                  : !rangeManual
                    ? " · range follows zoom"
                    : ""}
              </span>
            </div>
            <input
              id="gantt-zoom"
              type="range"
              min={MIN_GANTT_ZOOM}
              max={MAX_GANTT_ZOOM}
              value={zoom}
              onChange={(e) => handleZoomChange(Number(e.target.value))}
              className="w-full h-1.5 accent-red-500 cursor-pointer"
              aria-label="Timeline day resolution"
            />
            <div className="flex justify-between text-[9px] text-white/30">
              <span>12 months</span>
              <span>1 day / screen</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 shrink-0">
        {LEGEND_CATEGORIES.map((cat) => (
          <span key={cat} className="flex items-center gap-1.5 text-[10px] text-white/45">
            <span
              className={cn(
                "h-2 w-4 rounded-sm border",
                TASK_CATEGORY_COLORS[cat].bar,
                TASK_CATEGORY_COLORS[cat].border
              )}
            />
            {TASK_CATEGORY_LABELS[cat] ?? cat.replace(/_/g, " ")}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[10px] text-white/45">
          <span
            className={cn(
              "h-2 w-4 rounded-sm border ring-1 ring-red-400/50",
              CRITICAL_PATH_LEGEND.bar,
              CRITICAL_PATH_LEGEND.border
            )}
          />
          Critical path
        </span>
        <span className="text-[10px] text-white/30 ml-2">— arrows = depends on (finish → start)</span>
      </div>

      {!productionId ? (
        <p className="text-sm text-white/40 py-8 text-center">Select or create a production.</p>
      ) : isLoading ? (
        <Skeleton className="flex-1 min-h-[320px] rounded-xl bg-white/5" />
      ) : error ? (
        <p className="text-red-400 text-sm">Could not load production planner.</p>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 gap-3 w-full">
          <div className="w-full flex-1 min-h-[320px] flex flex-col">
            <ProductionGantt
              row={selectedRow}
              from={visibleFrom}
              to={visibleTo}
              zoom={zoom}
              currencyCode={data?.currencyCode ?? "EUR"}
              selectedLineId={selectedLineId}
              onSelectLine={setSelectedLineId}
              onOpenTaskEditor={openTaskEditor}
              canEdit={canEdit}
              onPhaseReschedule={handlePhaseReschedule}
            />
          </div>

          <Tabs
            value={detailTab}
            onValueChange={(v) => setDetailTab(v as "budget" | "crew")}
            className="w-full shrink-0"
          >
            <TabsList className="w-full max-w-sm bg-white/5 border border-white/10">
              <TabsTrigger value="crew" className="flex-1 text-xs data-[state=active]:bg-white/10">
                Production crew
              </TabsTrigger>
              <TabsTrigger value="budget" className="flex-1 text-xs data-[state=active]:bg-white/10">
                Budget overview
              </TabsTrigger>
            </TabsList>
            <TabsContent
              value="crew"
              className="mt-2 data-[state=inactive]:hidden max-h-[min(38vh,400px)] overflow-y-auto"
            >
              <ProductionCrewPanel
                row={selectedRow}
                productionId={productionId}
                plannerQueryKey={["production-planner", productionId]}
                canEdit={canEdit}
              />
            </TabsContent>
            <TabsContent
              value="budget"
              className="mt-2 data-[state=inactive]:hidden max-h-[min(38vh,400px)] overflow-y-auto"
            >
              <ProductionCostPanel
                row={selectedRow}
                currencyCode={data?.currencyCode ?? "EUR"}
                canEdit={canEdit}
                plannerQueryKey={["production-planner", productionId]}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}

      <CreateProductionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleProductionCreated}
      />
      <AddProductionPhaseDialog
        productionId={productionId}
        productionName={selectedRow?.title ?? ""}
        existingPhases={existingPhases}
        open={phaseOpen}
        onOpenChange={setPhaseOpen}
        onCreated={invalidatePlanner}
      />

      <ProductionTaskEditor
        open={taskEditorOpen}
        onOpenChange={setTaskEditorOpen}
        row={selectedRow}
        selectedLine={selectedLine}
        currencyCode={data?.currencyCode ?? "EUR"}
        plannerQueryKey={["production-planner", productionId]}
        canEdit={canEdit}
        onDeleted={() => {
          const next = selectedRow?.ganttLines.find((l) => l.kind === "phase" && l.task.phaseId);
          setSelectedLineId(next?.lineId ?? null);
        }}
      />
    </div>
  );
}
