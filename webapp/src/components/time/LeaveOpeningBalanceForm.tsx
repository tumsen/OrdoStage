import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { LeaveBalanceSummary } from "@/contracts/backendTypes";

function minutesToHoursMinutes(totalMinutes: number) {
  const sign = totalMinutes < 0 ? -1 : 1;
  const m = Math.abs(Math.round(totalMinutes));
  return { sign, hours: Math.floor(m / 60), minutes: m % 60 };
}

function hoursMinutesToTotal(sign: number, hours: string, minutes: string): number | null {
  const h = hours.trim() === "" ? 0 : parseInt(hours, 10);
  const m = minutes.trim() === "" ? 0 : parseInt(minutes, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return sign * (h * 60 + m);
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

  const compParts = minutesToHoursMinutes(leave.compTimeRemainingMinutes);

  const [vacationRemaining, setVacationRemaining] = useState("");
  const [extraVacationRemaining, setExtraVacationRemaining] = useState("");
  const [compHours, setCompHours] = useState("");
  const [compMinutes, setCompMinutes] = useState("");
  const [sickDays, setSickDays] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    setVacationRemaining(leave.vacationRemainingDays.toFixed(1));
    setExtraVacationRemaining(leave.extraVacationRemainingDays.toFixed(1));
    setCompHours(String(compParts.hours));
    setCompMinutes(String(compParts.minutes));
    setSickDays(String(leave.sickDays));
  }, [
    leave.vacationRemainingDays,
    leave.extraVacationRemainingDays,
    leave.compTimeRemainingMinutes,
    leave.sickDays,
    compParts.hours,
    compParts.minutes,
  ]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const compTotal = hoursMinutesToTotal(compParts.sign, compHours, compMinutes);
      if (compTotal === null) {
        throw new Error(t("time.leaveOpeningBalanceInvalidCompTime"));
      }

      const payload: {
        personId: string;
        vacationYearKey: string;
        note: string;
        vacationRemainingDays?: number;
        extraVacationRemainingDays?: number;
        compTimeRemainingMinutes?: number;
        sickDays?: number;
      } = {
        personId,
        vacationYearKey: leave.vacationYearKey,
        note: note.trim(),
      };

      const vac = parseFloat(vacationRemaining);
      if (!Number.isNaN(vac) && vac !== leave.vacationRemainingDays) {
        payload.vacationRemainingDays = vac;
      }

      const extra = parseFloat(extraVacationRemaining);
      if (!Number.isNaN(extra) && extra !== leave.extraVacationRemainingDays) {
        payload.extraVacationRemainingDays = extra;
      }

      if (compTotal !== leave.compTimeRemainingMinutes) {
        payload.compTimeRemainingMinutes = compTotal;
      }

      const sick = parseFloat(sickDays);
      if (!Number.isNaN(sick) && sick !== leave.sickDays) {
        payload.sickDays = sick;
      }

      const hasChange =
        payload.vacationRemainingDays !== undefined ||
        payload.extraVacationRemainingDays !== undefined ||
        payload.compTimeRemainingMinutes !== undefined ||
        payload.sickDays !== undefined;

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
            type="number"
            step="0.5"
            value={vacationRemaining}
            onChange={(e) => setVacationRemaining(e.target.value)}
            className="h-8 bg-white/5 border-white/10 text-white text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-white/45">{t("time.leaveExtraRemaining")}</Label>
          <Input
            type="number"
            step="0.5"
            value={extraVacationRemaining}
            onChange={(e) => setExtraVacationRemaining(e.target.value)}
            className="h-8 bg-white/5 border-white/10 text-white text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-white/45">{t("time.leaveOpeningBalanceCompTime")}</Label>
          <div className="flex gap-1.5">
            <Input
              type="number"
              min="0"
              value={compHours}
              onChange={(e) => setCompHours(e.target.value)}
              placeholder="0"
              className="h-8 bg-white/5 border-white/10 text-white text-xs"
            />
            <span className="self-center text-[10px] text-white/35">h</span>
            <Input
              type="number"
              min="0"
              max="59"
              value={compMinutes}
              onChange={(e) => setCompMinutes(e.target.value)}
              placeholder="0"
              className="h-8 bg-white/5 border-white/10 text-white text-xs w-16"
            />
            <span className="self-center text-[10px] text-white/35">m</span>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-white/45">{t("time.leaveSickDays")}</Label>
          <Input
            type="number"
            step="0.5"
            min="0"
            value={sickDays}
            onChange={(e) => setSickDays(e.target.value)}
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
