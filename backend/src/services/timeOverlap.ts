/** Half-open-style overlap: touching endpoints do not count. */
export function timeSpansOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

export function spanFullyContains(
  outerStart: Date,
  outerEnd: Date,
  innerStart: Date,
  innerEnd: Date
): boolean {
  return (
    outerStart.getTime() <= innerStart.getTime() && outerEnd.getTime() >= innerEnd.getTime()
  );
}

export type OccupiedSpan = { startsAt: Date; endsAt: Date };

export type LunchBreakHints = {
  startsAt: Date;
  endsAt: Date;
  note?: string | null;
  /** Comma-separated tags or similar. */
  tagsText?: string | null;
  projectName?: string | null;
};

/**
 * Timely “frokost” / paid pause: short midday block, often on internal house project
 * with note/tags like frokost / Betalt pause.
 */
export function isLikelyLunchBreak(hints: LunchBreakHints): boolean {
  const durMin = (hints.endsAt.getTime() - hints.startsAt.getTime()) / 60_000;
  if (durMin < 15 || durMin > 45) return false;

  // Wall-clock midday window (local components of the stored instant).
  const start = hints.startsAt;
  const minutes = start.getHours() * 60 + start.getMinutes();
  if (minutes < 11 * 60 || minutes > 13 * 60 + 30) return false;

  const blob = `${hints.note ?? ""} ${hints.tagsText ?? ""} ${hints.projectName ?? ""}`.toLowerCase();
  if (/frokost|\blunch\b|betalt\s*pause/.test(blob)) return true;
  // Short midday internal “i huset” pause without explicit frokost wording
  if (/i huset|#baggård|#baggaard|baggårdteatret|baggaardteatret/.test(blob) && durMin <= 35) {
    return true;
  }
  return false;
}

/**
 * Keep duration; if the span overlaps any occupied block, move it to start
 * at the end of the conflicting block. Repeat until free (or safety cap).
 */
export function shiftSpanPastOccupied(
  startsAt: Date,
  endsAt: Date,
  occupied: OccupiedSpan[]
): { startsAt: Date; endsAt: Date; shifted: boolean } {
  const durationMs = endsAt.getTime() - startsAt.getTime();
  if (durationMs <= 0) {
    return { startsAt, endsAt, shifted: false };
  }

  let s = startsAt.getTime();
  let e = endsAt.getTime();
  let shifted = false;
  const sorted = [...occupied].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  for (let pass = 0; pass < sorted.length + 8; pass++) {
    let hit: OccupiedSpan | null = null;
    for (const o of sorted) {
      if (o.startsAt.getTime() < e && o.endsAt.getTime() > s) {
        hit = o;
        break;
      }
    }
    if (!hit) break;
    shifted = true;
    s = hit.endsAt.getTime();
    e = s + durationMs;
  }

  return { startsAt: new Date(s), endsAt: new Date(e), shifted };
}
