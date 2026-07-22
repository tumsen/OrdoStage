import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import { formatMoneyFromCents, parseMoneyToCents } from "@/lib/formatMoney";
import { formatMinutesAsDurationBoth } from "@/lib/durationHours";
import { commaDecimalForLanguage } from "@/lib/timeGrid";
import { useI18n } from "@/lib/i18n";
import {
  COST_CATEGORY_COLORS,
  COST_CATEGORY_LABELS,
} from "@/lib/productionPlannerTheme";
import type {
  ProductionCostCategory,
  ProductionCostLine,
  ProductionPlannerRow,
  CreateProductionCostLine,
} from "@/lib/types";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

const CATEGORIES = Object.keys(COST_CATEGORY_LABELS) as ProductionCostCategory[];

function SummaryCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warn";
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-white/40">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold tabular-nums mt-0.5",
          tone === "good" && "text-emerald-300",
          tone === "warn" && "text-amber-300",
          !tone && "text-white/90"
        )}
      >
        {value}
      </p>
      {sub ? <p className="text-[10px] text-white/35 mt-0.5">{sub}</p> : null}
    </div>
  );
}

type CostFormState = {
  label: string;
  category: ProductionCostCategory;
  planned: string;
  actual: string;
  startDate: string;
  endDate: string;
  notes: string;
};

function emptyForm(): CostFormState {
  return {
    label: "",
    category: "other",
    planned: "",
    actual: "",
    startDate: "",
    endDate: "",
    notes: "",
  };
}

