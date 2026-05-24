import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addMonths, format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, Clapperboard } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoneyFromCents } from "@/lib/formatMoney";
import type { ProductionPlannerResponse } from "@/lib/types";
import { usePermissions } from "@/hooks/usePermissions";
import { usePersistedViewMode } from "@/hooks/usePersistedViewMode";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductionGantt } from "@/components/productionPlanner/ProductionGantt";
import { ProductionCostPanel } from "@/components/productionPlanner/ProductionCostPanel";
import { TASK_CATEGORY_COLORS } from "@/lib/productionPlannerTheme";
import { cn } from "@/lib/utils";

type RangePreset = "month" | "quarter" | "season";
type KindFilter = "all" | "events" | "tours";

const RANGE_PRESETS = ["month", "quarter", "season"] as const satisfies readonly RangePreset[];

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
  const { canView, canAction } = usePermissions();
  const canAccess = canView("schedule") || canView("events") || canView("tours");
  const canEdit = canAction("write.schedule") || canAction("write.events");

  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()));
  const [preset, setPreset] = usePersistedViewMode(
    "ordo.viewMode.productionPlanner",
    RANGE_PRESETS,
    "quarter"
  );
  const [kind, setKind] = useState<KindFilter>("all");
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  const { from, to } = useMemo(() => rangeForPreset(anchor, preset), [anchor, preset]);

  const queryKey = ["production-planner", { from, to, kind }] as const;

  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKey],
    queryFn: () =>
      api.get<ProductionPlannerResponse>(
        `/api/production-planner?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&kind=${kind}`
      ),
    enabled: canAccess,
  });

  const selectedRow = data?.rows.find((r) => r.id === selectedRowId) ?? data?.rows[0] ?? null;

  function shiftRange(dir: -1 | 1) {
    const months = preset === "month" ? 1 : preset === "quarter" ? 3 : 6;
    setAnchor((d) => (dir === 1 ? addMonths(d, months) : subMonths(d, months)));
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
            Gantt timeline for events and tours — performances, load-in, travel, and budget lines in
            one view.
          </p>
        </div>

        {data ? (
          <div className="flex flex-wrap gap-2">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-right">
              <p className="text-[10px] uppercase text-white/40">Total budget</p>
              <p className="text-sm font-semibold text-yellow-300/90 tabular-nums">
                {formatMoneyFromCents(data.totals.plannedCents, data.currencyCode)}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-right">
              <p className="text-[10px] uppercase text-white/40">Total actual</p>
              <p className="text-sm font-semibold text-white/80 tabular-nums">
                {formatMoneyFromCents(data.totals.actualCents, data.currencyCode)}
              </p>
            </div>
          </div>
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

        <Select value={kind} onValueChange={(v) => setKind(v as KindFilter)}>
          <SelectTrigger className="w-[130px] h-9 bg-white/5 border-white/10 text-white text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#16161f] border-white/10">
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="events">Events only</SelectItem>
            <SelectItem value="tours">Tours only</SelectItem>
          </SelectContent>
        </Select>

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
        {(Object.keys(TASK_CATEGORY_COLORS) as Array<keyof typeof TASK_CATEGORY_COLORS>)
          .filter((k) => k !== "custom" && k !== "day_off")
          .map((cat) => (
            <span key={cat} className="flex items-center gap-1.5 text-[10px] text-white/45">
              <span
                className={cn(
                  "h-2 w-4 rounded-sm border",
                  TASK_CATEGORY_COLORS[cat].bar,
                  TASK_CATEGORY_COLORS[cat].border
                )}
              />
              {cat.replace(/_/g, " ")}
            </span>
          ))}
      </div>

      {isLoading ? (
        <Skeleton className="flex-1 min-h-[320px] rounded-xl bg-white/5" />
      ) : error ? (
        <p className="text-red-400 text-sm">Could not load production planner.</p>
      ) : data ? (
        <div className="flex flex-col xl:flex-row gap-4 flex-1 min-h-0">
          <div className="flex-1 min-h-[280px] xl:min-h-0 flex flex-col min-w-0">
            <ProductionGantt
              rows={data.rows}
              from={from}
              to={to}
              currencyCode={data.currencyCode}
              selectedRowId={selectedRow?.id ?? null}
              onSelectRow={setSelectedRowId}
            />
          </div>
          <div className="xl:w-[340px] shrink-0 xl:max-h-full flex flex-col min-h-[240px]">
            <ProductionCostPanel
              row={selectedRow}
              currencyCode={data.currencyCode}
              canEdit={canEdit}
              plannerQueryKey={[...queryKey]}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
