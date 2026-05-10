import { endTimeFromStartAndDuration, normalizeTimeHHMM } from "./timeHHMM";

function isoDate(d: unknown): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

export function serializeTourScheduleEvent(row: {
  id: string;
  tourShowId: string;
  kind: string;
  customLabel?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  sortOrder?: number | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}) {
  return {
    id: row.id,
    tourShowId: row.tourShowId,
    kind: row.kind,
    customLabel: row.customLabel ?? null,
    startTime: normalizeTimeHHMM(row.startTime ?? ""),
    endTime: normalizeTimeHHMM(row.endTime ?? ""),
    sortOrder: row.sortOrder ?? 0,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  };
}

/** When DB has no rows yet, derive display events from legacy single-time columns. */
export function deriveLegacyScheduleEvents(show: {
  id: string;
  getInTime?: string | null;
  rehearsalTime?: string | null;
  soundcheckTime?: string | null;
  showTime?: string | null;
  doorsTime?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}) {
  const rows: { kind: string; start: string }[] = [];
  const add = (kind: string, t: string | null | undefined) => {
    const n = t ? normalizeTimeHHMM(String(t)) : "";
    if (!n) return;
    rows.push({ kind, start: n });
  };
  add("get_in", show.getInTime);
  add("rehearsal", show.rehearsalTime);
  add("soundcheck", show.soundcheckTime);
  add("show", show.showTime);
  add("get_out", show.doorsTime);
  rows.sort((a, b) => a.start.localeCompare(b.start));
  return rows.map((r, i) => ({
    id: `legacy:${show.id}:${i}`,
    tourShowId: show.id,
    kind: r.kind,
    customLabel: null,
    startTime: r.start,
    endTime: endTimeFromStartAndDuration(r.start, 60),
    sortOrder: i,
    createdAt: isoDate(show.createdAt),
    updatedAt: isoDate(show.updatedAt),
  }));
}

export function mergedScheduleEvents(show: {
  id: string;
  scheduleEvents?: unknown;
  getInTime?: string | null;
  rehearsalTime?: string | null;
  soundcheckTime?: string | null;
  showTime?: string | null;
  doorsTime?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}) {
  const raw = show.scheduleEvents ?? [];
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((row: any) => serializeTourScheduleEvent(row));
  }
  return deriveLegacyScheduleEvents(show);
}
