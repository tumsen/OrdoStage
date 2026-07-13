import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
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
import { Textarea } from "@/components/ui/textarea";
import type { LeaveBalanceSummary, LeaveTransaction } from "@/contracts/backendTypes";

const ADJUSTMENT_BALANCE_TYPES = [
  "vacation_earned",
  "vacation_used",
  "extra_vacation_used",
  "comp_time_earned",
  "comp_time_used",
  "sick_days",
] as const;

type AdjustmentBalanceType = (typeof ADJUSTMENT_BALANCE_TYPES)[number];

function isCompTimeType(t: string) {
  return t === "comp_time_earned" || t === "comp_time_used";
}

function formatAmount(amount: number, balanceType: string): string {
  if (isCompTimeType(balanceType)) {
    const sign = amount < 0 ? "-" : "";
    const m = Math.abs(Math.round(amount));
    const h = Math.floor(m / 60);
    const mm = m % 60;
    if (mm === 0) return `${sign}${h}h`;
    return `${sign}${h}h ${mm}m`;
  }
  const sign = amount < 0 ? "" : amount > 0 ? "+" : "";
  return `${sign}${amount.toFixed(2).replace(/\.?0+$/, "")}d`;
}

export function LeaveLedgerPanel(props: {
  personId: string;
  vacationYearKey?: string;
  canAdjust: boolean;
  compact?: boolean;
}) {
  const { personId, vacationYearKey, canAdjust, compact } = props;
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [balanceType, setBalanceType] = useState<AdjustmentBalanceType>("vacation_earned");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const qs = vacationYearKey
    ? `?vacationYearKey=${encodeURIComponent(vacationYearKey)}`
    : "";

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["time-leave-transactions", personId, vacationYearKey],
    queryFn: () => api.get<LeaveTransaction[]>(`/api/time/leave-transactions/${personId}${qs}`),
    enabled: Boolean(personId),
  });

  const adjustMutation = useMutation({
    mutationFn: () =>
      api.post<LeaveBalanceSummary>("/api/time/leave-adjustments", {
        personId,
        balanceType,
        amount: parseFloat(amount),
        vacationYearKey,
        note: note.trim(),
      }),
    onSuccess: () => {
      setAmount("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["time-leave-transactions", personId] });
      queryClient.invalidateQueries({ queryKey: ["time-leave-balances", personId] });
      queryClient.invalidateQueries({ queryKey: ["people", personId, "leave-profile"] });
      toast({ title: t("time.leaveAdjustmentSaved") });
    },
    onError: (e: Error) => {
      toast({ title: t("time.leaveAdjustmentError"), description: e.message, variant: "destructive" });
    },
  });

  const sourceLabel = (source: string) => {
    const key = `time.leaveSource_${source}` as const;
    const msg = t(key as never);
    return msg === key ? source : msg;
  };

  const balanceLabel = (bt: string) => {
    const key = `time.leaveBalance_${bt}` as const;
    const msg = t(key as never);
    return msg === key ? bt : msg;
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <p className={compact ? "text-[10px] uppercase tracking-wide text-white/35" : "text-xs font-medium text-white/55"}>
        {t("time.leaveTransactionLog")}
      </p>

      {canAdjust ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2">
          <p className="text-xs text-white/50">{t("time.leaveAdjustmentHint")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-white/45">{t("time.leaveAdjustmentAccount")}</Label>
              <Select
                value={balanceType}
                onValueChange={(v) => setBalanceType(v as AdjustmentBalanceType)}
              >
                <SelectTrigger className="h-8 bg-white/5 border-white/10 text-white text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#16161f] border-white/10 text-white">
                  {ADJUSTMENT_BALANCE_TYPES.map((bt) => (
                    <SelectItem key={bt} value={bt}>
                      {balanceLabel(bt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-white/45">{t("time.leaveAdjustmentAmount")}</Label>
              <Input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={isCompTimeType(balanceType) ? "60" : "1"}
                className="h-8 bg-white/5 border-white/10 text-white text-xs"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-white/45">{t("time.leaveAdjustmentNote")}</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="bg-white/5 border-white/10 text-white text-xs resize-none"
              placeholder={t("time.leaveAdjustmentNotePlaceholder")}
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8 bg-white/10 hover:bg-white/15 text-white text-xs"
            disabled={
              adjustMutation.isPending ||
              !note.trim() ||
              amount.trim() === "" ||
              Number.isNaN(parseFloat(amount))
            }
            onClick={() => adjustMutation.mutate()}
          >
            {adjustMutation.isPending ? "…" : t("time.leaveAdjustmentSave")}
          </Button>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-xs text-white/40">{t("time.leaveTransactionLoading")}</p>
      ) : !transactions?.length ? (
        <p className="text-xs text-white/40">{t("time.leaveTransactionEmpty")}</p>
      ) : (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-white/10">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-[#12121a] text-white/40">
              <tr>
                <th className="px-2 py-1.5 font-medium">{t("time.leaveTransactionWhen")}</th>
                <th className="px-2 py-1.5 font-medium">{t("time.leaveTransactionAccount")}</th>
                <th className="px-2 py-1.5 font-medium text-right">{t("time.leaveTransactionAmount")}</th>
                <th className="px-2 py-1.5 font-medium">{t("time.leaveTransactionBy")}</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-t border-white/5 text-white/65">
                  <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">
                    {format(parseISO(tx.createdAt), "d MMM yyyy HH:mm")}
                  </td>
                  <td className="px-2 py-1.5">
                    <div>{balanceLabel(tx.balanceType)}</div>
                    <div className="text-[10px] text-white/35">{sourceLabel(tx.source)}</div>
                    {tx.note ? (
                      <div className="text-[10px] text-white/45 mt-0.5 max-w-[200px] truncate" title={tx.note}>
                        {tx.note}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium text-white/80">
                    {formatAmount(tx.amount, tx.balanceType)}
                  </td>
                  <td className="px-2 py-1.5 text-white/50 max-w-[120px] truncate">
                    {tx.createdByName ?? tx.createdByEmail ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
