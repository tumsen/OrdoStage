import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatMoneyFromCents, parseMoneyToCents } from "@/lib/formatMoney";
import type {
  Department,
  Person,
  ProductionCostCategory,
  ProductionPhase,
  ProductionPhaseCategory,
  ProductionPhaseKind,
  ProductionPlannerGanttLine,
  ProductionPlannerRow,
  UpdateProductionPhase,
} from "@/lib/types";
import {
  validatePhaseDates,
  type SchedulePhaseInput,
} from "@/lib/productionScheduleClient";
import {
  COST_CATEGORY_COLORS,
  COST_CATEGORY_LABELS,
  TASK_CATEGORY_LABELS,
} from "@/lib/productionPlannerTheme";
import { DateInputWithWeekday } from "@/components/DateInputWithWeekday";
import { ProductionPhaseDocumentsSection } from "@/components/productionPlanner/ProductionPhaseDocumentsSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

const NONE = "__none__";
type ProductionPhaseStatus = "planned" | "in_progress" | "done" | "cancelled";

const PHASE_CATEGORIES = Object.keys(TASK_CATEGORY_LABELS).filter(
  (k) => k !== "planning_window" && k !== "cost"
) as ProductionPhaseCategory[];

const STATUSES = ["planned", "in_progress", "done", "cancelled"] as ProductionPhaseStatus[];
const COST_CATEGORIES = Object.keys(COST_CATEGORY_LABELS) as ProductionCostCategory[];

function lineToScheduleInput(
  line: ProductionPlannerGanttLine,
  overrides?: Partial<SchedulePhaseInput>
): SchedulePhaseInput {
  const phaseKind = (overrides?.phaseKind ?? line.task.phaseKind ?? "span") as string;
  const isSingle = phaseKind === "milestone" || phaseKind === "deadline";
  return {
    id: line.task.phaseId ?? line.lineId,
    phaseKind,
    startDate: overrides?.startDate ?? new Date(line.task.start),
    endDate: overrides?.endDate ?? (isSingle ? null : new Date(line.task.end)),
    dependsOnPhaseId:
      overrides?.dependsOnPhaseId !== undefined
        ? overrides.dependsOnPhaseId
        : line.dependsOnPhaseId,
  };
}

function costIdFromLine(line: ProductionPlannerGanttLine): string | null {
  if (line.kind !== "cost") return null;
  if (line.task.id.startsWith("cost:")) return line.task.id.slice(5);
  if (line.lineId.startsWith("cost:")) return line.lineId.slice(5);
  return null;
}

