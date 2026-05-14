import { AsyncLocalStorage } from "node:async_hooks";
import { DateTime } from "luxon";
import type { MiddlewareHandler } from "hono";

const CLIENT_TZ_HEADER = "X-Client-Time-Zone";

type WallClockStore = { zone: string };

const wallClockAls = new AsyncLocalStorage<WallClockStore>();

/** IANA zone from the current request (see {@link clientWallClockZoneMiddleware}), default `UTC`. */
export function getClientWallClockZone(): string {
  return wallClockAls.getStore()?.zone ?? "UTC";
}

/** Validate header/query `tz` values; unknown zones fall back to `UTC`. */
export function normalizeClientIanaZone(raw: string | undefined | null): string {
  if (raw == null) return "UTC";
  const z = String(raw).trim();
  if (!z || z.length > 120) return "UTC";
  const probe = DateTime.now().setZone(z);
  return probe.isValid ? z : "UTC";
}

/** UTC calendar `YYYY-MM-DD` for a stored `Date` anchor (matches date-only / noon-UTC DB convention). */
export function utcCalendarYmdFromJsDate(d: Date): string {
  return DateTime.fromJSDate(d, { zone: "utc" }).toFormat("yyyy-MM-dd");
}

/**
 * Combine a stored calendar anchor (`Date` interpreted as UTC calendar day) with a wall-clock
 * `HH:mm` in `zone` → absolute `Date`.
 */
export function wallClockInstantFromStoredDayAndHHMM(
  dateAnchor: Date,
  hhmm: string,
  zone: string
): Date | null {
  if (!Number.isFinite(dateAnchor.getTime())) return null;
  const ymd = utcCalendarYmdFromJsDate(dateAnchor);
  const tm = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!tm) return null;
  const hour = Math.min(23, Math.max(0, Number.parseInt(tm[1]!, 10)));
  const minute = Math.min(59, Math.max(0, Number.parseInt(tm[2]!, 10)));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const parts = ymd.split("-").map((x) => Number.parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [year, month, day] = parts as [number, number, number];
  const dt = DateTime.fromObject(
    { year, month, day, hour, minute, second: 0, millisecond: 0 },
    { zone: normalizeClientIanaZone(zone) }
  );
  if (!dt.isValid) return null;
  return dt.toJSDate();
}

export function wallClockInstantFromDateIsoAndHHMM(dateIso: string, hhmm: string): Date | null {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return null;
  return wallClockInstantFromStoredDayAndHHMM(d, hhmm, getClientWallClockZone());
}

/** Start of the user’s local calendar day as an absolute instant (for DB range filters). */
export function startOfLocalCalendarDayInZone(now: Date, zone: string): Date {
  const z = normalizeClientIanaZone(zone);
  const dt = DateTime.fromJSDate(now, { zone: z }).startOf("day");
  if (!dt.isValid) return DateTime.fromJSDate(now, { zone: "utc" }).startOf("day").toJSDate();
  return dt.toJSDate();
}

export const clientWallClockZoneHeaderName = CLIENT_TZ_HEADER;

/** Reads `X-Client-Time-Zone` and exposes {@link getClientWallClockZone} for the request. */
export const clientWallClockZoneMiddleware: MiddlewareHandler = async (c, next) => {
  const zone = normalizeClientIanaZone(c.req.header(CLIENT_TZ_HEADER));
  await wallClockAls.run({ zone }, async () => {
    await next();
  });
};
