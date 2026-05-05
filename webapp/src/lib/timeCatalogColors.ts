/** Stable accents when catalog colour is not set (#RRGGBB). */
const FALLBACK_PALETTE = [
  "#38bdf8",
  "#a78bfa",
  "#34d399",
  "#fbbf24",
  "#f472b6",
  "#fb7185",
  "#2dd4bf",
  "#c084fc",
] as const;

export function fallbackAccentHex(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length];
}

/** Resolved display hex for a catalog row (stored colour or deterministic fallback). */
export function displayHex(stored: string | null | undefined, id: string): string {
  if (stored && /^#[0-9A-Fa-f]{6}$/.test(stored)) return stored;
  return fallbackAccentHex(id);
}

export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return `rgba(148, 163, 184, ${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