export function ProductionTaskEditorPanel({
  row,
  selectedLine,
  currencyCode,
  plannerQueryKey,
  canEdit,
}: {
  row: ProductionPlannerRow | null;
  selectedLine: ProductionPlannerGanttLine | null;
  currencyCode: string;
  plannerQueryKey: unknown[];
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const isPhase = selectedLine?.kind === "phase" && !!selectedLine.task.phaseId;
  const isCost = selectedLine?.kind === "cost";
  const isReadOnly =
    selectedLine?.kind === "summary" ||
    (selectedLine?.kind === "phase" && !selectedLine.task.phaseId);

  const phaseId = selectedLine?.task.phaseId ?? null;
  const costId = selectedLine ? costIdFromLine(selectedLine) : null;
  const costLine = useMemo(
    () => (costId && row ? row.costs.find((c) => c.id === costId) ?? null : null),
    [costId, row]
  );

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ProductionPhaseCategory>("other");
  const [phaseKind, setPhaseKind] = useState<ProductionPhaseKind>("span");
  const [status, setStatus] = useState<ProductionPhaseStatus>("planned");
  const [progressPercent, setProgressPercent] = useState(0);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dependsOn, setDependsOn] = useState(NONE);
  const [assigneeId, setAssigneeId] = useState(NONE);
  const [departmentId, setDepartmentId] = useState(NONE);
  const [notes, setNotes] = useState("");

  const [costLabel, setCostLabel] = useState("");
  const [costCategory, setCostCategory] = useState<ProductionCostCategory>("other");
  const [costPlanned, setCostPlanned] = useState("");
  const [costActual, setCostActual] = useState("");
  const [costStart, setCostStart] = useState("");
  const [costEnd, setCostEnd] = useState("");
  const [costNotes, setCostNotes] = useState("");

  const { data: allPeople } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<Person[]>("/api/people"),
  });

  const { data: allTeams } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Department[]>("/api/departments"),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: plannerQueryKey });

  useEffect(() => {
    if (!selectedLine) return;
    if (isPhase && phaseId) {
      setTitle(selectedLine.label);
      setCategory(selectedLine.category as ProductionPhaseCategory);
      setPhaseKind(selectedLine.task.phaseKind ?? "span");
      setStatus((selectedLine.status as ProductionPhaseStatus) ?? "planned");
      setProgressPercent(selectedLine.task.progressPercent ?? 0);
      setStartDate(selectedLine.task.start.slice(0, 10));
      setEndDate(
        selectedLine.task.phaseKind === "span" ? selectedLine.task.end.slice(0, 10) : ""
      );
      setDependsOn(selectedLine.dependsOnPhaseId ?? NONE);
      setAssigneeId(selectedLine.assigneePersonId ?? NONE);
      setDepartmentId(selectedLine.departmentId ?? NONE);
      setNotes(selectedLine.notes ?? "");
    }
    if (isCost && costLine) {
      setCostLabel(costLine.label);
      setCostCategory(costLine.category);
      setCostPlanned((costLine.plannedCents / 100).toFixed(2));
      setCostActual(
        costLine.actualCents != null ? (costLine.actualCents / 100).toFixed(2) : ""
      );
      setCostStart(costLine.startDate?.slice(0, 10) ?? "");
      setCostEnd(costLine.endDate?.slice(0, 10) ?? "");
      setCostNotes(costLine.notes ?? "");
    }
  }, [selectedLine, isPhase, isCost, phaseId, costLine]);

  const siblingPhases =
    row?.ganttLines.filter(
      (l) => l.kind === "phase" && l.task.phaseId && l.task.phaseId !== phaseId
    ) ?? [];

  const savePhaseMutation = useMutation({
    mutationFn: async () => {
      if (!phaseId || !selectedLine || !row) throw new Error("No phase");
      const depId = dependsOn === NONE ? null : dependsOn;
      const candidate = lineToScheduleInput(selectedLine, {
        phaseKind,
        startDate: new Date(`${startDate}T12:00:00.000Z`),
        endDate:
          phaseKind === "span" && endDate.trim()
            ? new Date(`${endDate}T12:00:00.000Z`)
            : null,
        dependsOnPhaseId: depId,
      });
      const allInputs: SchedulePhaseInput[] = row.ganttLines
        .filter((l) => l.kind === "phase" && l.task.phaseId)
        .map((l) => (l.task.phaseId === phaseId ? candidate : lineToScheduleInput(l)));
      const err = validatePhaseDates(candidate, allInputs);
      if (err) throw new Error(err.message);

      const payload: UpdateProductionPhase = {
        title: title.trim(),
        category,
        phaseKind,
        status,
        progressPercent: status === "done" ? 100 : progressPercent,
        startDate: `${startDate}T12:00:00.000Z`,
        endDate:
          phaseKind === "span" ? (endDate.trim() ? `${endDate}T12:00:00.000Z` : null) : null,
        dependsOnPhaseId: depId,
        assigneePersonId: assigneeId === NONE ? null : assigneeId,
        departmentId: departmentId === NONE ? null : departmentId,
        notes: notes.trim() || null,
      };
      return api.patch<ProductionPhase>(`/api/productions/phases/${phaseId}`, payload);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Task saved" });
    },
    onError: (e) =>
      toast({
        title: e instanceof Error ? e.message : "Could not save",
        variant: "destructive",
      }),
  });

  const saveCostMutation = useMutation({
    mutationFn: async () => {
      if (!costId || !row) throw new Error("No cost line");
      const plannedCents = parseMoneyToCents(costPlanned) ?? 0;
      const actualCents =
        costActual.trim() === "" ? null : parseMoneyToCents(costActual);
      if (costActual.trim() !== "" && actualCents === null) {
        throw new Error("Invalid actual amount");
      }
      return api.patch(`/api/production-planner/costs/${costId}`, {
        category: costCategory,
        label: costLabel.trim(),
        plannedCents,
        actualCents,
        startDate: costStart.trim() || null,
        endDate: costEnd.trim() || null,
        notes: costNotes.trim() || null,
      });
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Cost line saved" });
    },
    onError: (e) =>
      toast({
        title: e instanceof Error ? e.message : "Could not save",
        variant: "destructive",
      }),
  });

  const editorKind = isCost ? "cost" : isPhase ? "phase" : isReadOnly ? "readonly" : null;

  return (
    <div className="flex flex-col min-h-0 flex-1">
        <div className="flex-1 min-h-0 overflow-y-auto">
          {!selectedLine || !row ? (
            <p className="p-5 text-sm text-white/40">Select a task on the timeline.</p>
          ) : editorKind === "readonly" ? (
            <div className="p-5 space-y-3 text-sm text-white/60">
              {selectedLine.kind === "summary" ? (
                <p>
                  The production planning window is derived from planning start and premiere
                  dates. Edit those on the production record.
                </p>
              ) : (
                <p>
                  This premiere marker is generated from the production premiere date. Add a
                  premiere phase or edit the production dates to change it.
                </p>
              )}
            </div>
          ) : editorKind === "phase" && phaseId ? (
            <Tabs defaultValue="details" className="flex flex-col">
              <TabsList className="mx-5 mt-4 w-auto bg-white/5 border border-white/10">
                <TabsTrigger value="details" className="text-xs data-[state=active]:bg-white/10">
                  Details
                </TabsTrigger>
                <TabsTrigger value="people" className="text-xs data-[state=active]:bg-white/10">
                  People
                </TabsTrigger>
                <TabsTrigger value="documents" className="text-xs data-[state=active]:bg-white/10">
                  Documents
                </TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="px-5 pb-5 mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-white/60 text-xs">Title</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={!canEdit}
                    className="bg-white/5 border-white/10"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-white/60 text-xs">Type</Label>
                    <Select
                      value={phaseKind}
                      onValueChange={(v) => setPhaseKind(v as ProductionPhaseKind)}
                      disabled={!canEdit}
                    >
                      <SelectTrigger className="bg-white/5 border-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#16161f] border-white/10">
                        <SelectItem value="span">Date range</SelectItem>
                        <SelectItem value="milestone">Milestone</SelectItem>
                        <SelectItem value="deadline">Deadline</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white/60 text-xs">Category</Label>
                    <Select
                      value={category}
                      onValueChange={(v) => setCategory(v as ProductionPhaseCategory)}
                      disabled={!canEdit}
                    >
                      <SelectTrigger className="bg-white/5 border-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#16161f] border-white/10">
                        {PHASE_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {TASK_CATEGORY_LABELS[cat]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-white/60 text-xs">Status</Label>
                    <Select
                      value={status}
                      onValueChange={(v) => setStatus(v as ProductionPhaseStatus)}
                      disabled={!canEdit}
                    >
                      <SelectTrigger className="bg-white/5 border-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#16161f] border-white/10">
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white/60 text-xs">Progress %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={progressPercent}
                      onChange={(e) => setProgressPercent(Number(e.target.value))}
                      disabled={!canEdit || status === "done"}
                      className="bg-white/5 border-white/10"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/60 text-xs">Depends on</Label>
                  <Select value={dependsOn} onValueChange={setDependsOn} disabled={!canEdit}>
                    <SelectTrigger className="bg-white/5 border-white/10">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#16161f] border-white/10">
                      <SelectItem value={NONE}>None</SelectItem>
                      {siblingPhases.map((p) => (
                        <SelectItem key={p.task.phaseId!} value={p.task.phaseId!}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="space-y-1">
                    <Label className="text-white/60 text-xs">
                      {phaseKind === "span" ? "Start" : "Date"}
                    </Label>
                    <DateInputWithWeekday
                      value={startDate}
                      disabled={!canEdit}
                      onChange={(v) => v && setStartDate(v)}
                    />
                  </div>
                  {phaseKind === "span" ? (
                    <div className="space-y-1">
                      <Label className="text-white/60 text-xs">End</Label>
                      <DateInputWithWeekday
                        value={endDate}
                        disabled={!canEdit}
                        onChange={(v) => v && setEndDate(v)}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/60 text-xs">Notes</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={!canEdit}
                    rows={3}
                    className="bg-white/5 border-white/10 resize-none"
                  />
                </div>
              </TabsContent>
              <TabsContent value="people" className="px-5 pb-5 mt-4 space-y-3">
                <p className="text-xs text-white/40">
                  Assign a person and team responsible for this task.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-white/60 text-xs">Assignee</Label>
                  <Select value={assigneeId} onValueChange={setAssigneeId} disabled={!canEdit}>
                    <SelectTrigger className="bg-white/5 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#16161f] border-white/10">
                      <SelectItem value={NONE}>None</SelectItem>
                      {(allPeople ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/60 text-xs">Team</Label>
                  <Select value={departmentId} onValueChange={setDepartmentId} disabled={!canEdit}>
                    <SelectTrigger className="bg-white/5 border-white/10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#16161f] border-white/10">
                      <SelectItem value={NONE}>None</SelectItem>
                      {(allTeams ?? []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
              <TabsContent value="documents" className="px-5 pb-5 mt-4">
                <ProductionPhaseDocumentsSection phaseId={phaseId} canEdit={canEdit} />
              </TabsContent>
            </Tabs>
          ) : editorKind === "cost" && costLine ? (
            <div className="p-5 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-white/60 text-xs">Label</Label>
                <Input
                  value={costLabel}
                  onChange={(e) => setCostLabel(e.target.value)}
                  disabled={!canEdit}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-white/60 text-xs">Category</Label>
                <Select
                  value={costCategory}
                  onValueChange={(v) => setCostCategory(v as ProductionCostCategory)}
                  disabled={!canEdit}
                >
                  <SelectTrigger className="bg-white/5 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#16161f] border-white/10">
                    {COST_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        <span className={COST_CATEGORY_COLORS[cat]}>
                          {COST_CATEGORY_LABELS[cat]}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-white/60 text-xs">Planned ({currencyCode})</Label>
                  <Input
                    value={costPlanned}
                    onChange={(e) => setCostPlanned(e.target.value)}
                    disabled={!canEdit}
                    className="bg-white/5 border-white/10 tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/60 text-xs">Actual ({currencyCode})</Label>
                  <Input
                    value={costActual}
                    onChange={(e) => setCostActual(e.target.value)}
                    disabled={!canEdit}
                    placeholder="Optional"
                    className="bg-white/5 border-white/10 tabular-nums"
                  />
                </div>
              </div>
              <p className="text-[10px] text-white/35">
                Plan {formatMoneyFromCents(costLine.plannedCents, currencyCode)}
                {costLine.actualCents != null
                  ? ` · Actual ${formatMoneyFromCents(costLine.actualCents, currencyCode)}`
                  : ""}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <div className="space-y-1">
                  <Label className="text-white/60 text-xs">Timeline start</Label>
                  <DateInputWithWeekday
                    value={costStart}
                    disabled={!canEdit}
                    allowClear
                    onChange={setCostStart}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-white/60 text-xs">Timeline end</Label>
                  <DateInputWithWeekday
                    value={costEnd}
                    disabled={!canEdit}
                    allowClear
                    onChange={setCostEnd}
                  />
                </div>
              </div>
              <p className="text-[10px] text-white/30">
                Dates control where this cost appears on the Gantt.
              </p>
              <div className="space-y-1.5">
                <Label className="text-white/60 text-xs">Notes</Label>
                <Textarea
                  value={costNotes}
                  onChange={(e) => setCostNotes(e.target.value)}
                  disabled={!canEdit}
                  rows={2}
                  className="bg-white/5 border-white/10 resize-none"
                />
              </div>
            </div>
          ) : (
            <p className="p-5 text-sm text-white/40">This row cannot be edited here.</p>
          )}
        </div>

        {canEdit && (editorKind === "phase" || editorKind === "cost") ? (
          <div className="shrink-0 px-5 py-4 border-t border-white/10">
            <Button
              type="button"
              className="w-full bg-red-900 hover:bg-red-800"
              disabled={
                editorKind === "phase"
                  ? !title.trim() || !startDate || savePhaseMutation.isPending
                  : !costLabel.trim() || saveCostMutation.isPending
              }
              onClick={() =>
                editorKind === "phase"
                  ? savePhaseMutation.mutate()
                  : saveCostMutation.mutate()
              }
            >
              {savePhaseMutation.isPending || saveCostMutation.isPending
                ? "Saving…"
                : "Save task"}
            </Button>
          </div>
        ) : null}
    </div>
  );
}
