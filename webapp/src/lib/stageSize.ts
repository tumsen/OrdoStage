/**
 * Event.stageSize JSON.
 * v=3: one value per axis in metres (W × D × H), max 999.99.
 * v=2 (legacy): m + cm per axis — still decoded for display.
 */

export const STAGE_SIZE_V = 3 as const;

export type StageDimensionsForm = {
  stageWidth: string;
  stageDepth: string;
  stageHeight: string;
};

function parseMetresInput(raw: string): number {
  const t = String(raw ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!t) return 0;
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return 0;
  return Math.min(999.99, Math.max(0, n));
}

/** Format stored number for the input (comma decimal, trim zeros). */
export function formatMetresForInput(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return "";
  const rounded = Math.round(m * 100) / 100;
  const s = rounded.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
  return s;
}

/**
 * Parse venue dimension strings (freeform, one field per edge in DB).
 * Returns total metres or null if unknown.
 */
export function parseVenueEdgeToMeters(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  const mWithCm = lower.match(/(\d+(?:[.,]\d+)?)\s*m(?:\s*(\d{1,2}(?:[.,]\d+)?)\s*cm)?/i);
  if (mWithCm) {
    const a = parseFloat(mWithCm[1].replace(",", "."));
    const c = mWithCm[2] ? parseFloat(mWithCm[2].replace(",", ".")) : 0;
    if (Number.isFinite(a)) return a + (Number.isFinite(c) ? c / 100 : 0);
  }
  const parts = s.split(/[×x*]/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 0) {
    const first = parseFloat(parts[0].replace(",", ".").replace(/[^\d.,-]/g, "")) || 0;
    if (Number.isFinite(first) && first > 0) return first;
  }
  const n = s.match(/(\d+(?:[.,]\d+)?)/);
  if (n) {
    const v = parseFloat(n[1].replace(",", "."));
    if (Number.isFinite(v) && s.toLowerCase().includes("cm") && v < 100) return v / 100;
    if (Number.isFinite(v)) return v;
  }
  return null;
}

type LegacyMcm = { m?: number; cm?: number } | [number, number];

function legacyAxisToMeters(x: LegacyMcm | undefined): number {
  if (x == null) return 0;
  if (Array.isArray(x)) {
    const m = x[0] ?? 0;
    const cm = x[1] ?? 0;
    return (Number.isFinite(m) ? m : 0) + (Number.isFinite(cm) ? cm / 100 : 0);
  }
  const m = x.m ?? 0;
  const cm = x.cm ?? 0;
  return m + cm / 100;
}

export function decodeStageSizeJson(stageSize: string | null | undefined): {
  w: number;
  d: number;
  h: number;
} {
  if (!stageSize?.trim()) return { w: 0, d: 0, h: 0 };
  const s = stageSize.trim();
  if (!s.startsWith("{")) return { w: 0, d: 0, h: 0 };
  try {
    const j = JSON.parse(s) as {
      v?: number;
      w?: number | LegacyMcm;
      d?: number | LegacyMcm;
      h?: number | LegacyMcm;
    };
    if (j.v === STAGE_SIZE_V && j.w != null && j.d != null && j.h != null) {
      const num = (x: unknown) => {
        if (typeof x === "number" && Number.isFinite(x)) return x;
        const n = parseFloat(String(x).replace(",", "."));
        return Number.isFinite(n) ? n : 0;
      };
      return { w: num(j.w), d: num(j.d), h: num(j.h) };
    }
    if (j.v === 2 && j.w != null && j.d != null && j.h != null) {
      return {
        w: legacyAxisToMeters(j.w as LegacyMcm),
        d: legacyAxisToMeters(j.d as LegacyMcm),
        h: legacyAxisToMeters(j.h as LegacyMcm),
      };
    }
  } catch {
    /* ignore */
  }
  return { w: 0, d: 0, h: 0 };
}

export function encodeStageSize(
  width: string,
  depth: string,
  height: string
): string | undefined {
  const w = parseMetresInput(width);
  const d = parseMetresInput(depth);
  const h = parseMetresInput(height);
  if (w <= 0 && d <= 0 && h <= 0) return undefined;
  return JSON.stringify({ v: STAGE_SIZE_V, w, d, h });
}

export function formDimsToStageSize(values: StageDimensionsForm): string | undefined {
  return encodeStageSize(values.stageWidth, values.stageDepth, values.stageHeight);
}

export function decodeToFormFields(stageSize: string | null | undefined): StageDimensionsForm {
  const { w, d, h } = decodeStageSizeJson(stageSize);
  return {
    stageWidth: w > 0 ? formatMetresForInput(w) : "",
    stageDepth: d > 0 ? formatMetresForInput(d) : "",
    stageHeight: h > 0 ? formatMetresForInput(h) : "",
  };
}

export function requiredStageTotalsMetersFromStrings(a: {
  stageWidth: string;
  stageDepth: string;
  stageHeight: string;
}): { w: number; d: number; h: number } {
  return {
    w: parseMetresInput(a.stageWidth),
    d: parseMetresInput(a.stageDepth),
    h: parseMetresInput(a.stageHeight),
  };
}

export function venueRecordToMeters(venue: {
  width: string | null | undefined;
  length: string | null | undefined;
  height: string | null | undefined;
}): { width: number | null; depth: number | null; height: number | null } {
  return {
    width: parseVenueEdgeToMeters(venue.width),
    depth: parseVenueEdgeToMeters(venue.length),
    height: parseVenueEdgeToMeters(venue.height),
  };
}

/** When any required stage edge exceeds the venue, return messages. */
export function venueSmallerThanStageWarnings(
  req: { w: number; d: number; h: number },
  venue: { width: number | null; depth: number | null; height: number | null }
): string[] {
  const o: string[] = [];
  if (venue.width != null && req.w > 0 && req.w - venue.width > 1e-6) {
    o.push(
      `Width needed ${req.w.toFixed(2)}m exceeds venue width ${venue.width.toFixed(2)}m.`
    );
  }
  if (venue.depth != null && req.d > 0 && req.d - venue.depth > 1e-6) {
    o.push(
      `Depth needed ${req.d.toFixed(2)}m exceeds venue depth ${venue.depth.toFixed(2)}m.`
    );
  }
  if (venue.height != null && req.h > 0 && req.h - venue.height > 1e-6) {
    o.push(
      `Height needed ${req.h.toFixed(2)}m exceeds venue height ${venue.height.toFixed(2)}m.`
    );
  }
  return o;
}
