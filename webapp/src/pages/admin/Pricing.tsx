import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, isApiError } from "@/lib/api";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Info, Trash2 } from "lucide-react";
import {
  pickBaselinePack,
  listPriceCents,
  savingsPercentFromPrice,
  priceCentsFromDiscountPercent,
  formatPercentLabel,
} from "@/lib/packBaseline";

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
  discountPercent: string;
  active: boolean;
}

function PackRow({
  pack,
  baselinePack,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
}: {
  pack: PricePack;
  baselinePack: PricePack | null;
  onSave: (packRecordId: string, data: { label?: string; amountCents?: number; active?: boolean }) => void;
  onDelete: (pack: PricePack) => void;
  isSaving: boolean;
  isDeleting: boolean;
}) {
  const [edits, setEdits] = useState<PackEdits>({
    label: pack.label,
    amountEuros: (pack.amountCents / 100).toFixed(2),
    discountPercent: "",
    active: pack.active,
  });

  useEffect(() => {
    const euros = (pack.amountCents / 100).toFixed(2);
    let discountPercent = "";
    if (baselinePack && pack.days > 0) {
      discountPercent = String(savingsPercentFromPrice(pack.amountCents, pack.days, baselinePack));
    }
    setEdits({
      label: pack.label,
      amountEuros: euros,
      discountPercent,
      active: pack.active,
    });
  }, [pack.amountCents, pack.label, pack.active, pack.days, pack.packId, baselinePack]);

  const isBaseline = baselinePack?.packId === pack.packId;

  const parsedAmountCents = Math.round(parseFloat(edits.amountEuros) * 100);
  const liveSavingsPct =
    baselinePack && pack.days > 0 && !isNaN(parsedAmountCents)
      ? savingsPercentFromPrice(parsedAmountCents, pack.days, baselinePack)
      : 0;

  const eurosPerDay =
    pack.days > 0 && !isNaN(parsedAmountCents)
      ? (parsedAmountCents / 100 / pack.days).toFixed(4)
      : "—";

  const isDirty =
    !isNaN(parsedAmountCents) &&
    parsedAmountCents >= 1 &&
    (edits.label !== pack.label ||
      parsedAmountCents !== pack.amountCents ||
      edits.active !== pack.active);

  const handleSave = () => {
    if (isNaN(parsedAmountCents) || parsedAmountCents < 1) return;
    onSave(pack.id, {
      label: edits.label,
      amountCents: parsedAmountCents,
      active: edits.active,
    });
  };

  const onPriceChange = (raw: string) => {
    setEdits((prev) => {
      const next = { ...prev, amountEuros: raw };
      const cents = Math.round(parseFloat(raw) * 100);
      if (baselinePack && pack.days > 0 && !isNaN(cents)) {
        next.discountPercent = String(savingsPercentFromPrice(cents, pack.days, baselinePack));
      }
      return next;
    });
  };

  const onPercentChange = (raw: string) => {
    const p = parseFloat(raw.replace(",", "."));
    if (!baselinePack || pack.days <= 0 || raw.trim() === "") {
      setEdits((prev) => ({ ...prev, discountPercent: raw }));
      return;
    }
    if (isNaN(p)) {
      setEdits((prev) => ({ ...prev, discountPercent: raw }));
      return;
    }
    const cents = priceCentsFromDiscountPercent(p, pack.days, baselinePack);
    setEdits((prev) => ({
      ...prev,
      discountPercent: raw,
      amountEuros: (cents / 100).toFixed(2),
    }));
  };

  const listCents =
    baselinePack && pack.days > 0 ? listPriceCents(pack.days, baselinePack) : 0;

  return (
    <TableRow className="border-white/5 hover:bg-white/[0.02]">
      <TableCell className="text-white/30 text-xs font-mono max-w-[100px] truncate" title={pack.packId}>
        {pack.packId}
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-blue-950/60 text-blue-300 border border-blue-800/30">
          {pack.days}d
        </span>
      </TableCell>
      <TableCell>
        <Input
          value={edits.label}
          onChange={(e) => setEdits((prev) => ({ ...prev, label: e.target.value }))}
          className="bg-gray-800 border-white/10 text-white placeholder:text-white/20 focus-visible:ring-ordo-magenta/30 h-8 text-sm min-w-[7rem]"
        />
      </TableCell>
      <TableCell className="text-xs text-white/55 tabular-nums whitespace-nowrap">€{eurosPerDay}/day</TableCell>
      <TableCell className="text-xs">
        {baselinePack ? (
          <span
            className={`tabular-nums ${liveSavingsPct > 0.05 ? "text-ordo-yellow" : liveSavingsPct < -0.05 ? "text-orange-300/90" : "text-white/45"}`}
            title={
              listCents > 0
                ? `List at smallest-pack rate: €${(listCents / 100).toFixed(2)}`
                : undefined
            }
          >
            {formatPercentLabel(liveSavingsPct)}
          </span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <span className="text-white/40 text-sm">€</span>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={edits.amountEuros}
            onChange={(e) => onPriceChange(e.target.value)}
            className="bg-gray-800 border-white/10 text-white focus-visible:ring-ordo-magenta/30 h-8 text-sm w-[5.5rem]"
          />
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            step="0.1"
            title="% vs list price at smallest-pack rate (negative = markup)"
            placeholder="0"
            disabled={!baselinePack || isBaseline}
            value={edits.discountPercent}
            onChange={(e) => onPercentChange(e.target.value)}
            className="bg-gray-800 border-white/10 text-white focus-visible:ring-ordo-magenta/30 h-8 text-sm w-[4.25rem] disabled:opacity-40"
          />
          <span className="text-white/35 text-xs">%</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch
            checked={edits.active}
            onCheckedChange={(checked) => setEdits((prev) => ({ ...prev, active: checked }))}
            className="data-[state=checked]:bg-ordo-magenta"
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
              ? "bg-ordo-magenta/90 hover:bg-ordo-magenta text-white"
              : "bg-white/5 text-white/20 border border-white/10 cursor-default"
          }`}
          variant={isDirty ? "default" : "outline"}
        >
          {isSaving ? "Saving…" : isDirty ? "Save" : "Saved"}
        </Button>
      </TableCell>
      <TableCell>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-white/35 hover:text-red-400 hover:bg-red-950/40"
          disabled={isDeleting}
          onClick={() => onDelete(pack)}
          aria-label={`Delete pack ${pack.label}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function Pricing() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  /** PricePack primary key (cuid), used in PUT/DELETE URLs — avoids slug encoding/proxy edge cases. */
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newPackId, setNewPackId] = useState("");
  const [newDays, setNewDays] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newAmountEuros, setNewAmountEuros] = useState("");
  const [newDiscountPercent, setNewDiscountPercent] = useState("");
  const [packToDelete, setPackToDelete] = useState<PricePack | null>(null);

  const { data: packs, isPending } = useQuery<PricePack[]>({
    queryKey: ["admin", "packs"],
    queryFn: () => api.get<PricePack[]>("/api/admin/packs"),
  });

  const baselinePack = useMemo(() => pickBaselinePack(packs ?? []), [packs]);

  const updateMutation = useMutation({
    mutationFn: ({
      packRecordId,
      data,
    }: {
      packRecordId: string;
      data: { label?: string; amountCents?: number; active?: boolean };
    }) => api.put(`/api/admin/packs/${encodeURIComponent(packRecordId)}`, data),
    onMutate: ({ packRecordId }) => {
      setSavingId(packRecordId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "packs"] });
      queryClient.invalidateQueries({ queryKey: ["public-pricing"] });
      setSavingId(null);
      toast({ title: "Pack updated", description: "Price pack has been saved." });
    },
    onError: (err) => {
      setSavingId(null);
      const msg = isApiError(err) ? err.message : "Failed to update pack.";
      toast({ title: "Error", description: msg, variant: "destructive" });
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
      queryClient.invalidateQueries({ queryKey: ["public-pricing"] });
      setNewPackId("");
      setNewDays("");
      setNewLabel("");
      setNewAmountEuros("");
      setNewDiscountPercent("");
      toast({ title: "Pack created", description: "New credit pack has been added." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create pack.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (packRecordId: string) =>
      api.delete(`/api/admin/packs/${encodeURIComponent(packRecordId)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "packs"] });
      queryClient.invalidateQueries({ queryKey: ["public-pricing"] });
      setPackToDelete(null);
      toast({ title: "Pack deleted", description: "Pack removed and auto top-up cleared where needed." });
    },
    onError: (err) => {
      const msg = isApiError(err) ? err.message : "Failed to delete pack.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const handleSave = (packRecordId: string, data: { label?: string; amountCents?: number; active?: boolean }) => {
    updateMutation.mutate({ packRecordId, data });
  };

  const parsedDays = parseInt(newDays, 10);
  const parsedNewAmountCents = Math.round(parseFloat(newAmountEuros) * 100);

  const newListCents =
    baselinePack && !isNaN(parsedDays) && parsedDays > 0
      ? listPriceCents(parsedDays, baselinePack)
      : 0;

  const syncNewPriceFromPercent = (rawPercent: string) => {
    setNewDiscountPercent(rawPercent);
    const p = parseFloat(rawPercent.replace(",", "."));
    if (!baselinePack || isNaN(parsedDays) || parsedDays <= 0 || isNaN(p)) return;
    const cents = priceCentsFromDiscountPercent(p, parsedDays, baselinePack);
    setNewAmountEuros((cents / 100).toFixed(2));
  };

  const syncNewPercentFromPrice = (rawEuros: string) => {
    setNewAmountEuros(rawEuros);
    const cents = Math.round(parseFloat(rawEuros) * 100);
    if (!baselinePack || isNaN(parsedDays) || parsedDays <= 0 || isNaN(cents)) return;
    setNewDiscountPercent(String(savingsPercentFromPrice(cents, parsedDays, baselinePack)));
  };

  const canCreate =
    !createMutation.isPending &&
    !isNaN(parsedDays) &&
    parsedDays > 0 &&
    !isNaN(parsedNewAmountCents) &&
    parsedNewAmountCents > 0 &&
    newLabel.trim().length > 0;

  const COL_COUNT = 10;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Credit packs</h2>
        <p className="text-sm text-white/50 mt-1 max-w-3xl">
          The <strong className="text-white/70">smallest pack</strong> is the one with the fewest credit-days (tie-break:
          cheapest). Other packs show <strong className="text-white/70">% vs that list price</strong>. Enter{" "}
          <strong className="text-white/70">€</strong> or <strong className="text-white/70">%</strong> — the other field
          updates. Negative % means a markup vs list (campaigns usually use positive % off). Active packs appear on public{" "}
          <span className="text-white/70">/pricing</span>.
        </p>
      </div>

      <div className="rounded-lg border border-white/10 p-4 bg-white/[0.02]">
        <h3 className="text-sm font-semibold text-white/80 mb-3 uppercase tracking-wider">Add credit pack</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
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
            onChange={(e) => {
              setNewDays(e.target.value);
              const d = parseInt(e.target.value, 10);
              if (baselinePack && !isNaN(d) && d > 0 && !isNaN(parsedNewAmountCents)) {
                setNewDiscountPercent(String(savingsPercentFromPrice(parsedNewAmountCents, d, baselinePack)));
              }
            }}
            className="bg-gray-800 border-white/10 text-white placeholder:text-white/20"
          />
          <Input
            placeholder="Label (e.g. 750 days)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="bg-gray-800 border-white/10 text-white placeholder:text-white/20"
          />
          <div className="flex items-center gap-1">
            <span className="text-white/40 text-sm">€</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="Price"
              value={newAmountEuros}
              onChange={(e) => syncNewPercentFromPrice(e.target.value)}
              className="bg-gray-800 border-white/10 text-white placeholder:text-white/20"
            />
          </div>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              step="0.1"
              placeholder="% vs list"
              disabled={!baselinePack || isNaN(parsedDays) || parsedDays <= 0}
              value={newDiscountPercent}
              onChange={(e) => syncNewPriceFromPercent(e.target.value)}
              className="bg-gray-800 border-white/10 text-white placeholder:text-white/20"
            />
            <span className="text-white/35 text-sm">%</span>
          </div>
          {newListCents > 0 ? (
            <div className="text-xs text-white/45 flex items-center lg:col-span-1">
              List @ baseline: €{(newListCents / 100).toFixed(2)}
            </div>
          ) : (
            <div />
          )}
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            onClick={() =>
              createMutation.mutate({
                packId: newPackId.trim() || undefined,
                days: parsedDays,
                label: newLabel.trim(),
                amountCents: parsedNewAmountCents,
                active: true,
              })
            }
            disabled={!canCreate}
            className="bg-ordo-violet/90 hover:bg-ordo-violet text-white border-0"
          >
            {createMutation.isPending ? "Creating..." : "Create pack"}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-white/10 overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Pack ID</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Days</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Label</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
                € / day
              </TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">vs smallest</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Price</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider whitespace-nowrap">
                % vs list
              </TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Status</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Save</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="border-white/5">
                  {Array.from({ length: COL_COUNT }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-white/5 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : !packs?.length ? (
              <TableRow className="border-white/5">
                <TableCell colSpan={COL_COUNT} className="text-center text-white/30 py-12">
                  No price packs configured
                </TableCell>
              </TableRow>
            ) : (
              packs.map((pack) => (
                <PackRow
                  key={pack.id}
                  pack={pack}
                  baselinePack={baselinePack}
                  onSave={handleSave}
                  onDelete={setPackToDelete}
                  isSaving={savingId === pack.id}
                  isDeleting={Boolean(deleteMutation.isPending && packToDelete?.id === pack.id)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={packToDelete != null} onOpenChange={(open) => !open && setPackToDelete(null)}>
        <AlertDialogContent className="bg-[#0d0d14] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this pack?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/55">
              {packToDelete ? (
                <>
                  <span className="text-white/80">{packToDelete.label}</span> ({packToDelete.packId}) will be removed.
                  Organisations that used it for automatic top-up will have that disabled.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-white/15 text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-700 hover:bg-red-600 text-white"
              onClick={() => packToDelete && deleteMutation.mutate(packToDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex items-start gap-2 p-4 rounded-lg bg-white/[0.02] border border-white/5 text-sm text-white/40">
        <Info size={14} className="flex-shrink-0 mt-0.5" />
        <span>
          Changes apply to new purchases. Paddle checkouts already opened are unchanged. Deleting a pack clears it from
          auto top-up settings.
        </span>
      </div>
    </div>
  );
}
