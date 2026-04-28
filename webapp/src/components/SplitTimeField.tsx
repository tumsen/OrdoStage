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

function dig2(s: string) {
  return s.replace(/\D/g, "").slice(0, 2);
}

function focusAndSelect(el: HTMLInputElement | null) {
  if (!el) return;
  el.focus();
  requestAnimationFrame(() => { try { el.setSelectionRange(0, el.value.length); } catch { /* noop */ } });
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
    // saved values so blur can restore if user typed nothing new
    const savedHh = useRef("");
    const savedMm = useRef("");

    const { effective } = usePreferences();
    const is12h = mode === "clock" && effective?.timeFormat === "12h";

    /* ── 12-hour helpers ── */
    const to12 = (hh24: string) => {
      const h = parseInt(hh24, 10);
      if (!Number.isFinite(h)) return { hh12: "", am: true };
      return { hh12: String(h % 12 === 0 ? 12 : h % 12).padStart(2, "0"), am: h < 12 };
    };
    const to24 = (hh12: string, am: boolean) => {
      const h = parseInt(hh12, 10);
      if (!Number.isFinite(h) || h < 1 || h > 12) return "";
      const h24 = am ? (h === 12 ? 0 : h) : (h === 12 ? 12 : h + 12);
      return String(h24).padStart(2, "0");
    };

    /* ── Parse "HH:MM" prop → display strings ── */
    const parseProp = (v: string) => {
      if (!v?.includes(":")) return { hh: "", mm: "", am: true };
      const [rawH = "", rawM = ""] = v.trim().split(":");
      const h24 = dig2(rawH).padStart(2, "0");
      const mm  = dig2(rawM).padStart(2, "0");
      if (is12h) { const { hh12, am } = to12(h24); return { hh: hh12, mm, am }; }
      return { hh: h24, mm, am: parseInt(h24, 10) < 12 };
    };

    const init = parseProp(value);
    const [hh, setHh] = useState(init.hh);
    const [mm, setMm] = useState(init.mm);
    const [isAM, setIsAM] = useState(init.am);

    /* sync when parent changes value externally */
    useEffect(() => {
      if (value === lastEmitted.current) return;
      const p = parseProp(value);
      setHh(p.hh); setMm(p.mm); setIsAM(p.am);
      lastEmitted.current = value;
    }, [value, is12h]);

    /* ── Emit ── */
    const commit = (h: string, m: string, jumpAfter = false) => {
      const h2 = dig2(h); const m2 = dig2(m);
      if (h2.length !== 2 || m2.length !== 2) return;
      if (parseInt(m2, 10) > 59) return;
      let out = "";
      if (mode === "clock") {
        if (is12h) {
          const h24 = to24(h2, isAM); if (!h24) return;
          out = `${h24}:${m2}`;
        } else {
          const n = parseInt(h2, 10); if (n < 0 || n > 23) return;
          out = `${h2}:${m2}`;
        }
      } else {
        out = totalMinutesToDurationHhMm(durationHhMmToTotalMinutes(h2, m2));
      }
      lastEmitted.current = out;
      onChange(out);
      if (jumpAfter) requestAnimationFrame(() => nextFieldRef?.current?.focusHours());
    };

    useImperativeHandle(ref, () => ({
      focusHours:   () => focusAndSelect(hRef.current),
      focusMinutes: () => focusAndSelect(mRef.current),
    }), []);

    /* ── HH ── */
    const onHFocus = () => {
      savedHh.current = hh;   // remember so we can restore on blur if nothing typed
      setHh("");               // clear so maxLength doesn't block new input
    };

    const onHChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = dig2(e.target.value);
      setHh(next);
      if (next.length === 2) {
        const n = parseInt(next, 10);
        const valid = is12h ? n >= 1 && n <= 12 : n >= 0 && n <= 23;
        if (!valid) { setHh(""); return; }
        focusAndSelect(mRef.current);
        if (mm.length === 2) commit(next, mm, false);
      }
    };

    const onHBlur = () => {
      if (hh === "") {
        // user focused but typed nothing — restore previous value
        setHh(savedHh.current);
        return;
      }
      if (hh.length === 1) { setHh(""); return; }      // single digit → invalid, clear
      if (hh.length === 2 && mm.length === 2) commit(hh, mm, false);
    };

    const onHKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowRight") { e.preventDefault(); focusAndSelect(mRef.current); }
    };

    /* ── MM ── */
    const onMFocus = () => {
      savedMm.current = mm;
      setMm("");
    };

    const onMChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = dig2(e.target.value);
      setMm(next);
      if (next.length === 2) {
        if (parseInt(next, 10) > 59) { setMm(""); return; }
        commit(hh, next, true);
      }
    };

    const onMBlur = () => {
      if (mm === "") { setMm(savedMm.current); return; }
      if (mm.length === 1) { setMm(""); return; }
      if (hh.length === 2 && mm.length === 2) commit(hh, mm, false);
    };

    const onMKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowLeft")  { e.preventDefault(); focusAndSelect(hRef.current); }
      if (e.key === "Backspace" && !mm) { e.preventDefault(); focusAndSelect(hRef.current); }
    };

    /* ── Paste ── */
    const onPasteH = (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const m = (e.clipboardData.getData("text") || "").match(/(\d{1,2})[:\s]?(\d{2})/);
      if (!m) return;
      const ph = dig2(m[1] ?? ""); const pm = dig2(m[2] ?? "");
      setHh(ph); setMm(pm);
      if (ph.length === 2 && pm.length === 2) commit(ph, pm, false);
      else focusAndSelect(mRef.current);
    };

    const onPasteM = (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const m = (e.clipboardData.getData("text") || "").match(/(\d{1,2})[:\s]?(\d{2})/);
      if (!m) return;
      const ph = dig2(m[1] ?? ""); const pm = dig2(m[2] ?? "");
      setHh(ph); setMm(pm);
      if (ph.length === 2 && pm.length === 2) commit(ph, pm, true);
    };

    return (
      <div className={cn(WRAPPER, className)} role="group" aria-label={ariaLabel ?? "Time"}>
        <input
          id={`${uid}-h`} ref={hRef}
          type="text" inputMode="numeric" autoComplete="off"
          maxLength={2} placeholder="00" className={SEG}
          value={hh}
          onFocus={onHFocus} onChange={onHChange} onBlur={onHBlur}
          onKeyDown={onHKeyDown} onPaste={onPasteH}
          aria-label={ariaLabel ? `${ariaLabel} hours` : "Hours"}
        />
        <span className="text-white/45 text-sm select-none" aria-hidden>:</span>
        <input
          id={`${uid}-m`} ref={mRef}
          type="text" inputMode="numeric" autoComplete="off"
          maxLength={2} placeholder="00" className={SEG}
          value={mm}
          onFocus={onMFocus} onChange={onMChange} onBlur={onMBlur}
          onKeyDown={onMKeyDown} onPaste={onPasteM}
          aria-label={ariaLabel ? `${ariaLabel} minutes` : "Minutes"}
        />
        {is12h && (
          <div className="ml-0.5 inline-flex h-9 items-center rounded border border-white/10 bg-white/5 overflow-hidden">
            {(["AM", "PM"] as const).map((m) => (
              <button key={m} type="button"
                className={cn(AMPM_BTN, isAM === (m === "AM") ? "bg-white/15 text-white" : "text-white/55 hover:text-white/80")}
                onClick={() => {
                  const newAM = m === "AM";
                  setIsAM(newAM);
                  if (hh.length === 2 && mm.length === 2) {
                    const h24 = to24(hh, newAM);
                    if (h24) { const out = `${h24}:${mm}`; lastEmitted.current = out; onChange(out); }
                  }
                }}
              >{m}</button>
            ))}
          </div>
        )}
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
    <SplitHhMmInner ref={ref} className={className} mode="duration"
      value={totalMinutesToDurationHhMm(safe)}
      aria-label={a ?? "Duration"} nextFieldRef={nextFieldRef}
      onChange={(s) => {
        if (!s) { onChangeMinutes(0); return; }
        const [h = "", m = ""] = s.split(":");
        onChangeMinutes(durationHhMmToTotalMinutes(dig2(h), dig2(m)));
      }}
    />
  );
});

