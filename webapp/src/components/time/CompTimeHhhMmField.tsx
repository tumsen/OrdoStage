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
  showHint?: boolean;
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
    showHint = true,
    "aria-label": ariaLabel,
    placeholder = allowNegative ? "+0:00" : "0:00",
  } = props;

  const { t } = useI18n();
  const id = useId();
  const lastEmitted = useRef(valueMinutes);
  const [text, setText] = useState(() =>
    formatCompTimeHhhMm(valueMinutes, allowNegative ? { showSign: true } : undefined)
  );

  useEffect(() => {
    if (valueMinutes === lastEmitted.current) return;
    setText(formatCompTimeHhhMm(valueMinutes, allowNegative ? { showSign: true } : undefined));
    lastEmitted.current = valueMinutes;
  }, [valueMinutes, allowNegative]);

  const formatOpts = allowNegative ? ({ showSign: true } as const) : undefined;

  const commit = (raw: string) => {
    const parsed = parseCompTimeHhhMm(raw);
    if (parsed === null) return false;
    if (!allowNegative && parsed < 0) return false;
    const normalized = formatCompTimeHhhMm(parsed, formatOpts);
    lastEmitted.current = parsed;
    setText(normalized);
    onChangeMinutes(parsed);
    return true;
  };

  const liveMinutes = (() => {
    const parsed = parseCompTimeHhhMm(text);
    return parsed === null ? valueMinutes : parsed;
  })();
  const toneClass = !allowNegative
    ? "text-white"
    : liveMinutes > 0
      ? "text-emerald-300"
      : liveMinutes < 0
        ? "text-red-300"
        : "text-white";

  return (
    <div className={cn("w-fit shrink-0", showHint && "space-y-1", className)}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        aria-label={ariaLabel ?? "Hours and minutes"}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (!text.trim()) {
            lastEmitted.current = 0;
            setText(formatCompTimeHhhMm(0, formatOpts));
            onChangeMinutes(0);
            return;
          }
          if (!commit(text)) {
            setText(formatCompTimeHhhMm(lastEmitted.current, formatOpts));
          } else {
            setText(normalizeCompTimeHhhMm(text, formatOpts));
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={cn(
          allowNegative ? "w-[calc(9ch+1rem)]" : "w-[calc(8ch+1rem)]",
          "h-8 min-w-0 max-w-none shrink-0 rounded-md border border-white/10 bg-white/5 px-2",
          "font-mono text-xs tabular-nums placeholder:text-white/25",
          "focus:outline-none focus:ring-1 focus:ring-emerald-500/40",
          toneClass,
          inputClassName
        )}
      />
      {showHint ? (
        <p className="text-[10px] text-white/30">{t("time.leaveHoursInputHint")}</p>
      ) : null}
    </div>
  );
}
