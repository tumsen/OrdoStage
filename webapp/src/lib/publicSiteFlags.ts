/** Site content keys `public_maintenance_mode` / `public_early_bird_landing`: "1" on, "0" off (English row is global source). */
export function isPublicFlagOn(
  value: string | undefined,
  defaultWhenMissing: boolean
): boolean {
  if (value === undefined || value === "") return defaultWhenMissing;
  const v = value.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  return defaultWhenMissing;
}
