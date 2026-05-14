import type { TranslationKey } from "@/lib/i18n";

export type VenueTranslate = (
  key: TranslationKey,
  vars?: Record<string, string | number | boolean | null | undefined>,
) => string;

const TRAILING_M = /\s*(m|meter|meters|metre|metres)\s*$/i;

/** Append SI metres when the stored value has no unit yet. */
export function formatVenueDimensionMetersDisplay(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (TRAILING_M.test(s)) return s;
  return `${s} m`;
}

export function formatVenueCapacityDisplay(n: number, locale: string, t: VenueTranslate): string {
  const count = n.toLocaleString(locale);
  return n === 1 ? t("venueInfo.capacityPerson", { count }) : t("venueInfo.capacityPersons", { count });
}
