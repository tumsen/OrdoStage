/** Stored in Event.stageSize as JSON. v=2: meters + centimeters per dimension. */

export const STAGE_SIZE_V = 2 as const;

export type StageDimMetersCm = { m: string; cm: string };
export type StageDimensionsForm = {
  stageWidthM: string;
  stageWidthCm: string;
  stageDepthM: string;
  stageDepthCm: string;
  stageHeightM: string;
  stageHeightCm: string;
};

const EMPTY: StageDimMetersCm = { m: "", cm: "" };

function numM(s: string): number {
  const t = String(s ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!t) return 0;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function numCm(s: string): number {
  const t = String(s ?? "").trim();
  if (!t) return 0;
  const n = parseInt(t, 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(99, Math.max(0, n));
}

/** Total meters for one W/D/H from m + cm fields (cm is 0–99). */
export function dimToTotalMetersMcm(pair: StageDimMetersCm): number {
  const m = numM(pair.m);
  const cm = numCm(pair.cm);
  return m + cm / 100;
}

function clampMInput(raw: string): string {
  const t = String(raw).trim().replace(",", ".");
  if (!t) return "";
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return raw;
  return String(Math.min(999.99, Math.max(0, n)));
}

/**
 * Parse venue dimension strings (freeform, one field per edge in DB).
 * Returns total meters or null if unknown.
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

export function decodeStageSize(
  stageSize: string | null | undefined
): {
  w: StageDimMetersCm;
  d: StageDimMetersCm;
  h: StageDimMetersCm;
} {
  if (!stageSize?.trim()) {
    return { w: { ...EMPTY }, d: { ...EMPTY }, h: { ...EMPTY } };
  }
  const s = stageSize.trim();
  if (s.startsWith("{")) {
    try {
      const j = JSON.parse(s) as {
        v?: number;
        w?: { m?: number; cm?: number } | [number, number];
        d?: { m?: number; cm?: number } | [number, number];
        h?: { m?: number; cm?: number } | [number, number];
      };
      const pick = (x: typeof j.w, label: "w" | "d" | "h"): StageDimMetersCm => {
        if (Array.isArray(x) && x.length >= 1) {
          return {
            m: x[0] != null ? String(x[0]) : "",
            cm: x[1] != null ? String(x[1]) : "",
          };
        }
        if (x && typeof x === "object" && "m" in x) {
          return {
            m: x.m != null ? String(x.m) : "",
            cm: x.cm != null ? String(x.cm) : "",
          };
        }
        return { ...EMPTY };
      };
      if (j.v === 2 && j.w && j.d && j.h) {
        return { w: pick(j.w, "w"), d: pick(j.d, "d"), h: pick(j.h, "h") };
      }
    } catch {
      /* fall through */
    }
  }
  return { w: { ...EMPTY }, d: { ...EMPTY }, h: { ...EMPTY } };
}

export function encodeStageSize(
  w: StageDimMetersCm,
  d: StageDimMetersCm,
  h: StageDimMetersCm
): string | undefined {
  const wm = clampMInput(w.m);
  const wcm = String(numCm(w.cm) || 0);
  const dm = clampMInput(d.m);
  const dcm = String(numCm(d.cm) || 0);
  const hm = clampMInput(h.m);
  const hcm = String(numCm(h.cm) || 0);
  const allEmpty = !wm && wcm === "0" && !dm && dcm === "0" && !hm && hcm === "0";
  if (allEmpty) return undefined;
  return JSON.stringify({
    v: STAGE_SIZE_V,
    w: { m: wm ? parseFloat(wm) : 0, cm: parseInt(wcm, 10) || 0 },
    d: { m: dm ? parseFloat(dm) : 0, cm: parseInt(dcm, 10) || 0 },
    h: { m: hm ? parseFloat(hm) : 0, cm: parseInt(hcm, 10) || 0 },
  });
}

export function formDimsToStageSize(values: StageDimensionsForm): string | undefined {
  return encodeStageSize(
    { m: values.stageWidthM, cm: values.stageWidthCm },
    { m: values.stageDepthM, cm: values.stageDepthCm },
    { m: values.stageHeightM, cm: values.stageHeightCm }
  );
}

export function decodeToFormFields(
  stageSize: string | null | undefined
): StageDimensionsForm {
  const { w, d, h } = decodeStageSize(stageSize);
  return {
    stageWidthM: w.m,
    stageWidthCm: w.cm,
    stageDepthM: d.m,
    stageDepthCm: d.cm,
    stageHeightM: h.m,
    stageHeightCm: h.cm,
  };
}

export function requiredStageTotalsMeters(
  w: StageDimMetersCm,
  d: StageDimMetersCm,
  h: StageDimMetersCm
): { w: number; d: number; h: number } {
  return {
    w: dimToTotalMetersMcm(w),
    d: dimToTotalMetersMcm(d),
    h: dimToTotalMetersMcm(h),
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

/** When any required stage edge (m+cm) exceeds the venue, return messages. */
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
