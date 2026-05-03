/** Same shape as extra “contact persons” on an event and for primary / technical contract rows. */

export type EventContactRowFields = {
  role: string;
  name: string;
  phone: string;
  email: string;
  note: string;
};

export function emptyContactRowFields(): EventContactRowFields {
  return { role: "", name: "", email: "", phone: "", note: "" };
}

export function migrateContactRowFields(raw: unknown): EventContactRowFields {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    role: String(o.role ?? ""),
    name: String(o.name ?? ""),
    email: String(o.email ?? ""),
    phone: String(o.phone ?? ""),
    note: String(o.note ?? ""),
  };
}

/** Parse API `contactPerson` or custom-field JSON; legacy free-text becomes `note`. */
export function parseStoredContactRow(raw: string | null | undefined): EventContactRowFields {
  if (!raw?.trim()) return emptyContactRowFields();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return migrateContactRowFields(parsed);
    }
  } catch {
    /* legacy plain text */
  }
  return { ...emptyContactRowFields(), note: raw.trim() };
}

export function serializeContactRow(row: EventContactRowFields): string {
  const t = {
    role: row.role.trim(),
    name: row.name.trim(),
    phone: row.phone.trim(),
    email: row.email.trim(),
    note: row.note.trim(),
  };
  if (!t.role && !t.name && !t.phone && !t.email && !t.note) return "";
  return JSON.stringify(t);
}
