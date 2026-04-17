import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Info } from "lucide-react";

interface PricePack {
  id: string;
  packId: string;
  days: number;
  label: string;
  amountCents: number;
  active: boolean;
}

interface PackEdits {
  label: string;
  amountEuros: string;
  active: boolean;
}

function PackRow({
  pack,
  onSave,
  isSaving,
}: {
  pack: PricePack;
  onSave: (packId: string, data: { label?: string; amountCents?: number; active?: boolean }) => void;
  isSaving: boolean;
}) {
  const [edits, setEdits] = useState<PackEdits>({
    label: pack.label,
    amountEuros: (pack.amountCents / 100).toFixed(2),
    active: pack.active,
  });

  const isDirty =
    edits.label !== pack.label ||
    parseFloat(edits.amountEuros) * 100 !== pack.amountCents ||
    edits.active !== pack.active;

  const handleSave = () => {
    const amountCents = Math.round(parseFloat(edits.amountEuros) * 100);
    if (isNaN(amountCents)) return;
    onSave(pack.packId, {
      label: edits.label,
      amountCents,
      active: edits.active,
    });
  };

  return (
    <TableRow className="border-white/5 hover:bg-white/[0.02]">
      <TableCell className="text-white/30 text-xs font-mono">{pack.id.slice(0, 8)}…</TableCell>
      <TableCell>
        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-blue-950/60 text-blue-300 border border-blue-800/30">
          {pack.days}d
        </span>
      </TableCell>
      <TableCell>
        <Input
          value={edits.label}
          onChange={(e) => setEdits((prev) => ({ ...prev, label: e.target.value }))}
          className="bg-gray-800 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-rose-500/30 h-8 text-sm w-40"
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <span className="text-white/40 text-sm">€</span>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={edits.amountEuros}
            onChange={(e) => setEdits((prev) => ({ ...prev, amountEuros: e.target.value }))}
            className="bg-gray-800 border-white/10 text-white focus-visible:ring-rose-500/30 h-8 text-sm w-24"
          />
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch
            checked={edits.active}
            onCheckedChange={(checked) => setEdits((prev) => ({ ...prev, active: checked }))}
            className="data-[state=checked]:bg-rose-600"
          />
          <span className="text-xs text-white/40">{edits.active ? "Active" : "Inactive"}</span>
        </div>
      </TableCell>
      <TableCell>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!isDirty || isSaving}
          className={`text-xs h-7 ${
            isDirty
              ? "bg-rose-700 hover:bg-rose-600 text-white"
              : "bg-white/5 text-white/20 border border-white/10 cursor-default"
          }`}
          variant={isDirty ? "default" : "outline"}
        >
          {isSaving ? "Saving…" : isDirty ? "Save" : "Saved"}
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function Pricing() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newPackId, setNewPackId] = useState("");
  const [newDays, setNewDays] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newAmountEuros, setNewAmountEuros] = useState("");

  const { data: packs, isPending } = useQuery<PricePack[]>({
    queryKey: ["admin", "packs"],
    queryFn: () => api.get<PricePack[]>("/api/admin/packs"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ packId, data }: { packId: string; data: { label?: string; amountCents?: number; active?: boolean } }) =>
      api.put(`/api/admin/packs/${packId}`, data),
    onMutate: ({ packId }) => {
      setSavingId(packId);
    },
    onSuccess: (_, { packId }) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "packs"] });
      setSavingId(null);
      toast({ title: "Pack updated", description: "Price pack has been saved." });
    },
    onError: () => {
      setSavingId(null);
      toast({ title: "Error", description: "Failed to update pack.", variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: {
      packId?: string;
      days: number;
      label: string;
      amountCents: number;
      active?: boolean;
    }) => api.post("/api/admin/packs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "packs"] });
      setNewPackId("");
      setNewDays("");
      setNewLabel("");
      setNewAmountEuros("");
      toast({ title: "Pack created", description: "New credit pack has been added." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create pack.", variant: "destructive" });
    },
  });

  const handleSave = (packId: string, data: { label?: string; amountCents?: number; active?: boolean }) => {
    updateMutation.mutate({ packId, data });
  };

  const parsedDays = parseInt(newDays, 10);
  const parsedAmountCents = Math.round(parseFloat(newAmountEuros) * 100);
  const canCreate =
    !createMutation.isPending &&
    !isNaN(parsedDays) &&
    parsedDays > 0 &&
    !isNaN(parsedAmountCents) &&
    parsedAmountCents > 0 &&
    newLabel.trim().length > 0;

  return (
    <div className="p-6 space-y-4">
      <div className="rounded-lg border border-white/10 p-4 bg-white/[0.02]">
        <h3 className="text-sm font-semibold text-white/80 mb-3 uppercase tracking-wider">Add Credit Pack</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input
            placeholder="Pack ID (optional)"
            value={newPackId}
            onChange={(e) => setNewPackId(e.target.value)}
            className="bg-gray-800 border-white/10 text-white placeholder:text-white/20"
          />
          <Input
            type="number"
            min="1"
            placeholder="Days (e.g. 750)"
            value={newDays}
            onChange={(e) => setNewDays(e.target.value)}
            className="bg-gray-800 border-white/10 text-white placeholder:text-white/20"
          />
          <Input
            placeholder="Label (e.g. 750 days)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="bg-gray-800 border-white/10 text-white placeholder:text-white/20"
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Price € (e.g. 49.00)"
            value={newAmountEuros}
            onChange={(e) => setNewAmountEuros(e.target.value)}
            className="bg-gray-800 border-white/10 text-white placeholder:text-white/20"
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            onClick={() =>
              createMutation.mutate({
                packId: newPackId.trim() || undefined,
                days: parsedDays,
                label: newLabel.trim(),
                amountCents: parsedAmountCents,
                active: true,
              })
            }
            disabled={!canCreate}
            className="bg-rose-700 hover:bg-rose-600 text-white"
          >
            {createMutation.isPending ? "Creating..." : "Create Pack"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Pack ID</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Days</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Label</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Price</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Save</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="border-white/5">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-white/5 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !packs?.length ? (
              <TableRow className="border-white/5">
                <TableCell colSpan={6} className="text-center text-white/30 py-12">
                  No price packs configured
                </TableCell>
              </TableRow>
            ) : (
              packs.map((pack) => (
                <PackRow
                  key={pack.id}
                  pack={pack}
                  onSave={handleSave}
                  isSaving={savingId === pack.id}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Note */}
      <div className="flex items-start gap-2 p-4 rounded-lg bg-white/[0.02] border border-white/5 text-sm text-white/40">
        <Info size={14} className="flex-shrink-0 mt-0.5" />
        <span>
          Changes take effect immediately for new purchases. Existing Paddle checkout sessions are not affected.
        </span>
      </div>
    </div>
  );
}
