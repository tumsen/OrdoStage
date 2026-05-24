import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CreateProduction, Production } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

type FormState = {
  name: string;
  premiereDate: string;
  planningStartDate: string;
  notes: string;
  useDefaultPhases: boolean;
};

function emptyForm(): FormState {
  return {
    name: "",
    premiereDate: "",
    planningStartDate: "",
    notes: "",
    useDefaultPhases: true,
  };
}

export function CreateProductionDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (production: Production) => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: CreateProduction = {
        name: form.name.trim(),
        premiereDate: form.premiereDate.trim() || null,
        planningStartDate: form.planningStartDate.trim() || null,
        notes: form.notes.trim() || null,
        useDefaultPhases: form.useDefaultPhases && !!form.premiereDate.trim(),
      };
      return api.post<Production>("/api/productions", payload);
    },
    onSuccess: (production) => {
      onCreated(production);
      setForm(emptyForm());
      onOpenChange(false);
      toast({ title: "Production created" });
    },
    onError: (e) =>
      toast({
        title: e instanceof Error ? e.message : "Could not create production",
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
          <DialogTitle>New production</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-white/45 -mt-2">
          Plan set building, rehearsals, tech week, and premiere for a show you are creating — not
          tours or venue events.
        </p>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label className="text-white/60 text-xs">Show name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Hamlet 2026"
              className="bg-white/5 border-white/10"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs">Planning starts</Label>
              <Input
                type="date"
                value={form.planningStartDate}
                onChange={(e) => setForm((f) => ({ ...f, planningStartDate: e.target.value }))}
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs">Premiere date</Label>
              <Input
                type="date"
                value={form.premiereDate}
                onChange={(e) => setForm((f) => ({ ...f, premiereDate: e.target.value }))}
                className="bg-white/5 border-white/10"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-white/55 cursor-pointer">
            <Checkbox
              checked={form.useDefaultPhases}
              onCheckedChange={(v) => setForm((f) => ({ ...f, useDefaultPhases: v === true }))}
            />
            Add default phases (set build, rehearsals, tech, premiere)
          </label>
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
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-red-900 hover:bg-red-800"
            disabled={!form.name.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Creating…" : "Create production"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
