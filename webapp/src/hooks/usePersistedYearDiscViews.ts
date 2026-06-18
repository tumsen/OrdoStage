import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import type { YearDiscConfig } from "@/components/schedule/yearDiscConfig";
import {
  activeYearDiscView,
  createYearDiscSavedView,
  defaultYearDiscViewsStore,
  deserializeYearDiscViewsStore,
  migrateLegacyYearDiscConfig,
  normalizeYearDiscViewsStore,
  serializeYearDiscViewsStore,
  uniqueYearDiscViewName,
  updateActiveYearDiscView,
  type YearDiscSavedView,
  type YearDiscViewFilters,
  type YearDiscViewsStore,
} from "@/components/schedule/yearDiscViews";

const STORAGE_KEY = "ordo.yearDisc.views";

export function readPersistedYearDiscViews(): YearDiscViewsStore {
  if (typeof window === "undefined") return defaultYearDiscViewsStore();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return deserializeYearDiscViewsStore(raw);
    const migrated = migrateLegacyYearDiscConfig();
    if (migrated) {
      writePersistedYearDiscViews(migrated);
      return migrated;
    }
    return defaultYearDiscViewsStore();
  } catch {
    return defaultYearDiscViewsStore();
  }
}

export function writePersistedYearDiscViews(store: YearDiscViewsStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, serializeYearDiscViewsStore(store));
  } catch {
    // ignore
  }
}

function commitStore(
  setStoreState: Dispatch<SetStateAction<YearDiscViewsStore>>,
  updater: (prev: YearDiscViewsStore) => YearDiscViewsStore,
) {
  setStoreState((prev) => {
    const next = normalizeYearDiscViewsStore(updater(prev));
    writePersistedYearDiscViews(next);
    return next;
  });
}

export function usePersistedYearDiscViews() {
  const [store, setStoreState] = useState<YearDiscViewsStore>(() => readPersistedYearDiscViews());

  const activeView = useMemo(() => activeYearDiscView(store), [store]);

  const setConfig = useCallback((config: YearDiscConfig) => {
    commitStore(setStoreState, (prev) => updateActiveYearDiscView(prev, { config }));
  }, []);

  const setFilters = useCallback((patch: Partial<YearDiscViewFilters>) => {
    commitStore(setStoreState, (prev) => updateActiveYearDiscView(prev, { filters: patch }));
  }, []);

  const selectView = useCallback((viewId: string) => {
    commitStore(setStoreState, (prev) => {
      if (!prev.views.some((v) => v.id === viewId)) return prev;
      return { ...prev, activeViewId: viewId };
    });
  }, []);

  const saveAs = useCallback((name: string) => {
    commitStore(setStoreState, (prev) => {
      const current = activeYearDiscView(prev);
      const view = createYearDiscSavedView(
        uniqueYearDiscViewName(prev.views, name),
        current.config,
        current.filters,
      );
      return { activeViewId: view.id, views: [...prev.views, view] };
    });
  }, []);

  const renameView = useCallback((viewId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    commitStore(setStoreState, (prev) => ({
      ...prev,
      views: prev.views.map((v) =>
        v.id === viewId
          ? { ...v, name: uniqueYearDiscViewName(prev.views.filter((x) => x.id !== viewId), trimmed) }
          : v,
      ),
    }));
  }, []);

  const deleteView = useCallback((viewId: string) => {
    commitStore(setStoreState, (prev) => {
      if (prev.views.length <= 1) return prev;
      const views = prev.views.filter((v) => v.id !== viewId);
      const activeViewId = prev.activeViewId === viewId ? views[0]!.id : prev.activeViewId;
      return { activeViewId, views };
    });
  }, []);

  return {
    activeView,
    views: store.views,
    setConfig,
    setFilters,
    selectView,
    saveAs,
    renameView,
    deleteView,
  } as const;
}

export type { YearDiscSavedView, YearDiscViewFilters };
