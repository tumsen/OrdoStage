import { cn } from "@/lib/utils";
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";

import { usePreferences } from "@/hooks/usePreferences";
import { durationHhMmToTotalMinutes, totalMinutesToDurationHhMm } from "@/lib/showTiming";

const WRAPPER = "inline-flex items-center gap-0.5 shrink-0 w-[5.75rem] justify-center rounded-md border border-white/10 bg-white/5 py-0.5 px-0.5 [color-scheme:dark]";

const SEG = cn(
  "h-9 w-7 text-center font-mono text-sm tabular-nums",
  "border-0 bg-transparent text-white",
  "rounded px-0.5 focus:outline-none focus:ring-1 focus:ring-red-500/50",
  "placeholder:text-white/20",
);
const AMPM_BTN = "h-9 rounded px-1.5 text-[10px] font-medium border border-white/10";

export type SplitTimeFieldHandle = { focusHours: () => void; focusMinutes: () => void };

type Mode = "clock" | "duration";

function onlyDigits2(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 2);
}

function focusSegment(input: HTMLInputElement | null) {
  if (!input) return;
  input.focus();
  // Always start at first digit so two fresh digits can be entered.
  requestAnimationFrame(() => {
    try {
      input.setSelectionRange(0, input.value.length);
    } catch {
      // noop
    }
  });
}

type SplitHhMmProps = {
  value: string;
  onChange: (next: string) => void;
  mode: Mode;
  "aria-label"?: string;
  nextFieldRef?: React.RefObject<SplitTimeFieldHandle | null>;
  className?: string;
};

