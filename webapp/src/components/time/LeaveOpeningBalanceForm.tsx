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

/** Fixed cell widths so ferie / feriefridage / overarbejde match exactly. */
const VALUE_CELL = "w-[7.5rem] shrink-0";
/** YYYY-MM-DD (10ch) + padding + native calendar control — no wider. */
const DATE_CELL = "w-[calc(10ch+1.75rem)] shrink-0";
const VALUE_INPUT =
  "h-8 w-full min-w-0 bg-white/5 border-white/10 text-white text-xs tabular-nums font-mono px-2";
const DATE_INPUT =
  "h-8 w-full min-w-0 bg-white/5 border-white/10 text-white text-xs tabular-nums px-1.5 [color-scheme:dark]";

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
  const [vacationDate, setVacationDate] = useState(todayIsoDate);
  const [extraVacationRemaining, setExtraVacationRemaining] = useState("");
  const [extraVacationDate, setExtraVacationDate] = useState(todayIsoDate);
  const [compTimeMinutes, setCompTimeMinutes] = useState(leave.compTimeRemainingMinutes);
  const [compTimeDate, setCompTimeDate] = useState(todayIsoDate);
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
        vacationRemainingDays?: number;
        vacationEffectiveDate?: string;
        extraVacationRemainingDays?: number;
        extraVacationEffectiveDate?: string;
        compTimeRemainingMinutes?: number;
        compTimeEffectiveDate?: string;
      } = {
        personId,
        vacationYearKey: leave.vacationYearKey,
        note: note.trim(),
      };

      const vac = parseFloat(vacationRemaining.replace(",", "."));
      if (!Number.isNaN(vac) && vac !== leave.vacationRemainingDays) {
        payload.vacationRemainingDays = vac;
        payload.vacationEffectiveDate = vacationDate;
      }

      const extra = parseFloat(extraVacationRemaining.replace(",", "."));
      if (!Number.isNaN(extra) && extra !== leave.extraVacationRemainingDays) {
        payload.extraVacationRemainingDays = extra;
        payload.extraVacationEffectiveDate = extraVacationDate;
      }

      if (compTimeMinutes !== leave.compTimeRemainingMinutes) {
        payload.compTimeRemainingMinutes = compTimeMinutes;
        payload.compTimeEffectiveDate = compTimeDate;
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

      <div className="space-y-2.5">
        <div className="space-y-1">
          <Label className="text-[10px] text-white/45">{t("time.leaveVacationRemaining")}</Label>
          <div className="flex items-center gap-2">
            <div className={VALUE_CELL}>
              <Input
                type="text"
                inputMode="decimal"
                value={vacationRemaining}
                onChange={(e) => setVacationRemaining(e.target.value)}
                className={VALUE_INPUT}
                aria-label={t("time.leaveVacationRemaining")}
              />
            </div>
            <div className={DATE_CELL}>
              <Input
                type="date"
                value={vacationDate}
                onChange={(e) => setVacationDate(e.target.value)}
                className={DATE_INPUT}
                aria-label={`${t("time.leaveVacationRemaining")} ${t("time.leaveOpeningBalanceEffectiveDate")}`}
              />
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-white/45">{t("time.leaveExtraRemaining")}</Label>
          <div className="flex items-center gap-2">
            <div className={VALUE_CELL}>
              <Input
                type="text"
                inputMode="decimal"
                value={extraVacationRemaining}
                onChange={(e) => setExtraVacationRemaining(e.target.value)}
                className={VALUE_INPUT}
                aria-label={t("time.leaveExtraRemaining")}
              />
            </div>
            <div className={DATE_CELL}>
              <Input
                type="date"
                value={extraVacationDate}
                onChange={(e) => setExtraVacationDate(e.target.value)}
                className={DATE_INPUT}
                aria-label={`${t("time.leaveExtraRemaining")} ${t("time.leaveOpeningBalanceEffectiveDate")}`}
              />
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-white/45">{t("time.leaveOpeningBalanceCompTime")}</Label>
          <div className="flex items-center gap-2">
            <div className={VALUE_CELL}>
              <CompTimeHhhMmField
                valueMinutes={compTimeMinutes}
                onChangeMinutes={setCompTimeMinutes}
                allowNegative
                showHint={false}
                className="w-full"
                inputClassName="w-full"
                aria-label={t("time.leaveOpeningBalanceCompTime")}
              />
            </div>
            <div className={DATE_CELL}>
              <Input
                type="date"
                value={compTimeDate}
                onChange={(e) => setCompTimeDate(e.target.value)}
                className={DATE_INPUT}
                aria-label={`${t("time.leaveOpeningBalanceCompTime")} ${t("time.leaveOpeningBalanceEffectiveDate")}`}
              />
            </div>
          </div>
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
