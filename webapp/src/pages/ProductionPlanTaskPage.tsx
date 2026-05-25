import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { apiRangeForPlanner } from "@/lib/productionGanttRange";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import type { ProductionPlannerResponse } from "@/lib/types";
import { usePermissions } from "@/hooks/usePermissions";
import { ProductionTaskEditorPanel } from "@/components/productionPlanner/ProductionTaskEditor";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TASK_CATEGORY_LABELS } from "@/lib/productionPlannerTheme";
import { cn } from "@/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

const INITIAL_API_RANGE = apiRangeForPlanner(undefined);

export default function ProductionPlanTaskPage() {
  const { productionId, lineId } = useParams<{ productionId: string; lineId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canView, canAction } = usePermissions();
  const canAccess = canView("schedule") || canView("events");
  const canEdit = canAction("write.schedule") || canAction("write.events");

  const plannerKey = ["production-planner", productionId];

  const { data, isLoading, error } = useQuery({
    queryKey: plannerKey,
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

  const row = data?.rows[0] ?? null;
  const selectedLine = useMemo(
    () => row?.ganttLines.find((l) => l.lineId === lineId) ?? null,
    [row, lineId]
  );

  const isPhase = selectedLine?.kind === "phase" && !!selectedLine.task.phaseId;
  const phaseId = selectedLine?.task.phaseId;
  const costId =
    selectedLine?.kind === "cost"
      ? selectedLine.task.id.startsWith("cost:")
        ? selectedLine.task.id.slice(5)
        : selectedLine.lineId.startsWith("cost:")
          ? selectedLine.lineId.slice(5)
          : null
      : null;

  const deletePhaseMutation = useMutation({
    mutationFn: () => api.delete(`/api/productions/phases/${phaseId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: plannerKey });
      toast({ title: "Task removed" });
      navigate("/production");
    },
    onError: (e) =>
      toast({
        title: e instanceof Error ? e.message : "Could not delete",
        variant: "destructive",
      }),
  });

  const deleteCostMutation = useMutation({
    mutationFn: () => api.delete(`/api/production-planner/costs/${costId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: plannerKey });
      toast({ title: "Cost line removed" });
      navigate("/production");
    },
    onError: () => toast({ title: "Could not delete", variant: "destructive" }),
  });

  if (!canAccess) {
    return (
      <div className="p-8 text-center text-white/50 text-sm">
        You do not have access to the production planner.
      </div>
    );
  }

  const backHref = "/production";

  return (
    <div className="page-shell flex flex-col min-h-0 gap-4">
      <Link
        to={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition-colors shrink-0"
      >
        <ArrowLeft size={14} /> Back to planner
      </Link>

      {isLoading ? (
        <Skeleton className="h-12 w-full max-w-lg rounded-lg bg-white/5" />
      ) : error || !row || !selectedLine ? (
        <div className="rounded-xl border border-white/10 bg-[#12121a]/60 p-8 text-center">
          <p className="text-sm text-white/50">
            {error ? "Could not load this task." : "Task not found."}
          </p>
          <Button asChild variant="outline" className="mt-4 border-white/10">
            <Link to={backHref}>Return to planner</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3 shrink-0 border-b border-white/10 pb-4">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-white tracking-tight truncate">
                {selectedLine.label}
              </h1>
              <p className="text-sm text-white/45 mt-1">
                {row.title}
                <span className="text-white/25 mx-2">·</span>
                {TASK_CATEGORY_LABELS[selectedLine.category] ?? selectedLine.category}
                {selectedLine.isCritical ? (
                  <span className="text-red-300/80 ml-2">· Critical path</span>
                ) : null}
                {selectedLine.floatDays != null && selectedLine.floatDays > 0 ? (
                  <span className="ml-2">· {selectedLine.floatDays}d float</span>
                ) : null}
                {selectedLine.dependsOnLabel ? (
                  <span className="text-white/35 ml-2">· after {selectedLine.dependsOnLabel}</span>
                ) : null}
              </p>
            </div>
            {canEdit && isPhase ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-red-900/40 text-red-400/90 hover:bg-red-950/40 shrink-0"
                onClick={() => {
                  if (!confirmDeleteAction(`task "${selectedLine.label}"`)) return;
                  deletePhaseMutation.mutate();
                }}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete task
              </Button>
            ) : null}
            {canEdit && selectedLine.kind === "cost" && costId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-red-900/40 text-red-400/90 hover:bg-red-950/40 shrink-0"
                onClick={() => {
                  if (!confirmDeleteAction(`cost line "${selectedLine.label}"`)) return;
                  deleteCostMutation.mutate();
                }}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete line
              </Button>
            ) : null}
          </div>

          <div
            className={cn(
              "flex-1 min-h-0 flex flex-col rounded-xl border border-white/10 bg-[#12121a]/80 overflow-hidden"
            )}
          >
            <ProductionTaskEditorPanel
              row={row}
              selectedLine={selectedLine}
              currencyCode={data?.currencyCode ?? "EUR"}
              plannerQueryKey={plannerKey}
              canEdit={canEdit}
            />
          </div>
        </>
      )}
    </div>
  );
}