const SplitHhMmInner = forwardRef<SplitTimeFieldHandle, SplitHhMmProps>(function SplitHhMmInner(
  { value, onChange, mode, "aria-label": ariaLabel, nextFieldRef, className },
  ref
) {
  const uid = useId();
  const hId = `${uid}-h`;
  const mId = `${uid}-m`;
  const hRef = useRef<HTMLInputElement>(null);
  const mRef = useRef<HTMLInputElement>(null);
  const lastEmitted = useRef(value);
  const { effective } = usePreferences();
  const is12h = mode === "clock" && effective?.timeFormat === "12h";

  const to12h = (hh24: string) => {
    const h = parseInt(hh24, 10);
    if (!Number.isFinite(h)) return { hh12: "", meridiem: "AM" as const };
    const meridiem = h >= 12 ? "PM" as const : "AM" as const;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return { hh12: String(h12).padStart(2, "0"), meridiem };
  };
  const to24h = (hh12: string, meridiem: "AM" | "PM") => {
    const h = parseInt(hh12, 10);
    if (!Number.isFinite(h) || h < 1 || h > 12) return "";
    let h24 = h % 12;
    if (meridiem === "PM") h24 += 12;
    return String(h24).padStart(2, "0");
  };

  const fromProp = (v: string) => {
    if (!v || !v.includes(":")) return { hh: "", mm: "" };
    const p = v.trim().split(":");
    if (p.length < 2) return { hh: "", mm: "" };
    const hhRaw = onlyDigits2(p[0] ?? "");
    const mmRaw = onlyDigits2(p[1] ?? "");
    const hh = hhRaw.length === 1 ? hhRaw.padStart(2, "0") : hhRaw;
    const mm = mmRaw.length === 1 ? mmRaw.padStart(2, "0") : mmRaw;
    if (is12h && hh.length === 2) {
      const conv = to12h(hh);
      return { hh: conv.hh12, mm };
    }
    return { hh, mm };
  };

  const [hh, setHh] = useState(() => fromProp(value).hh);
  const [mm, setMm] = useState(() => fromProp(value).mm);
  const [meridiem, setMeridiem] = useState<"AM" | "PM">(() => {
    const parts = value?.split(":");
    if (is12h && parts?.[0]) return to12h(parts[0]).meridiem;
    return "AM";
  });

  useEffect(() => {
    if (value === lastEmitted.current) return;
    const s = fromProp(value);
    setHh(s.hh);
    setMm(s.mm);
    if (is12h && value?.includes(":")) {
      const p = value.split(":");
      if (p[0]) setMeridiem(to12h(p[0]).meridiem);
    }
    lastEmitted.current = value;
  }, [value, is12h]);

  const emit = (h: string, m: string, afterMinutesFilled?: boolean) => {
    const h2 = onlyDigits2(h);
    const m2 = onlyDigits2(m);
    if (h2.length === 2 && m2.length === 2) {
      if (mode === "clock") {
        const mmN = parseInt(m2, 10);
        if (!Number.isFinite(mmN) || mmN < 0 || mmN > 59) return;
        let t = "";
        if (is12h) {
          const hh24 = to24h(h2, meridiem);
          if (!hh24) return;
          t = `${hh24}:${m2}`;
        } else {
          const hhN = parseInt(h2, 10);
          if (!Number.isFinite(hhN) || hhN < 0 || hhN > 23) return;
          t = `${h2}:${m2}`;
        }
        lastEmitted.current = t;
        onChange(t);
        if (afterMinutesFilled) {
          requestAnimationFrame(() => nextFieldRef?.current?.focusHours());
        }
        return;
      }
      const total = durationHhMmToTotalMinutes(h2, m2);
      const t = totalMinutesToDurationHhMm(total);
      lastEmitted.current = t;
      onChange(t);
      if (afterMinutesFilled) {
        requestAnimationFrame(() => nextFieldRef?.current?.focusHours());
      }
      return;
    }
    if (h2.length === 0 && m2.length === 0) {
      lastEmitted.current = "";
      onChange("");
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      focusHours: () => focusSegment(hRef.current),
      focusMinutes: () => focusSegment(mRef.current),
    }),
    []
  );

  const onHInput = (e: React.FormEvent<HTMLInputElement>) => {
    const raw = onlyDigits2((e.target as HTMLInputElement).value);
    setHh(raw);
    if (raw.length === 2) {
      const mmNum = onlyDigits2(mm);
      focusSegment(mRef.current);
      if (mmNum.length === 2) emit(raw, mmNum, false);
    } else {
      if (!raw && !mm) {
        lastEmitted.current = "";
        onChange("");
      }
    }
  };

  const onMInput = (e: React.FormEvent<HTMLInputElement>) => {
    const raw = onlyDigits2((e.target as HTMLInputElement).value);
    setMm(raw);
    const h2 = onlyDigits2(hh);
    if (raw.length === 2) {
      emit(h2, raw, true);
    } else {
      if (!raw && !h2) {
        lastEmitted.current = "";
        onChange("");
      }
    }
  };

  const onHBlur = () => {
    const h2 = onlyDigits2(hh);
    const m2 = onlyDigits2(mm);
    if (h2.length === 1) {
      setHh("");
      return;
    }
    if (h2.length === 2) {
      if (mode === "clock") {
        if (is12h) {
          const hN = parseInt(h2, 10);
          if (!Number.isFinite(hN) || hN < 1 || hN > 12) {
            setHh("");
            return;
          }
          setHh(String(hN).padStart(2, "0"));
        } else {
          const hN = parseInt(h2, 10);
          if (!Number.isFinite(hN) || hN < 0 || hN > 23) {
            setHh("");
            return;
          }
          setHh(String(hN).padStart(2, "0"));
        }
        if (m2.length === 2) emit(h2, m2, false);
      } else if (m2.length === 2) {
        emit(h2, m2, false);
      }
    }
  };

  const onMBlur = () => {
    const h2 = onlyDigits2(hh);
    const m2 = onlyDigits2(mm);
    if (m2.length === 1) {
      setMm("");
      return;
    }
    if (h2.length === 2 && m2.length === 2) {
      if (mode === "clock") {
        const mmN = parseInt(m2, 10);
        if (!Number.isFinite(mmN) || mmN < 0 || mmN > 59) {
          setMm("");
          return;
        }
        setMm(String(mmN).padStart(2, "0"));
        emit(h2, m2, false);
      } else {
        emit(h2, m2, false);
      }
    }
  };

  const onHKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowRight" && (e.target as HTMLInputElement).selectionStart === 2) {
      e.preventDefault();
      focusSegment(mRef.current);
    }
  };

  const onMKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && (e.target as HTMLInputElement).value.length === 0) {
      e.preventDefault();
      focusSegment(hRef.current);
    }
    if (e.key === "ArrowLeft" && (e.target as HTMLInputElement).selectionStart === 0) {
      e.preventDefault();
      focusSegment(hRef.current);
    }
  };

  const onPasteH = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const t = (e.clipboardData.getData("text") || "").match(/(\d{1,2})[:\s]?(\d{2})/);
    if (t) {
      setHh(onlyDigits2(t[1] ?? ""));
      setMm(onlyDigits2(t[2] ?? ""));
      emit(onlyDigits2(t[1] ?? ""), onlyDigits2(t[2] ?? ""), true);
      if (onlyDigits2(t[2] ?? "").length < 2) focusSegment(mRef.current);
    }
  };

  const onPasteM = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const t = (e.clipboardData.getData("text") || "").match(/(\d{1,2})[:\s]?(\d{2})/);
    if (t) {
      setHh(onlyDigits2(t[1] ?? ""));
      setMm(onlyDigits2(t[2] ?? ""));
      emit(onlyDigits2(t[1] ?? ""), onlyDigits2(t[2] ?? ""), true);
    }
  };

  return (
    <div className={cn(WRAPPER, className)} role="group" aria-label={ariaLabel ?? "Time"}>
      <input
        id={hId}
        ref={hRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={2}
        placeholder="00"
        className={SEG}
        value={hh}
        onFocus={(e) => e.currentTarget.select()}
        onInput={onHInput}
        onKeyDown={onHKeyDown}
        onBlur={onHBlur}
        onPaste={onPasteH}
        aria-label={ariaLabel ? `${ariaLabel} hours` : "Hours"}
      />
      <span className="text-white/45 text-sm select-none" aria-hidden>
        :
      </span>
      <input
        id={mId}
        ref={mRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={2}
        placeholder="00"
        className={SEG}
        value={mm}
        onFocus={(e) => e.currentTarget.select()}
        onInput={onMInput}
        onKeyDown={onMKeyDown}
        onBlur={onMBlur}
        onPaste={onPasteM}
        aria-label={ariaLabel ? `${ariaLabel} minutes` : "Minutes"}
      />
      {is12h ? (
        <div className="ml-1 inline-flex h-9 items-center rounded border border-white/10 bg-white/5 overflow-hidden">
          <button
            type="button"
            className={cn(AMPM_BTN, meridiem === "AM" ? "bg-white/15 text-white" : "text-white/60")}
            onClick={() => {
              setMeridiem("AM");
              emit(hh, mm, false);
            }}
            aria-label={ariaLabel ? `${ariaLabel} AM` : "AM"}
          >
            AM
          </button>
          <button
            type="button"
            className={cn(AMPM_BTN, meridiem === "PM" ? "bg-white/15 text-white" : "text-white/60")}
            onClick={() => {
              setMeridiem("PM");
              emit(hh, mm, false);
            }}
            aria-label={ariaLabel ? `${ariaLabel} PM` : "PM"}
          >
            PM
          </button>
        </div>
      ) : null}
    </div>
  );
});

