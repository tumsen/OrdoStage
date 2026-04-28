import { cn } from "@/lib/utils";
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";

import { durationHhMmToTotalMinutes, totalMinutesToDurationHhMm } from "@/lib/showTiming";

const WRAPPER = "inline-flex items-center gap-0.5 shrink-0 w-[5.75rem] justify-center rounded-md border border-white/10 bg-white/5 py-0.5 px-0.5 [color-scheme:dark]";

const SEG = cn(
  "h-9 w-7 text-center font-mono text-sm tabular-nums",
  "border-0 bg-transparent text-white",
  "rounded px-0.5 focus:outline-none focus:ring-1 focus:ring-red-500/50",
  "placeholder:text-white/20",
);

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

  const fromProp = (v: string) => {
    if (!v || !v.includes(":")) return { hh: "", mm: "" };
    const p = v.trim().split(":");
    if (p.length < 2) return { hh: "", mm: "" };
    const hhRaw = onlyDigits2(p[0] ?? "");
    const mmRaw = onlyDigits2(p[1] ?? "");
    const hh = hhRaw.length === 1 ? hhRaw.padStart(2, "0") : hhRaw;
    const mm = mmRaw.length === 1 ? mmRaw.padStart(2, "0") : mmRaw;
    return { hh, mm };
  };

  const [hh, setHh] = useState(() => fromProp(value).hh);
  const [mm, setMm] = useState(() => fromProp(value).mm);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    const s = fromProp(value);
    setHh(s.hh);
    setMm(s.mm);
    lastEmitted.current = value;
  }, [value]);

  const emit = (h: string, m: string, afterMinutesFilled?: boolean) => {
    const h2 = onlyDigits2(h);
    const m2 = onlyDigits2(m);
    if (h2.length === 2 && m2.length === 2) {
      if (mode === "clock") {
        const hhN = Math.min(23, Math.max(0, parseInt(h2, 10) || 0));
        const mmN = Math.min(59, Math.max(0, parseInt(m2, 10) || 0));
        const t = `${String(hhN).padStart(2, "0")}:${String(mmN).padStart(2, "0")}`;
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
        const hhN = Math.min(23, Math.max(0, parseInt(h2, 10) || 0));
        setHh(String(hhN).padStart(2, "0"));
        if (m2.length === 2) {
          const mmN = Math.min(59, Math.max(0, parseInt(m2, 10) || 0));
          const mmP = String(mmN).padStart(2, "0");
          setMm(mmP);
          emit(String(hhN).padStart(2, "0"), mmP, false);
        }
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
        const mmN = Math.min(59, Math.max(0, parseInt(m2, 10) || 0));
        const mmP = String(mmN).padStart(2, "0");
        setMm(mmP);
        const hhN = Math.min(23, Math.max(0, parseInt(h2, 10) || 0));
        emit(String(hhN).padStart(2, "0"), mmP, false);
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
