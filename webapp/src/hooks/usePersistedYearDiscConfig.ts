import { useCallback, useState } from "react";

import {
  DEFAULT_YEAR_DISC_CONFIG,
  deserializeYearDiscConfig,
  normalizeYearDiscConfig,
  serializeYearDiscConfig,
  type YearDiscConfig,
} from "@/components/schedule/yearDiscConfig";

const STORAGE_KEY = "ordo.yearDisc.config";

export function readPersistedYearDiscConfig(): YearDiscConfig {
  if (typeof window === "undefined") return DEFAULT_YEAR_DISC_CONFIG;
  try {
    return deserializeYearDiscConfig(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_YEAR_DISC_CONFIG;
  }
}

export function writePersistedYearDiscConfig(config: YearDiscConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeYearDiscConfig(normalizeYearDiscConfig(config)));
  } catch {
    // ignore
  }
}

export function usePersistedYearDiscConfig(): readonly [YearDiscConfig, (config: YearDiscConfig) => void] {
  const [config, setConfigState] = useState<YearDiscConfig>(() => readPersistedYearDiscConfig());

  const setConfig = useCallback((next: YearDiscConfig) => {
    const normalized = normalizeYearDiscConfig(next);
    setConfigState(normalized);
    writePersistedYearDiscConfig(normalized);
  }, []);

  return [config, setConfig] as const;
}
