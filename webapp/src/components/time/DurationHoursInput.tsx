import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { commaDecimalForLanguage } from "@/lib/timeGrid";
import {
  DURATION_HOURS_INPUT_CLASS,
  DURATION_HOURS_INPUT_MAX_LENGTH,
  formatDurationHoursForInput,
  parseDurationHours,
} from "@/lib/durationHours";

/**
 * Single-line hours quantity field: accepts HHHHH:MM or HHHHH,DD / HHHHH.DD.
 * Emits decimal hours (or null when cleared if `allowEmpty`).
 */
export function DurationHoursInput(props: {
  valueHours: number | null;
  onChangeHours: (hours: number | null) => void;
  allowEmpty?: boolean;
  allowNegative?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  "aria-label"?: string;
  hint?: string;
  onBlur?: () => void;
}) {
  const {
    valueHours,
    onChangeHours,
    allowEmpty = true,
    allowNegative = false,
    disabled,
    className,
    inputClassName,
    placeholder = "37:00",
    "aria-label": ariaLabel,
    hint,
    onBlur,
  } = props;

  const { t, language } = useI18n();
  const commaDecimal = commaDecimalForLanguage(language);
  const id = useId();
  const lastEmitted = useRef(valueHours);
  const [text, setText] = useState(() =>
    valueHours == null ? "" : formatDurationHoursForInput(valueHours, commaDecimal)
  );

  useEffect(() => {
    if (valueHours === lastEmitted.current) return;
    setText(valueHours == null ? "" : formatDurationHoursForInput(valueHours, commaDecimal));
    lastEmitted.current = valueHours;
  }, [valueHours, commaDecimal]);

  const commit = (raw: string) => {
    if (!raw.trim()) {
      if (!allowEmpty) return false;
      lastEmitted.current = null;
      setText("");
      onChangeHours(null);
      return true;
    }
    const parsed = parseDurationHours(raw, { allowNegative });
    if (parsed === null || Number.isNaN(parsed)) return false;
    if (!allowNegative && parsed < 0) return false;
    lastEmitted.current = parsed;
    setText(formatDurationHoursForInput(parsed, commaDecimal));
    onChangeHours(parsed);
    return true;
  };

  return (
    <div className={cn("space-y-1", className)}>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        aria-label={ariaLabel ?? t("time.leaveHoursInputLabel")}
        placeholder={placeholder}
        maxLength={DURATION_HOURS_INPUT_MAX_LENGTH + (allowNegative ? 1 : 0)}
        size={DURATION_HOURS_INPUT_MAX_LENGTH}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (!commit(text)) {
            setText(
              lastEmitted.current == null
                ? ""
                : formatDurationHoursForInput(lastEmitted.current, commaDecimal)
            );
          }
          onBlur?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={cn(DURATION_HOURS_INPUT_CLASS, inputClassName)}
      />
      {hint ? <p className="text-[10px] text-white/30">{hint}</p> : null}
    </div>
  );
}
