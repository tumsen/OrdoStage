/** One row in `event.customFields` JSON array (persisted shape). */
export type EventCustomField = { key: string; value: string; departments: string[] };

function normalizeCustomFieldItem(raw: unknown): EventCustomField | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key : "";
  const value = typeof o.value === "string" ? o.value : "";
  const departments = Array.isArray(o.departments)
    ? (o.departments as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  return { key, value, departments };
}

/** Safe parse of event `customFields` JSON string into normalized rows. */
export function parseEventCustomFieldsJson(customFields: string | null | undefined): EventCustomField[] {
  if (!customFields?.trim()) return [];
  try {
    const p = JSON.parse(customFields) as unknown;
    if (!Array.isArray(p)) return [];
    const out: EventCustomField[] = [];
    for (const item of p) {
      const row = normalizeCustomFieldItem(item);
      if (row) out.push(row);
    }
    return out;
  } catch {
    return [];
  }
}
