import { useCallback, useState } from "react";

export function readPersistedViewMode<T extends string>(
  storageKey: string,
  allowed: readonly T[],
  fallback: T,
): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw !== null && (allowed as readonly string[]).includes(raw)) {
      return raw as T;
    }
  } catch {
    // storage unavailable (private mode, quota, etc.)
  }
  return fallback;
}

export function writePersistedViewMode(storageKey: string, mode: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, mode);
  } catch {
    // ignore
  }
}

/** Remember the last selected calendar view mode for a page (localStorage). */
export function usePersistedViewMode<T extends string>(
  storageKey: string,
  allowed: readonly T[],
  fallback: T,
): readonly [T, (mode: T) => void] {
  const [mode, setModeState] = useState<T>(() =>
    readPersistedViewMode(storageKey, allowed, fallback),
  );

  const setMode = useCallback(
    (next: T) => {
      setModeState(next);
      writePersistedViewMode(storageKey, next);
    },
    [storageKey],
  );

  return [mode, setMode] as const;
}
