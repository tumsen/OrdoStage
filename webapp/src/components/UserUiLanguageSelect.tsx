import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { usePreferences } from "@/hooks/usePreferences";
import { useUserPreferencesMutation } from "@/hooks/useUserPreferencesMutation";
import { toast } from "@/hooks/use-toast";
import { isApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  languageNativeLabel,
  SUPPORTED_LANGUAGES,
  type Language,
} from "@/lib/preferences";
import { cn } from "@/lib/utils";

type Props = {
  /** Sidebar: compact label above control. Account: same. */
  showLabel?: boolean;
  className?: string;
  triggerClassName?: string;
};

export function UserUiLanguageSelect({
  showLabel = true,
  className,
  triggerClassName,
}: Props) {
  const { t } = useI18n();
  const { effective, isLoading } = usePreferences();
  const updatePrefs = useUserPreferencesMutation();

  const onLanguageChange = (value: string) => {
    updatePrefs.mutate(
      { language: value as Language },
      {
        onError: (e: unknown) => {
          const message = isApiError(e) ? e.message : t("account.savePrefError");
          toast({ title: message, variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className={cn("space-y-2", className)}>
      {showLabel ? (
        <Label className="text-white/70 text-xs uppercase tracking-wide">
          {t("account.language")}
        </Label>
      ) : null}
      <Select
        value={effective?.language ?? "en"}
        disabled={isLoading || updatePrefs.isPending}
        onValueChange={onLanguageChange}
      >
        <SelectTrigger
          className={cn(
            "bg-white/5 border-white/10 text-white",
            triggerClassName
          )}
          aria-label={t("account.language")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-[#16161f] border-white/10 text-white">
          {SUPPORTED_LANGUAGES.map((code) => (
            <SelectItem key={code} value={code}>
              {languageNativeLabel(code)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
