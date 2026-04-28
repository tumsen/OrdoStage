import { cn } from "@/lib/utils";
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from "react";

import { usePreferences } from "@/hooks/usePreferences";
import { durationHhMmToTotalMinutes, totalMinutesToDurationHhMm } from "@/lib/showTiming";

const WRAPPER =
  "inline-flex items-center gap-0.5 shrink-0 w-[5.75rem] justify-center rounded-md border border-white/10 bg-white/5 py-0.5 px-0.5";

const SEG = cn(
  "h-9 w-7 text-center font-mono text-sm tabular-nums",
  "border-0 bg-transparent text-white",
  "rounded px-0.5 focus:outline-none focus:ring-1 focus:ring-red-500/50",
  "placeholder:text-white/20",
);

const AMPM_BTN = "h-9 px-1.5 text-[10px] font-medium";

export type SplitTimeFieldHandle = { focusHours: () => void; focusMinutes: () => void };

type Mode = "clock" | "duration";

function digitsOnly(s: string) {
  return s.replace(/\D/g, "").slice(0, 2);
}

function focusAndSelect(input: HTMLInputElement | null) {
  if (!input) return;
  input.focus();
  requestAnimationFrame(() => {
    try { input.setSelectionRange(0, input.value.length); } catch { /* noop */ }
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

const SplitHhMmInner = forwardRef<SplitTimeFieldHandle, SplitHhMmProps>(
  function SplitHhMmInner({ value, onChange, mode, "aria-label": ariaLabel, nextFieldRef, className }, ref) {
    const uid = useId();
    const hRef = useRef<HTMLInputElement>(null);
    const mRef = useRef<HTMLInputElement>(null);
    const lastEmitted = useRef(value);
    const justFocusedH = useRef(false);
    const justFocusedM = useRef(false);

    const { effective } = usePreferences();
    const is12h = mode === "clock" && effective?.timeFormat === "12h";

    /* ── 12-hour conversions ── */
    const to12 = (hh24: string) => {
      const h = parseInt(hh24, 10);
      if (!Number.isFinite(h)) return { hh12: "", am: true };
      const am = h < 12;
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return { hh12: String(h12).padStart(2, "0"), am };
    };
    const to24 = (hh12: string, am: boolean) => {
      const h = parseInt(hh12, 10);
      if (!Number.isFinite(h) || h < 1 || h > 12) return "";
      const h24 = am ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12);
      return String(h24).padStart(2, "0");
    };

    /* ── Parse incoming "HH:MM" value to display strings ── */
    const parseProp = (v: string) => {
      if (!v?.includes(":")) return { hh: "", mm: "", am: true };
      const [rawH = "", rawM = ""] = v.trim().split(":");
      const h24 = digitsOnly(rawH).padStart(2, "0").slice(0, 2);
      const mm = digitsOnly(rawM).padStart(2, "0").slice(0, 2);
      if (is12h) {
        const { hh12, am } = to12(h24);
        return { hh: hh12, mm, am };
      }
      return { hh: h24, mm, am: parseInt(h24, 10) < 12 };
    };

    const init = parseProp(value);
    const [hh, setHh] = useState(init.hh);
    const [mm, setMm] = useState(init.mm);
    const [isAM, setIsAM] = useState(init.am);

    /* Sync from parent when value changes externally */
    useEffect(() => {
      if (value === lastEmitted.current) return;
      const p = parseProp(value);
      setHh(p.hh);
      setMm(p.mm);
      setIsAM(p.am);
      lastEmitted.current = value;
    }, [value, is12h]);

    /* ── Emit committed HH:MM string ── */
    const commit = (h: string, m: string, jumpAfter = false) => {
      const h2 = digitsOnly(h);
      const m2 = digitsOnly(m);
      if (h2.length !== 2 || m2.length !== 2) return;

      const mmN = parseInt(m2, 10);
      if (mmN < 0 || mmN > 59) return;

      let out = "";
      if (mode === "clock") {
        if (is12h) {
          const hh24 = to24(h2, isAM);
          if (!hh24) return;
          out = `${hh24}:${m2}`;
        } else {
          const hhN = parseInt(h2, 10);
          if (hhN < 0 || hhN > 23) return;
          out = `${h2}:${m2}`;
        }
      } else {
        const total = durationHhMmToTotalMinutes(h2, m2);
        out = totalMinutesToDurationHhMm(total);
      }

      lastEmitted.current = out;
      onChange(out);
      if (jumpAfter) requestAnimationFrame(() => nextFieldRef?.current?.focusHours());
    };

    useImperativeHandle(ref, () => ({
      focusHours: () => focusAndSelect(hRef.current),
      focusMinutes: () => focusAndSelect(mRef.current),
    }), []);

    /* ── HH handlers ── */
    const onHChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputDigits = e.target.value.replace(/\D/g, "");
      let next: string;

      if (justFocusedH.current) {
        // First keystroke after focus: take only the single newly typed digit
        next = inputDigits.slice(-1);
        justFocusedH.current = false;
      } else {
        next = inputDigits.slice(0, 2);
      }

      setHh(next);

      if (next.length === 2) {
        // Validate range before jumping
        const n = parseInt(next, 10);
        const valid = is12h ? (n >= 1 && n <= 12) : (n >= 0 && n <= 23);
        if (!valid) { setHh(""); return; }
        focusAndSelect(mRef.current);
        if (mm.length === 2) commit(next, mm, false);
      }
    };

    const onHFocus = () => {
      justFocusedH.current = true;
    };

    const onHBlur = () => {
      justFocusedH.current = false;
      if (hh.length === 1) { setHh(""); return; }
      if (hh.length === 2 && mm.length === 2) commit(hh, mm, false);
    };

    const onHKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowRight") { e.preventDefault(); focusAndSelect(mRef.current); }
      if (e.key === "Backspace" && !hh) { /* stay in HH */ }
    };

    /* ── MM handlers ── */
    const onMChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputDigits = e.target.value.replace(/\D/g, "");
      let next: string;

      if (justFocusedM.current) {
        next = inputDigits.slice(-1);
        justFocusedM.current = false;
      } else {
        next = inputDigits.slice(0, 2);
      }

      setMm(next);

      if (next.length === 2) {
        const n = parseInt(next, 10);
        if (n < 0 || n > 59) { setMm(""); return; }
        commit(hh, next, true);
      }
    };

    const onMFocus = () => {
      justFocusedM.current = true;
    };

    const onMBlur = () => {
      justFocusedM.current = false;
      if (mm.length === 1) { setMm(""); return; }
      if (hh.length === 2 && mm.length === 2) commit(hh, mm, false);
    };

    const onMKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); focusAndSelect(hRef.current); }
      if (e.key === "Backspace" && !mm) { e.preventDefault(); focusAndSelect(hRef.current); }
    };

    /* ── Paste ── */
    const onPasteH = (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const m = (e.clipboardData.getData("text") || "").match(/(\d{1,2})[:\s]?(\d{2})/);
      if (!m) return;
      const ph = digitsOnly(m[1] ?? "");
      const pm = digitsOnly(m[2] ?? "");
      setHh(ph); setMm(pm);
      if (ph.length === 2 && pm.length === 2) commit(ph, pm, false);
      else focusAndSelect(mRef.current);
    };

    const onPasteM = (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const m = (e.clipboardData.getData("text") || "").match(/(\d{1,2})[:\s]?(\d{2})/);
      if (!m) return;
      const ph = digitsOnly(m[1] ?? "");
      const pm = digitsOnly(m[2] ?? "");
      setHh(ph); setMm(pm);
      if (ph.length === 2 && pm.length === 2) commit(ph, pm, true);
    };

    return (
      <div className={cn(WRAPPER, className)} role="group" aria-label={ariaLabel ?? "Time"}>
        <input
          id={`${uid}-h`}
          ref={hRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={2}
          placeholder="00"
          className={SEG}
          value={hh}
          onFocus={onHFocus}
          onChange={onHChange}
          onBlur={onHBlur}
          onKeyDown={onHKeyDown}
          onPaste={onPasteH}
          aria-label={ariaLabel ? `${ariaLabel} hours` : "Hours"}
        />
        <span className="text-white/45 text-sm select-none" aria-hidden>:</span>
        <input
          id={`${uid}-m`}
          ref={mRef}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={2}
          placeholder="00"
          className={SEG}
          value={mm}
          onFocus={onMFocus}
          onChange={onMChange}
          onBlur={onMBlur}
          onKeyDown={onMKeyDown}
          onPaste={onPasteM}
          aria-label={ariaLabel ? `${ariaLabel} minutes` : "Minutes"}
        />
        {is12h ? (
          <div className="ml-0.5 inline-flex h-9 items-center rounded border border-white/10 bg-white/5 overflow-hidden">
            {(["AM", "PM"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={cn(
                  AMPM_BTN,
                  isAM === (m === "AM")
                    ? "bg-white/15 text-white"
                    : "text-white/55 hover:text-white/80",
                )}
                onClick={() => {
                  setIsAM(m === "AM");
                  if (hh.length === 2 && mm.length === 2) {
                    const hh24 = to24(hh, m === "AM");
                    if (hh24) {
                      const out = `${hh24}:${mm}`;
                      lastEmitted.current = out;
                      onChange(out);
                    }
                  }
                }}
              >
                {m}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  },
);

export const SplitTimeInput = forwardRef<
  SplitTimeFieldHandle,
  Omit<SplitHhMmProps, "mode"> & { "aria-label"?: string; nextFieldRef?: React.RefObject<SplitTimeFieldHandle | null> }
>(function SplitTimeInput(props, ref) {
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
  const safe = Number.isFinite(valueMinutes) && !Number.isNaN(valueMinutes) ? valueMinutes : 0;
  return (
    <SplitHhMmInner
      ref={ref}
      className={className}
      mode="duration"
      value={totalMinutesToDurationHhMm(safe)}
      aria-label={a ?? "Duration"}
      nextFieldRef={nextFieldRef}
      onChange={(s) => {
        if (!s) { onChangeMinutes(0); return; }
        const [h = "", m = ""] = s.split(":");
        onChangeMinutes(durationHhMmToTotalMinutes(h.replace(/\D/g, "").slice(0, 2), m.replace(/\D/g, "").slice(0, 2)));
      }}
    />
  );
});
