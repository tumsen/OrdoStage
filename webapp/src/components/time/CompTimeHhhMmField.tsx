import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  formatCompTimeHhhMm,
  normalizeCompTimeHhhMm,
  parseCompTimeHhhMm,
} from "@/lib/compTimeInput";

export function CompTimeHhhMmField(props: {
  valueMinutes: number;
  onChangeMinutes: (minutes: number) => void;
  allowNegative?: boolean;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  "aria-label"?: string;
  placeholder?: string;
}) {
  const {
    valueMinutes,
    onChangeMinutes,
    allowNegative = false,
    className,
    inputClassName,
    disabled,
    "aria-label": ariaLabel,
    placeholder = "0:00",
  } = props;

  const { t } = useI18n();
  const id = useId();
  const lastEmitted = useRef(valueMinutes);
  const [text, setText] = useState(() => formatCompTimeHhhMm(valueMinutes));

  useEffect(() => {
    if (valueMinutes === lastEmitted.current) return;
    setText(formatCompTimeHhhMm(valueMinutes));
    lastEmitted.current = valueMinutes;
  }, [valueMinutes]);

  const commit = (raw: string) => {
    const parsed = parseCompTimeHhhMm(raw);
    if (parsed === null) return false;
    if (!allowNegative && parsed < 0) return false;
    const normalized = formatCompTimeHhhMm(parsed);
    lastEmitted.current = parsed;
    setText(normalized);
    onChangeMinutes(parsed);
    return true;
  };

  return (
    <div className={cn("space-y-1", className)}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        aria-label={ariaLabel ?? "Hours and minutes"}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (!text.trim()) {
            lastEmitted.current = 0;
            setText("0:00");
            onChangeMinutes(0);
            return;
          }
          if (!commit(text)) {
            setText(formatCompTimeHhhMm(lastEmitted.current));
          } else {
            setText(normalizeCompTimeHhhMm(text));
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={cn(
          "h-8 w-full min-w-[5.5rem] max-w-[7rem] rounded-md border border-white/10 bg-white/5 px-2",
          "font-mono text-xs tabular-nums text-white placeholder:text-white/25",
          "focus:outline-none focus:ring-1 focus:ring-emerald-500/40",
          inputClassName
        )}
      />
      <p className="text-[10px] text-white/30">{t("time.leaveOpeningBalanceCompTimeHint")}</p>
    </div>
  );
}