export const SplitTimeInput = forwardRef<
  SplitTimeFieldHandle,
  Omit<SplitHhMmProps, "mode"> & { "aria-label"?: string; nextFieldRef?: React.RefObject<SplitTimeFieldHandle | null> }
>(function SplitTimeInput({ ...props }, ref) {
  return <SplitHhMmInner ref={ref} mode="clock" {...props} />;
});

export const SplitDurationHhMmInput = forwardRef<
  SplitTimeFieldHandle,
  Omit<SplitHhMmProps, "value" | "onChange" | "mode"> & {
    valueMinutes: number;
    onChangeMinutes: (totalMinutes: number) => void;
    "aria-label"?: string;
    nextFieldRef?: React.RefObject<SplitTimeFieldHandle | null>;
  }
>(function SplitDurationHhMmInput({ valueMinutes, onChangeMinutes, "aria-label": a, nextFieldRef, className }, ref) {
  const t = totalMinutesToDurationHhMm(Number.isFinite(valueMinutes) && !Number.isNaN(valueMinutes) ? valueMinutes : 0);
  return (
    <SplitHhMmInner
      ref={ref}
      className={className}
      mode="duration"
      value={t}
      aria-label={a ?? "Duration"}
      nextFieldRef={nextFieldRef}
      onChange={(s) => {
        if (!s) {
          onChangeMinutes(0);
          return;
        }
        const p = s.split(":");
        if (p.length < 2) return;
        onChangeMinutes(durationHhMmToTotalMinutes(onlyDigits2(p[0] ?? ""), onlyDigits2(p[1] ?? "")));
      }}
    />
  );
});
