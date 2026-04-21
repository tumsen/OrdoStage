import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { api, isApiError } from "@/lib/api";
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
import { signOut } from "@/lib/auth-client";
import { usePreferences } from "@/hooks/usePreferences";
import type { DistanceUnit, Language, TimeFormat } from "@/lib/preferences";
import { useI18n } from "@/lib/i18n";

const CONFIRM_PHRASE = "DELETETHISACCOUNT";

export default function Account() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { effective, isLoading } = usePreferences();
  const { t } = useI18n();
  const [phrase, setPhrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [prefsError, setPrefsError] = useState("");

  const updatePrefsMutation = useMutation({
    mutationFn: (body: Partial<{ language: Language; timeFormat: TimeFormat; distanceUnit: DistanceUnit }>) =>
      api.patch<{ ok: boolean }>("/api/preferences", body),
    onSuccess: () => {
      setPrefsError("");
      queryClient.invalidateQueries({ queryKey: ["preferences"] });
    },
    onError: (e: unknown) => {
      if (isApiError(e)) setPrefsError(e.message);
      else setPrefsError(t("account.savePrefError"));
    },
  });

  async function onDeleteAccount() {
    setError("");
    if (phrase !== CONFIRM_PHRASE) {
      setError(t("account.phraseError", { phrase: CONFIRM_PHRASE }));
      return;
    }
    setLoading(true);
    try {
      await api.delete<undefined>("/api/me/account", {
        body: JSON.stringify({ phrase: CONFIRM_PHRASE }),
        headers: { "Content-Type": "application/json" },
      });
      await signOut();
      navigate("/login");
    } catch (e: unknown) {
      if (isApiError(e)) {
        setError(e.message);
      } else {
        setError(t("account.deleteError"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-8 max-w-2xl mx-auto">
      <div>
        <h2 className="text-xl font-semibold text-white">{t("account.title")}</h2>
        <p className="text-sm text-white/45 mt-1">{t("account.subtitle")}</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <div>
          <p className="text-sm font-medium text-white">{t("account.preferencesTitle")}</p>
          <p className="text-xs text-white/50 mt-1">
            {t("account.preferencesHint")}
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.language")}</Label>
            <Select
              value={effective?.language ?? "en"}
              disabled={isLoading || updatePrefsMutation.isPending}
              onValueChange={(value) => updatePrefsMutation.mutate({ language: value as Language })}
            >
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white">
                <SelectItem value="en">{t("common.english")}</SelectItem>
                <SelectItem value="da">{t("common.danish")}</SelectItem>
                <SelectItem value="de">{t("common.german")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.timeFormat")}</Label>
            <Select
              value={effective?.timeFormat ?? "24h"}
              disabled={isLoading || updatePrefsMutation.isPending}
              onValueChange={(value) => updatePrefsMutation.mutate({ timeFormat: value as TimeFormat })}
            >
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white">
                <SelectItem value="24h">{t("common.clock24")}</SelectItem>
                <SelectItem value="12h">{t("common.clock12")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-white/70 text-xs uppercase tracking-wide">{t("account.distance")}</Label>
            <Select
              value={effective?.distanceUnit ?? "km"}
              disabled={isLoading || updatePrefsMutation.isPending}
              onValueChange={(value) => updatePrefsMutation.mutate({ distanceUnit: value as DistanceUnit })}
            >
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white">
                <SelectItem value="km">{t("common.kilometers")}</SelectItem>
                <SelectItem value="mi">{t("common.miles")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {prefsError ? <p className="text-xs text-red-400">{prefsError}</p> : null}
      </div>

      <div className="rounded-xl border border-red-500/25 bg-red-950/20 p-5 space-y-4">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-white">{t("account.deleteTitle")}</p>
            <p className="text-xs text-white/50 leading-relaxed">
              {t("account.deleteHint")}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="delete-phrase" className="text-white/70 text-xs uppercase tracking-wide">
            {t("account.typeConfirm", { phrase: CONFIRM_PHRASE })}
          </Label>
          <Input
            id="delete-phrase"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            autoComplete="off"
            className="bg-white/5 border-white/10 text-white placeholder:text-white/25"
          />
        </div>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Button
          type="button"
          variant="destructive"
          className="w-full bg-red-900 hover:bg-red-800"
          disabled={loading || phrase !== CONFIRM_PHRASE}
          onClick={onDeleteAccount}
        >
          {loading ? t("account.deleting") : t("account.deleteCta")}
        </Button>
      </div>
    </div>
  );
}