export function ProductionCostPanel({
  row,
  currencyCode,
  canEdit,
  plannerQueryKey,
}: {
  row: ProductionPlannerRow | null;
  currencyCode: string;
  canEdit: boolean;
  plannerQueryKey: unknown[];
}) {
  const queryClient = useQueryClient();
  const { language } = useI18n();
  const commaDec = commaDecimalForLanguage(language);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductionCostLine | null>(null);
  const [form, setForm] = useState<CostFormState>(emptyForm);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: plannerQueryKey });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!row) throw new Error("No production selected");
      const plannedCents = parseMoneyToCents(form.planned) ?? 0;
      const actualCents =
        form.actual.trim() === "" ? null : parseMoneyToCents(form.actual);
      if (form.actual.trim() !== "" && actualCents === null) {
        throw new Error("Invalid actual amount");
      }
      const payload: CreateProductionCostLine = {
        category: form.category,
        label: form.label.trim(),
        plannedCents,
        actualCents,
        currencyCode,
        startDate: form.startDate.trim() || null,
        endDate: form.endDate.trim() || null,
        notes: form.notes.trim() || null,
        productionId: row.id,
      };
      if (editing) {
        return api.patch(`/api/production-planner/costs/${editing.id}`, {
          category: payload.category,
          label: payload.label,
          plannedCents: payload.plannedCents,
          actualCents: payload.actualCents,
          startDate: payload.startDate,
          endDate: payload.endDate,
          notes: payload.notes,
        });
      }
      return api.post<ProductionCostLine>("/api/production-planner/costs", payload);
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm());
      toast({ title: editing ? "Cost updated" : "Cost line added" });
    },
    onError: (e) =>
      toast({
        title: e instanceof Error ? e.message : "Could not save",
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/production-planner/costs/${id}`),
    onSuccess: () => {
      invalidate();
      toast({ title: "Cost line removed" });
    },
    onError: () => toast({ title: "Could not delete", variant: "destructive" }),
  });

  function openAdd() {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(line: ProductionCostLine) {
    setEditing(line);
    setForm({
      label: line.label,
      category: line.category,
      planned: (line.plannedCents / 100).toFixed(2),
      actual: line.actualCents != null ? (line.actualCents / 100).toFixed(2) : "",
      startDate: line.startDate?.slice(0, 10) ?? "",
      endDate: line.endDate?.slice(0, 10) ?? "",
      notes: line.notes ?? "",
    });
    setDialogOpen(true);
  }

  if (!row) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#12121a]/60 p-6 text-center text-sm text-white/40">
        Select a production on the timeline to view and manage its budget.
      </div>
    );
  }

  const s = row.costSummary;
  const varianceTone = s.varianceCents > 0 ? "warn" : s.varianceCents < 0 ? "good" : "default";
  const laborHours = formatMinutesAsDurationBoth(s.loggedLaborMinutes, commaDec);

  return (
    <div className="rounded-xl border border-white/10 bg-[#12121a]/80 flex flex-col min-h-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
              Cost management
            </p>
            <p className="text-sm font-medium text-white truncate mt-0.5">{row.title}</p>
          </div>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              className="h-8 bg-red-900/80 hover:bg-red-800 text-white shrink-0"
              onClick={openAdd}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add cost
            </Button>
          ) : null}
        </div>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto flex-1">
        <div className="grid grid-cols-2 gap-2">
          <SummaryCard
            label="Budget (planned)"
            value={formatMoneyFromCents(s.plannedCents, currencyCode)}
          />
          <SummaryCard
            label="Actual spend"
            value={formatMoneyFromCents(s.actualCents, currencyCode)}
          />
          <SummaryCard
            label="Variance"
            value={formatMoneyFromCents(s.varianceCents, currencyCode)}
            tone={varianceTone}
            sub={s.varianceCents > 0 ? "Over budget" : s.varianceCents < 0 ? "Under budget" : "On plan"}
          />
          <SummaryCard
            label="Logged labor"
            value={laborHours}
            sub="From time entries linked to this production"
          />
        </div>

        {s.byCategory.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide text-white/40">By category</p>
            {s.byCategory.map((c) => (
              <div
                key={c.category}
                className="flex items-center justify-between text-xs py-1 border-b border-white/5"
              >
                <span className={COST_CATEGORY_COLORS[c.category]}>
                  {COST_CATEGORY_LABELS[c.category]}
                </span>
                <span className="text-white/60 tabular-nums">
                  {formatMoneyFromCents(c.plannedCents, currencyCode)}
                  {c.actualCents > 0 ? (
                    <span className="text-white/35"> / {formatMoneyFromCents(c.actualCents, currencyCode)}</span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-white/40">Line items</p>
          {row.costs.length === 0 ? (
            <p className="text-xs text-white/35 py-2">No cost lines yet. Add venue, crew, travel, and other budget items.</p>
          ) : (
            row.costs.map((line) => (
              <div
                key={line.id}
                className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 flex items-start gap-2 group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-white/85">{line.label}</span>
                    <span
                      className={cn(
                        "text-[10px] uppercase",
                        COST_CATEGORY_COLORS[line.category]
                      )}
                    >
                      {COST_CATEGORY_LABELS[line.category]}
                    </span>
                  </div>
                  <p className="text-xs text-white/45 tabular-nums mt-0.5">
                    Plan {formatMoneyFromCents(line.plannedCents, currencyCode)}
                    {line.actualCents != null
                      ? ` · Actual ${formatMoneyFromCents(line.actualCents, currencyCode)}`
                      : ""}
                  </p>
                  {line.startDate ? (
                    <p className="text-[10px] text-white/30 mt-0.5">
                      {line.startDate.slice(0, 10)}
                      {line.endDate ? ` → ${line.endDate.slice(0, 10)}` : ""}
                      <span className="text-white/25"> · shown on timeline</span>
                    </p>
                  ) : null}
                </div>
                {canEdit ? (
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-white/50"
                      onClick={() => openEdit(line)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400/70"
                      onClick={() => {
                        if (!confirmDeleteAction(`cost line "${line.label}"`)) return;
                        deleteMutation.mutate(line.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-white/40">
          <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <p>
            Set start dates on cost lines to show them as gold bars on the Gantt. Revenue lines use
            the revenue category (counts toward budget totals).
          </p>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#16161f] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit cost line" : "Add cost line"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs">Label</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Venue rental, Lighting hire"
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs">Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, category: v as ProductionCostCategory }))
                }
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#16161f] border-white/10">
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {COST_CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-white/60 text-xs">Planned ({currencyCode})</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.planned}
                  onChange={(e) => setForm((f) => ({ ...f, planned: e.target.value }))}
                  placeholder="0"
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-white/60 text-xs">Actual ({currencyCode})</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.actual}
                  onChange={(e) => setForm((f) => ({ ...f, actual: e.target.value }))}
                  placeholder="Optional"
                  className="bg-white/5 border-white/10"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-white/60 text-xs">Start date (timeline)</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="bg-white/5 border-white/10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-white/60 text-xs">End date</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="bg-white/5 border-white/10"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="bg-white/5 border-white/10 resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-white/10"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-red-900 hover:bg-red-800"
              disabled={!form.label.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
