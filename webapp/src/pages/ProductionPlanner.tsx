import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { parseISO, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, Clapperboard, Plus, ListPlus } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoneyFromCents } from "@/lib/formatMoney";
import type { Production, ProductionPlannerResponse } from "@/lib/types";
import { usePermissions } from "@/hooks/usePermissions";
import {
  usePersistedProductionId,
  useSyncProductionSelection,
} from "@/hooks/usePersistedProductionId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductionGantt } from "@/components/productionPlanner/ProductionGantt";
import { ProductionCostPanel } from "@/components/productionPlanner/ProductionCostPanel";
import { ProductionPhasePanel } from "@/components/productionPlanner/ProductionPhasePanel";
import { ProductionSelector } from "@/components/productionPlanner/ProductionSelector";
import { CreateProductionDialog } from "@/components/productionPlanner/CreateProductionDialog";
import { AddProductionPhaseDialog } from "@/components/productionPlanner/AddProductionPhaseDialog";
import { TASK_CATEGORY_COLORS, TASK_CATEGORY_LABELS, CRITICAL_PATH_LEGEND } from "@/lib/productionPlannerTheme";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  clampGanttVisibleDays,
  ganttRangeForProductionSpan,
  ganttRangeFromStart,
  GANTT_VISIBLE_DAY_PRESETS,
  MAX_GANTT_VISIBLE_DAYS,
  MIN_GANTT_VISIBLE_DAYS,
  readPersistedGanttRangeStart,
  readPersistedGanttVisibleDays,
  shiftGanttRangeStart,
  toYmd,
  writePersistedGanttRangeStart,
  writePersistedGanttVisibleDays,
} from "@/lib/productionGanttRange";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LEGEND_CATEGORIES = [
  "planning_window",
  "set_build",
  "rehearsal",
  "tech",
  "premiere",
  "deadline",
  "cost",
] as const;

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

  const [rangeStart, setRangeStartState] = useState(() =>
    readPersistedGanttRangeStart(startOfDay(new Date()))
  );
  const [visibleDays, setVisibleDaysState] = useState(() => readPersistedGanttVisibleDays(90));

  const setRangeStart = useCallback((d: Date) => {
    const next = startOfDay(d);
    setRangeStartState(next);
    writePersistedGanttRangeStart(next);
  }, []);

  const setVisibleDays = useCallback((days: number) => {
    const next = clampGanttVisibleDays(days);
    setVisibleDaysState(next);
    writePersistedGanttVisibleDays(next);
  }, []);

  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [sideTab, setSideTab] = useState<"phase" | "budget">("phase");
  const [createOpen, setCreateOpen] = useState(false);
  const [phaseOpen, setPhaseOpen] = useState(false);

  const { from, to } = useMemo(
    () => ganttRangeFromStart(rangeStart, visibleDays),
    [rangeStart, visibleDays]
  );

  const queryKey = ["production-planner", { from, to, productionId }] as const;

  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKey],
    queryFn: () => {
      const params = new URLSearchParams({ from, to });
      if (productionId) params.set("productionId", productionId);
      return api.get<ProductionPlannerResponse>(`/api/production-planner?${params}`);
    },
    enabled: canAccess && !!productionId,
  });

  const selectedRow = data?.rows[0] ?? null;
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

  useEffect(() => {
    if (!selectedLine) return;
    if (selectedLine.kind === "cost") setSideTab("budget");
    else if (selectedLine.kind === "phase") setSideTab("phase");
  }, [selectedLine]);

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

  function shiftRange(dir: -1 | 1) {
    setRangeStart(shiftGanttRangeStart(rangeStart, visibleDays, dir));
  }

  function handleProductionCreated(production: Production) {
    setProductionId(production.id);
    invalidatePlanner();
    queryClient.invalidateQueries({ queryKey: ["productions"] });
  }

  function fitRangeToProduction() {
    if (!selectedRow?.startDate || !selectedRow?.endDate) return;
    try {
      const { start, visibleDays: days } = ganttRangeForProductionSpan(
        selectedRow.startDate,
        selectedRow.endDate
      );
      setRangeStart(start);
      setVisibleDays(days);
    } catch {
      /* ignore invalid dates */
    }
  }

  const isPresetDayCount = GANTT_VISIBLE_DAY_PRESETS.includes(
    visibleDays as (typeof GANTT_VISIBLE_DAY_PRESETS)[number]
  );

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

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-white/40">Production</p>
          <ProductionSelector value={productionId} onChange={setProductionId} />
        </div>
        {selectedRow?.startDate && selectedRow?.endDate ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-white/45 sm:mt-5"
            onClick={fitRangeToProduction}
          >
            Fit timeline to production
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 border-white/10"
            onClick={() => shiftRange(-1)}
            aria-label="Previous period"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 border-white/10"
            onClick={() => shiftRange(1)}
            aria-label="Next period"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-white/45"
            onClick={() => setRangeStart(startOfDay(new Date()))}
          >
            Today
          </Button>
          <span className="text-sm text-white/70 tabular-nums min-w-[140px] text-center">
            {from} — {to}
          </span>
          <span className="text-[10px] text-white/35 tabular-nums">({visibleDays} days)</span>
        </div>

        <div className="space-y-1">
          <Label htmlFor="gantt-range-start" className="text-[10px] uppercase text-white/40">
            Start day
          </Label>
          <Input
            id="gantt-range-start"
            type="date"
            value={toYmd(rangeStart)}
            onChange={(e) => {
              if (!e.target.value) return;
              setRangeStart(parseISO(`${e.target.value}T00:00:00`));
            }}
            className="h-9 w-[148px] bg-white/5 border-white/10 text-sm"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="gantt-visible-days" className="text-[10px] uppercase text-white/40">
            Days shown
          </Label>
          <div className="flex items-center gap-1.5">
            <Input
              id="gantt-visible-days"
              type="number"
              min={MIN_GANTT_VISIBLE_DAYS}
              max={MAX_GANTT_VISIBLE_DAYS}
              value={visibleDays}
              onChange={(e) => setVisibleDays(Number(e.target.value))}
              className="h-9 w-[72px] bg-white/5 border-white/10 text-sm tabular-nums"
            />
            <Select
              value={isPresetDayCount ? String(visibleDays) : "custom"}
              onValueChange={(v) => {
                if (v !== "custom") setVisibleDays(Number(v));
              }}
            >
              <SelectTrigger className="h-9 w-[88px] bg-white/5 border-white/10 text-xs">
                <SelectValue placeholder="Preset" />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10">
                {GANTT_VISIBLE_DAY_PRESETS.map((d) => (
                  <SelectItem key={d} value={String(d)} className="text-xs">
                    {d}d
                  </SelectItem>
                ))}
                {!isPresetDayCount ? (
                  <SelectItem value="custom" className="text-xs">
                    {visibleDays}d (custom)
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
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
        <div className="flex flex-col xl:flex-row gap-4 flex-1 min-h-0">
          <div className="flex-1 min-h-[280px] xl:min-h-0 flex flex-col min-w-0">
            <ProductionGantt
              row={selectedRow}
              from={from}
              to={to}
              currencyCode={data?.currencyCode ?? "EUR"}
              selectedLineId={selectedLineId}
              onSelectLine={setSelectedLineId}
              canEdit={canEdit}
              onPhaseReschedule={handlePhaseReschedule}
            />
          </div>
          <div className="xl:w-[340px] shrink-0 xl:max-h-full flex flex-col min-h-[240px]">
            <Tabs
              value={sideTab}
              onValueChange={(v) => setSideTab(v as "phase" | "budget")}
              className="flex flex-col min-h-0 flex-1"
            >
              <TabsList className="w-full bg-white/5 border border-white/10 shrink-0">
                <TabsTrigger value="phase" className="flex-1 text-xs data-[state=active]:bg-white/10">
                  Phase
                </TabsTrigger>
                <TabsTrigger value="budget" className="flex-1 text-xs data-[state=active]:bg-white/10">
                  Budget
                </TabsTrigger>
              </TabsList>
              <TabsContent value="phase" className="flex-1 min-h-0 mt-2 flex flex-col data-[state=inactive]:hidden">
                <ProductionPhasePanel
                  row={selectedRow}
                  selectedLine={selectedLine}
                  plannerQueryKey={[...queryKey]}
                  canEdit={canEdit}
                  onDeleted={() => {
                    const next = selectedRow?.ganttLines.find((l) => l.kind === "phase");
                    setSelectedLineId(next?.lineId ?? null);
                  }}
                />
              </TabsContent>
              <TabsContent value="budget" className="flex-1 min-h-0 mt-2 flex flex-col data-[state=inactive]:hidden">
                <ProductionCostPanel
                  row={selectedRow}
                  currencyCode={data?.currencyCode ?? "EUR"}
                  canEdit={canEdit}
                  plannerQueryKey={[...queryKey]}
                />
              </TabsContent>
            </Tabs>
          </div>
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
    </div>
  );
}
