import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import type {
  Department,
  Person,
  ProductionPhase,
  ProductionPhaseCategory,
  ProductionPhaseKind,
  ProductionPlannerGanttLine,
  ProductionPlannerRow,
  UpdateProductionPhase,
} from "@/lib/types";

type ProductionPhaseStatus = "planned" | "in_progress" | "done" | "cancelled";
import {
  validatePhaseDates,
  type SchedulePhaseInput,
} from "@/lib/productionScheduleClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TASK_CATEGORY_LABELS } from "@/lib/productionPlannerTheme";
import { toast } from "@/hooks/use-toast";

const NONE = "__none__";
const PHASE_CATEGORIES = Object.keys(TASK_CATEGORY_LABELS).filter(
  (k) => k !== "planning_window" && k !== "cost"
) as ProductionPhaseCategory[];

const STATUSES = ["planned", "in_progress", "done", "cancelled"] as ProductionPhaseStatus[];

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

export function ProductionPhasePanel({
  row,
  selectedLine,
  plannerQueryKey,
  canEdit,
  onDeleted,
}: {
  row: ProductionPlannerRow | null;
  selectedLine: ProductionPlannerGanttLine | null;
  plannerQueryKey: unknown[];
  canEdit: boolean;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const isPhase = selectedLine?.kind === "phase" && selectedLine.task.phaseId;

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

  const { data: allPeople } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<Person[]>("/api/people"),
  });

  const { data: allTeams } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Department[]>("/api/departments"),
  });

  const phaseId = selectedLine?.task.phaseId ?? null;

  useEffect(() => {
    if (!selectedLine || !isPhase) return;
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
    setNotes("");
  }, [selectedLine?.lineId, isPhase, selectedLine]);

  const siblingPhases =
    row?.ganttLines.filter(
      (l) => l.kind === "phase" && l.task.phaseId && l.task.phaseId !== phaseId
    ) ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: plannerQueryKey });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!phaseId || !selectedLine || !row) throw new Error("No phase selected");
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
      toast({ title: "Phase updated" });
    },
    onError: (e) =>
      toast({
        title: e instanceof Error ? e.message : "Could not save",
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/productions/phases/${phaseId}`),
    onSuccess: () => {
      invalidate();
      onDeleted();
      toast({ title: "Phase removed" });
    },
    onError: (e) =>
      toast({
        title: e instanceof Error ? e.message : "Could not delete",
        variant: "destructive",
      }),
  });

  if (!row) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#12121a]/60 p-6 text-center text-sm text-white/40">
        Select a production to view details.
      </div>
    );
  }

  if (!selectedLine || !isPhase) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#12121a]/60 p-6 text-center text-sm text-white/40">
        Select a phase row on the Gantt to edit it here.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#12121a]/80 flex flex-col min-h-0 overflow-hidden flex-1">
      <div className="px-4 py-3 border-b border-white/10 shrink-0 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Phase</p>
          <p className="text-sm font-medium text-white truncate">{selectedLine.label}</p>
          {selectedLine.isCritical ? (
            <p className="text-[10px] text-red-300/80 mt-0.5">Critical path</p>
          ) : selectedLine.floatDays != null && selectedLine.floatDays > 0 ? (
            <p className="text-[10px] text-white/35 mt-0.5">{selectedLine.floatDays}d float</p>
          ) : null}
        </div>
        {canEdit ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-400/70 shrink-0"
            onClick={() => {
              if (!confirmDeleteAction(`phase "${selectedLine.label}"`)) return;
              deleteMutation.mutate();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <div className="p-4 space-y-3 overflow-y-auto flex-1">
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
        <div className="grid grid-cols-2 gap-2">
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
        </div>
        <div className="space-y-1.5">
          <Label className="text-white/60 text-xs">Depends on</Label>
          <Select value={dependsOn} onValueChange={setDependsOn} disabled={!canEdit}>
            <SelectTrigger className="bg-white/5 border-white/10">
              <SelectValue />
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
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-white/60 text-xs">Start</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={!canEdit}
              className="bg-white/5 border-white/10"
            />
          </div>
          {phaseKind === "span" ? (
            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs">End</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={!canEdit}
                className="bg-white/5 border-white/10"
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
            rows={2}
            className="bg-white/5 border-white/10 resize-none"
          />
        </div>
        {canEdit ? (
          <Button
            type="button"
            className="w-full bg-red-900 hover:bg-red-800"
            disabled={!title.trim() || !startDate || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Saving…" : "Save phase"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
