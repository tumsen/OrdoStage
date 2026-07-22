/** Parsed row from a Timerly CSV export (comma or semicolon). */
export type ParsedTimerlyEntry = {
  rowIndex: number;
  client: string;
  project: string;
  dateIso: string;
  personName: string;
  loggedHours: number;
  tags: string[];
  note: string;
  /** One or more HH:MM ranges on the same calendar day. */
  timeRanges: { start: string; end: string }[];
};

export type TimerlyParseResult = {
  source: "timerly";
  delimiter: "," | ";";
  skippedSummaryRows: number;
  invalidRows: { rowIndex: number; reason: string }[];
  entries: ParsedTimerlyEntry[];
};

function detectDelimiter(headerLine: string): "," | ";" {
  const semi = (headerLine.match(/;/g) ?? []).length;
  const comma = (headerLine.match(/,/g) ?? []).length;
  return semi > comma ? ";" : ",";
}

/** Minimal RFC-style CSV row parser (quoted fields, escaped quotes). */
function parseCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function cleanProject(raw: string): string {
  return raw.trim().replace(/^"+|"+$/g, "").trim();
}

function parseDanishDate(raw: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const day = Number.parseInt(m[1]!, 10);
  const month = Number.parseInt(m[2]!, 10);
  const year = Number.parseInt(m[3]!, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDecimalHours(raw: string): number {
  const s = raw.trim();
  if (!s) return 0;
  const colon = /^(\d{1,5}):([0-5]?\d)$/.exec(s);
  if (colon) {
    const hours = Number.parseInt(colon[1]!, 10);
    const minutes = Number.parseInt(colon[2]!, 10);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes >= 60) return 0;
    return hours + minutes / 60;
  }
  const n = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function parseTimeRangesFromTimestamp(raw: string): { start: string; end: string }[] {
  const ranges: { start: string; end: string }[] = [];
  for (const part of raw.split(",")) {
    const m = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/.exec(part.trim());
    if (m) ranges.push({ start: m[1]!, end: m[2]! });
  }
  return ranges;
}

function normalizeHhMm(raw: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number.parseInt(m[1]!, 10);
  const min = Number.parseInt(m[2]!, 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function parseTags(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function parseTimerlyCsv(csvText: string): TimerlyParseResult {
  const text = csvText.replace(/^\uFEFF/, "").trim();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      source: "timerly",
      delimiter: ",",
      skippedSummaryRows: 0,
      invalidRows: [{ rowIndex: 0, reason: "Empty file" }],
      entries: [],
    };
  }

  const delimiter = detectDelimiter(lines[0]!);
  const headers = parseCsvLine(lines[0]!, delimiter).map((h) => h.trim());
  const col = (name: string) => headers.indexOf(name);

  const idxProject = col("Project");
  const idxDate = col("Hour Date");
  const idxName = col("Name");
  const idxHours = col("Logged Hours");
  const idxTags = col("Hour Tags");
  const idxNote = col("Hour Note");
  const idxTimestamp = col("Timestamp");
  const idxFrom = col("Hour From");
  const idxTo = col("Hour To");
  const idxClient = col("Client");

  const invalidRows: { rowIndex: number; reason: string }[] = [];
  const entries: ParsedTimerlyEntry[] = [];
  let skippedSummaryRows = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!, delimiter);
    const get = (idx: number) => (idx >= 0 ? (cells[idx] ?? "").trim() : "");

    const hourDate = get(idxDate);
    const personName = get(idxName);
    const projectRaw = get(idxProject);

    if (!hourDate || !personName) {
      skippedSummaryRows++;
      continue;
    }

    const dateIso = parseDanishDate(hourDate);
    if (!dateIso) {
      invalidRows.push({ rowIndex: i + 1, reason: `Invalid date: ${hourDate}` });
      continue;
    }

    let timeRanges: { start: string; end: string }[] = [];
    const timestamp = get(idxTimestamp);
    if (timestamp) {
      timeRanges = parseTimeRangesFromTimestamp(timestamp);
    } else {
      const from = normalizeHhMm(get(idxFrom));
      const to = normalizeHhMm(get(idxTo));
      if (from && to) timeRanges = [{ start: from, end: to }];
    }

    const loggedHours = parseDecimalHours(get(idxHours));
    if (timeRanges.length === 0 && loggedHours > 0) {
      timeRanges = [{ start: "08:00", end: "08:00" }];
    }

    if (timeRanges.length === 0) {
      invalidRows.push({ rowIndex: i + 1, reason: "No time range or logged hours" });
      continue;
    }

    entries.push({
      rowIndex: i + 1,
      client: get(idxClient),
      project: cleanProject(projectRaw),
      dateIso,
      personName,
      loggedHours,
      tags: parseTags(get(idxTags)),
      note: get(idxNote),
      timeRanges,
    });
  }

  return {
    source: "timerly",
    delimiter,
    skippedSummaryRows,
    invalidRows,
    entries,
  };
}

/** Expand entries with multiple timestamp ranges into one slot each. */
export function expandTimerlyTimeSlots(entry: ParsedTimerlyEntry): ParsedTimerlyEntry[] {
  if (entry.timeRanges.length <= 1) return [entry];
  return entry.timeRanges.map((range, idx) => ({
    ...entry,
    timeRanges: [range],
    note: entry.timeRanges.length > 1 ? `${entry.note}${entry.note ? " · " : ""}(del ${idx + 1})` : entry.note,
  }));
}
