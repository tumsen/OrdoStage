import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CompTimeHhhMmField } from "@/components/time/CompTimeHhhMmField";
import type { LeaveBalanceSummary } from "@/contracts/backendTypes";

function todayIsoDate(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function LeaveOpeningBalanceForm(props: {
  personId: string;
  leave: LeaveBalanceSummary;
  canEdit: boolean;
  compact?: boolean;
  onSaved?: () => void;
}) {
  const { personId, leave, canEdit, compact, onSaved } = props;
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [vacationRemaining, setVacationRemaining] = useState("");
  const [extraVacationRemaining, setExtraVacationRemaining] = useState("");
  const [compTimeMinutes, setCompTimeMinutes] = useState(leave.compTimeRemainingMinutes);
  const [effectiveDate, setEffectiveDate] = useState(todayIsoDate);
  const [note, setNote] = useState("");

  useEffect(() => {
    setVacationRemaining(leave.vacationRemainingDays.toFixed(1));
    setExtraVacationRemaining(leave.extraVacationRemainingDays.toFixed(1));
    setCompTimeMinutes(leave.compTimeRemainingMinutes);
  }, [
    leave.vacationRemainingDays,
    leave.extraVacationRemainingDays,
    leave.compTimeRemainingMinutes,
  ]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: {
        personId: string;
        vacationYearKey: string;
        note: string;
        effectiveDate?: string;
        vacationRemainingDays?: number;
        extraVacationRemainingDays?: number;
        compTimeRemainingMinutes?: number;
      } = {
        personId,
        vacationYearKey: leave.vacationYearKey,
        note: note.trim(),
        effectiveDate,
      };

      const vac = parseFloat(vacationRemaining.replace(",", "."));
      if (!Number.isNaN(vac) && vac !== leave.vacationRemainingDays) {
        payload.vacationRemainingDays = vac;
      }

      const extra = parseFloat(extraVacationRemaining.replace(",", "."));
      if (!Number.isNaN(extra) && extra !== leave.extraVacationRemainingDays) {
        payload.extraVacationRemainingDays = extra;
      }

      if (compTimeMinutes !== leave.compTimeRemainingMinutes) {
        payload.compTimeRemainingMinutes = compTimeMinutes;
      }

      const hasChange =
        payload.vacationRemainingDays !== undefined ||
        payload.extraVacationRemainingDays !== undefined ||
        payload.compTimeRemainingMinutes !== undefined;

      if (!hasChange) {
        throw new Error(t("time.leaveOpeningBalanceNoChanges"));
      }

      return api.post<LeaveBalanceSummary>("/api/time/leave-opening-balances", payload);
    },
    onSuccess: () => {
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["time-leave-transactions", personId] });
      queryClient.invalidateQueries({ queryKey: ["time-leave-balances", personId] });
      queryClient.invalidateQueries({ queryKey: ["people", personId, "leave-profile"] });
      toast({ title: t("time.leaveOpeningBalanceSaved") });
      onSaved?.();
    },
    onError: (e: Error) => {
      toast({
        title: t("time.leaveOpeningBalanceError"),
        description: e.message,
        variant: "destructive",
      });
    },
  });

  if (!canEdit) return null;

  return (
    <div
      className={
        compact
          ? "rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2"
          : "rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-3 space-y-3"
      }
    >
      <div>
        <p className="text-xs font-medium text-white/70">{t("time.leaveOpeningBalanceTitle")}</p>
        <p className="text-[11px] text-white/40 mt-0.5">{t("time.leaveOpeningBalanceHint")}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-white/45">{t("time.leaveVacationRemaining")}</Label>
          <Input
            type="text"
            inputMode="decimal"
            value={vacationRemaining}
            onChange={(e) => setVacationRemaining(e.target.value)}
            className="h-8 bg-white/5 border-white/10 text-white text-xs tabular-nums"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-white/45">{t("time.leaveExtraRemaining")}</Label>
          <Input
            type="text"
            inputMode="decimal"
            value={extraVacationRemaining}
            onChange={(e) => setExtraVacationRemaining(e.target.value)}
            className="h-8 bg-white/5 border-white/10 text-white text-xs tabular-nums"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-white/45">{t("time.leaveOpeningBalanceCompTime")}</Label>
          <CompTimeHhhMmField
            valueMinutes={compTimeMinutes}
            onChangeMinutes={setCompTimeMinutes}
            allowNegative
            aria-label={t("time.leaveOpeningBalanceCompTime")}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-white/45">{t("time.leaveOpeningBalanceEffectiveDate")}</Label>
          <Input
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            className="h-8 bg-white/5 border-white/10 text-white text-xs [color-scheme:dark]"
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
          placeholder={t("time.leaveOpeningBalanceNotePlaceholder")}
        />
      </div>

      <Button
        type="button"
        size="sm"
        className="h-8 bg-emerald-600/80 hover:bg-emerald-600 text-white text-xs"
        disabled={saveMutation.isPending || !note.trim()}
        onClick={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? "…" : t("time.leaveOpeningBalanceSave")}
      </Button>
    </div>
  );
}
