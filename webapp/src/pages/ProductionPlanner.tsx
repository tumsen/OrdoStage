import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, format, startOfMonth, endOfMonth, subMonths, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, Clapperboard, Plus, ListPlus } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoneyFromCents } from "@/lib/formatMoney";
import type { Production, ProductionPlannerResponse } from "@/lib/types";
import { usePermissions } from "@/hooks/usePermissions";
import { usePersistedViewMode } from "@/hooks/usePersistedViewMode";
import {
  usePersistedProductionId,
  useSyncProductionSelection,
} from "@/hooks/usePersistedProductionId";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductionGantt } from "@/components/productionPlanner/ProductionGantt";
import { ProductionCostPanel } from "@/components/productionPlanner/ProductionCostPanel";
import { ProductionSelector } from "@/components/productionPlanner/ProductionSelector";
import { CreateProductionDialog } from "@/components/productionPlanner/CreateProductionDialog";
import { AddProductionPhaseDialog } from "@/components/productionPlanner/AddProductionPhaseDialog";
import { TASK_CATEGORY_COLORS, TASK_CATEGORY_LABELS } from "@/lib/productionPlannerTheme";
import { cn } from "@/lib/utils";

type RangePreset = "month" | "quarter" | "season";

const RANGE_PRESETS = ["month", "quarter", "season"] as const satisfies readonly RangePreset[];

const LEGEND_CATEGORIES = [
  "planning_window",
  "set_build",
  "rehearsal",
  "tech",
  "premiere",
  "deadline",
  "cost",
] as const;

function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function rangeForPreset(anchor: Date, preset: RangePreset): { from: string; to: string } {
  if (preset === "month") {
    return { from: toYmd(startOfMonth(anchor)), to: toYmd(endOfMonth(anchor)) };
  }
  if (preset === "quarter") {
    return { from: toYmd(startOfMonth(anchor)), to: toYmd(endOfMonth(addMonths(anchor, 2))) };
  }
  return { from: toYmd(startOfMonth(anchor)), to: toYmd(endOfMonth(addMonths(anchor, 5))) };
}

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

  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()));
  const [preset, setPreset] = usePersistedViewMode(
    "ordo.viewMode.productionPlanner",
    RANGE_PRESETS,
    "quarter"
  );
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [phaseOpen, setPhaseOpen] = useState(false);

  const { from, to } = useMemo(() => rangeForPreset(anchor, preset), [anchor, preset]);

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

  function shiftRange(dir: -1 | 1) {
    const months = preset === "month" ? 1 : preset === "quarter" ? 3 : 6;
    setAnchor((d) => (dir === 1 ? addMonths(d, months) : subMonths(d, months)));
  }

  function invalidatePlanner() {
    queryClient.invalidateQueries({ queryKey: ["production-planner"] });
  }

  function handleProductionCreated(production: Production) {
    setProductionId(production.id);
    invalidatePlanner();
    queryClient.invalidateQueries({ queryKey: ["productions"] });
  }

  function fitRangeToProduction() {
    if (!selectedRow?.startDate || !selectedRow?.endDate) return;
    try {
      setAnchor(startOfMonth(parseISO(selectedRow.startDate)));
      const start = parseISO(selectedRow.startDate);
      const end = parseISO(selectedRow.endDate);
      const months = Math.max(
        1,
        (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
      );
      if (months <= 2) setPreset("month");
      else if (months <= 4) setPreset("quarter");
      else setPreset("season");
    } catch {
      /* ignore invalid dates */
    }
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

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
          {(["month", "quarter", "season"] as RangePreset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs capitalize",
                preset === p ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
              )}
            >
              {p}
            </button>
          ))}
        </div>

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
        <span className="text-sm text-white/70 tabular-nums min-w-[140px] text-center">
          {from} — {to}
        </span>
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
          onClick={() => setAnchor(startOfMonth(new Date()))}
        >
          Today
        </Button>
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
            />
          </div>
          <div className="xl:w-[340px] shrink-0 xl:max-h-full flex flex-col min-h-[240px]">
            <ProductionCostPanel
              row={selectedRow}
              currencyCode={data?.currencyCode ?? "EUR"}
              canEdit={canEdit}
              plannerQueryKey={[...queryKey]}
            />
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
