import { useCallback, useEffect, useRef, useState } from "react";
import { snapshotsEqual } from "@/lib/stableJson";

export type AutoSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export interface UseAutoSaveOptions {
  enabled?: boolean;
  debounceMs?: number;
  /** Return current draft state to compare against last saved snapshot. */
  getSnapshot: () => unknown;
  /** Persist draft; throw on failure. */
  save: () => void | Promise<void>;
  isEqual?: (a: unknown, b: unknown) => boolean;
  /** Flush pending changes when the component unmounts (e.g. route change). */
  saveOnUnmount?: boolean;
  /** Reset saved baseline when this key changes (e.g. entity id). */
  resetKey?: string | number | null;
}

export function useAutoSave({
  enabled = true,
  debounceMs = 600,
  getSnapshot,
  save,
  isEqual = snapshotsEqual,
  saveOnUnmount = true,
  resetKey,
}: UseAutoSaveOptions) {
  const getSnapshotRef = useRef(getSnapshot);
  const saveRef = useRef(save);
  const isEqualRef = useRef(isEqual);
  getSnapshotRef.current = getSnapshot;
  saveRef.current = save;
  isEqualRef.current = isEqual;

  const lastSavedRef = useRef<unknown>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);

  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const markSaved = useCallback((snapshot?: unknown) => {
    lastSavedRef.current = snapshot ?? getSnapshotRef.current();
    setStatus("idle");
    setError(null);
  }, []);

  const flush = useCallback(async () => {
    if (!enabled || savingRef.current) return;

    const current = getSnapshotRef.current();
    if (lastSavedRef.current === undefined) {
      lastSavedRef.current = current;
      return;
    }
    if (isEqualRef.current(current, lastSavedRef.current)) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    savingRef.current = true;
    if (mountedRef.current) {
      setStatus("saving");
      setError(null);
    }

    try {
      await saveRef.current();
      if (!mountedRef.current) return;
      lastSavedRef.current = getSnapshotRef.current();
      setStatus("saved");
      window.setTimeout(() => {
        if (mountedRef.current) {
          setStatus((s) => (s === "saved" ? "idle" : s));
        }
      }, 2000);
    } catch (e) {
      if (!mountedRef.current) return;
      setStatus("error");
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      savingRef.current = false;
    }
  }, [enabled]);

  const schedule = useCallback(() => {
    if (!enabled) return;

    const current = getSnapshotRef.current();
    if (lastSavedRef.current !== undefined && isEqualRef.current(current, lastSavedRef.current)) {
      if (mountedRef.current && status === "pending") setStatus("idle");
      return;
    }

    if (mountedRef.current) setStatus("pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flush();
    }, debounceMs);
  }, [debounceMs, enabled, flush, status]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    lastSavedRef.current = getSnapshotRef.current();
    setStatus("idle");
    setError(null);
  }, [enabled, resetKey]);

  useEffect(() => {
    if (!saveOnUnmount || !enabled) return;
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const current = getSnapshotRef.current();
      if (
        lastSavedRef.current !== undefined &&
        !isEqualRef.current(current, lastSavedRef.current) &&
        !savingRef.current
      ) {
        void saveRef.current();
      }
    };
  }, [enabled, saveOnUnmount]);

  useEffect(() => {
    if (!enabled) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const current = getSnapshotRef.current();
      if (lastSavedRef.current === undefined) return;
      if (isEqualRef.current(current, lastSavedRef.current)) return;
      void flush();
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [enabled, flush]);

  return { status, error, schedule, flush, markSaved };
}
