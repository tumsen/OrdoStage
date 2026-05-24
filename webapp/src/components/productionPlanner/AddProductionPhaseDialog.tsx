import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  CreateProductionPhase,
  ProductionPhase,
  ProductionPhaseCategory,
  ProductionPhaseKind,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { TASK_CATEGORY_LABELS } from "@/lib/productionPlannerTheme";
import { toast } from "@/hooks/use-toast";

const PHASE_CATEGORIES = Object.keys(TASK_CATEGORY_LABELS).filter(
  (k) => k !== "planning_window" && k !== "cost"
) as ProductionPhaseCategory[];

const NONE = "__none__";

type FormState = {
  title: string;
  category: ProductionPhaseCategory;
  phaseKind: ProductionPhaseKind;
  startDate: string;
  endDate: string;
  dependsOnPhaseId: string;
};

function emptyForm(): FormState {
  return {
    title: "",
    category: "other",
    phaseKind: "span",
    startDate: "",
    endDate: "",
    dependsOnPhaseId: NONE,
  };
}

export function AddProductionPhaseDialog({
  productionId,
  productionName,
  existingPhases,
  open,
  onOpenChange,
  onCreated,
}: {
  productionId: string | null;
  productionName: string;
  existingPhases: Array<{ id: string; title: string }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!productionId) throw new Error("No production selected");
      const payload: CreateProductionPhase = {
        title: form.title.trim(),
        category: form.category,
        phaseKind: form.phaseKind,
        startDate: form.startDate,
        endDate:
          form.phaseKind === "span" ? form.endDate.trim() || null : null,
        dependsOnPhaseId:
          form.dependsOnPhaseId === NONE ? null : form.dependsOnPhaseId,
      };
      return api.post<ProductionPhase>(`/api/productions/${productionId}/phases`, payload);
    },
    onSuccess: () => {
      onCreated();
      setForm(emptyForm());
      onOpenChange(false);
      toast({ title: "Phase added to plan" });
    },
    onError: (e) =>
      toast({
        title: e instanceof Error ? e.message : "Could not add phase",
        variant: "destructive",
      }),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setForm(emptyForm());
        onOpenChange(next);
      }}
    >
      <DialogContent className="bg-[#16161f] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Add plan line</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-white/45 -mt-2 truncate">{productionName}</p>
        <p className="text-xs text-white/35">
          Each phase gets its own row on the Gantt. Link a dependency for finish-to-start scheduling.
        </p>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-white/60 text-xs">Title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Costume fittings, Set painting deadline"
              className="bg-white/5 border-white/10"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs">Type</Label>
              <Select
                value={form.phaseKind}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    phaseKind: v as ProductionPhaseKind,
                    endDate: v === "span" ? f.endDate : "",
                  }))
                }
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
                value={form.category}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, category: v as ProductionPhaseCategory }))
                }
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#16161f] border-white/10">
                  {PHASE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {TASK_CATEGORY_LABELS[cat] ?? cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-white/60 text-xs">Depends on (finish → start)</Label>
            <Select
              value={form.dependsOnPhaseId}
              onValueChange={(v) => setForm((f) => ({ ...f, dependsOnPhaseId: v }))}
            >
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10">
                <SelectItem value={NONE}>None</SelectItem>
                {existingPhases.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs">
                {form.phaseKind === "span" ? "Start date" : "Date"}
              </Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className="bg-white/5 border-white/10"
              />
            </div>
            {form.phaseKind === "span" ? (
              <div className="space-y-1.5">
                <Label className="text-white/60 text-xs">End date</Label>
                <Input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="bg-white/5 border-white/10"
                />
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="border-white/10"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-red-900 hover:bg-red-800"
            disabled={!form.title.trim() || !form.startDate || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Adding…" : "Add to plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
