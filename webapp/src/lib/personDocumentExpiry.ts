/**
 * UI helpers for `PersonDocument.expiresAt` (ISO string from the API).
 */

export type PersonDocExpiryInfo =
  | { kind: "none" }
  | { kind: "expired"; daysPast: number }
  | { kind: "ok"; daysLeft: number };

export function getPersonDocumentExpiryInfo(
  expiresAtIso: string | null | undefined
): PersonDocExpiryInfo {
  if (expiresAtIso == null || expiresAtIso === "") return { kind: "none" };
  const exp = new Date(expiresAtIso);
  if (Number.isNaN(exp.getTime())) return { kind: "none" };
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfExp = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());
  const diffMs = startOfExp.getTime() - startOfToday.getTime();
  const dayMs = 86400000;
  const days = Math.round(diffMs / dayMs);
  if (days < 0) return { kind: "expired", daysPast: -days };
  return { kind: "ok", daysLeft: days };
}

export function formatDateForDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
