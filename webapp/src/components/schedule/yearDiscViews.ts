import {
  DEFAULT_YEAR_DISC_CONFIG,
  deserializeYearDiscConfig,
  normalizeYearDiscConfig,
  type YearDiscConfig,
} from "@/components/schedule/yearDiscConfig";

export type YearDiscViewFilters = {
  venueId: string;
  eventId: string;
  tourId: string;
};

export const DEFAULT_YEAR_DISC_VIEW_FILTERS: YearDiscViewFilters = {
  venueId: "all",
  eventId: "all",
  tourId: "all",
};

export type YearDiscSavedView = {
  id: string;
  name: string;
  config: YearDiscConfig;
  filters: YearDiscViewFilters;
};

export type YearDiscViewsStore = {
  activeViewId: string;
  views: YearDiscSavedView[];
};

export function newYearDiscViewId(): string {
  return `ydv-${crypto.randomUUID().slice(0, 8)}`;
}

function normalizeFilters(raw: unknown): YearDiscViewFilters {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_YEAR_DISC_VIEW_FILTERS };
  const o = raw as Record<string, unknown>;
  return {
    venueId: typeof o.venueId === "string" && o.venueId ? o.venueId : "all",
    eventId: typeof o.eventId === "string" && o.eventId ? o.eventId : "all",
    tourId: typeof o.tourId === "string" && o.tourId ? o.tourId : "all",
  };
}

export function createYearDiscSavedView(
  name: string,
  config: YearDiscConfig = DEFAULT_YEAR_DISC_CONFIG,
  filters: YearDiscViewFilters = DEFAULT_YEAR_DISC_VIEW_FILTERS,
): YearDiscSavedView {
  return {
    id: newYearDiscViewId(),
    name: name.trim() || "Untitled",
    config: normalizeYearDiscConfig(config),
    filters: normalizeFilters(filters),
  };
}

export function defaultYearDiscViewsStore(): YearDiscViewsStore {
  const view = createYearDiscSavedView("Default");
  return { activeViewId: view.id, views: [view] };
}

export function normalizeYearDiscViewsStore(raw: unknown): YearDiscViewsStore {
  if (!raw || typeof raw !== "object") return defaultYearDiscViewsStore();
  const o = raw as Record<string, unknown>;
  const viewsRaw = Array.isArray(o.views) ? o.views : [];
  const views: YearDiscSavedView[] = [];

  for (const entry of viewsRaw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === "string" && e.name.trim() ? e.name.trim() : "Untitled";
    views.push({
      id: typeof e.id === "string" && e.id ? e.id : newYearDiscViewId(),
      name,
      config: normalizeYearDiscConfig(e.config),
      filters: normalizeFilters(e.filters),
    });
  }

  if (views.length === 0) return defaultYearDiscViewsStore();

  const activeViewId =
    typeof o.activeViewId === "string" && views.some((v) => v.id === o.activeViewId)
      ? o.activeViewId
      : views[0]!.id;

  return { activeViewId, views };
}

export function serializeYearDiscViewsStore(store: YearDiscViewsStore): string {
  return JSON.stringify(normalizeYearDiscViewsStore(store));
}

export function deserializeYearDiscViewsStore(raw: string | null): YearDiscViewsStore {
  if (!raw) return defaultYearDiscViewsStore();
  try {
    return normalizeYearDiscViewsStore(JSON.parse(raw));
  } catch {
    return defaultYearDiscViewsStore();
  }
}

export function uniqueYearDiscViewName(views: YearDiscSavedView[], base: string): string {
  const trimmed = base.trim() || "Untitled";
  const existing = new Set(views.map((v) => v.name));
  if (!existing.has(trimmed)) return trimmed;
  let n = 2;
  while (existing.has(`${trimmed} ${n}`)) n += 1;
  return `${trimmed} ${n}`;
}

export function activeYearDiscView(store: YearDiscViewsStore): YearDiscSavedView {
  return store.views.find((v) => v.id === store.activeViewId) ?? store.views[0]!;
}

export function updateActiveYearDiscView(
  store: YearDiscViewsStore,
  patch: { config?: YearDiscConfig; filters?: Partial<YearDiscViewFilters> },
): YearDiscViewsStore {
  const active = activeYearDiscView(store);
  const nextView: YearDiscSavedView = {
    ...active,
    config: patch.config ? normalizeYearDiscConfig(patch.config) : active.config,
    filters: patch.filters ? { ...active.filters, ...patch.filters } : active.filters,
  };
  return {
    ...store,
    views: store.views.map((v) => (v.id === active.id ? nextView : v)),
  };
}

/** One-time migration from the legacy single-config localStorage key. */
export function migrateLegacyYearDiscConfig(): YearDiscViewsStore | null {
  if (typeof window === "undefined") return null;
  try {
    const legacy = window.localStorage.getItem("ordo.yearDisc.config");
    if (!legacy) return null;
    const config = deserializeYearDiscConfig(legacy);
    const view = createYearDiscSavedView("Default", config);
    return { activeViewId: view.id, views: [view] };
  } catch {
    return null;
  }
}
