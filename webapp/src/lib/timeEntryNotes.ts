/** Matches `SETTLEMENT_ENTRY_NOTE_PREFIX` in backend timesheet comp settlement. */
export const TIMESHEET_SETTLEMENT_ENTRY_NOTE_PREFIX = "timesheetSettlementEntry:";

export function isTimesheetSettlementFillEntry(entry: {
  note?: string | null;
}): boolean {
  const n = entry.note?.trim() ?? "";
  return n.startsWith(TIMESHEET_SETTLEMENT_ENTRY_NOTE_PREFIX);
}

/** Notes shown in the UI — hides machine-readable settlement tracking. */
export function timeEntryUserVisibleNote(note: string | null | undefined): string {
  const n = note?.trim() ?? "";
  if (!n || n.startsWith(TIMESHEET_SETTLEMENT_ENTRY_NOTE_PREFIX)) return "";
  return n;
}
