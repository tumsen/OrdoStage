import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { EventDetail, InternalBookingDetail } from "../../../../backend/src/types";
import {
  calendarItemTimeRangeLabel,
  itemsForDay,
  toDateStr,
  type CalendarItem,
} from "@/components/schedule/scheduleUtils";
import { YearDiscRingSettingsDialog } from "@/components/schedule/YearDiscRingEditor";
import { usePreferences } from "@/hooks/usePreferences";
import { cn } from "@/lib/utils";
import {
  buildYearDiscTimeline,
  defaultDiscDay,
  DEFAULT_YEAR_DISC_RANGE,
  resolveYearDiscRingSpans,
  yearDiscAngleOffsetDeg,
  yearDiscRingColor,
  yearDiscRingLabel,
  type YearDiscConfig,
  type YearDiscResolveContext,
  type YearDiscSpan,
  type YearDiscTimeline,
} from "@/components/schedule/yearDiscConfig";

const DISC_SCALE = 1.2;
const SIZE = Math.round(720 * DISC_SCALE);
const MIN_DISC_PX = 240;
const CX = SIZE / 2;
const CY = SIZE / 2;
const OUTER_R = Math.round(318 * DISC_SCALE);
const RING_GAP = Math.round(3 * DISC_SCALE);
const LABEL_R = OUTER_R + Math.round(22 * DISC_SCALE);
const NEEDLE_OUTER_R = OUTER_R + Math.round(12 * DISC_SCALE);
const INNER_RESERVE = Math.round(90 * DISC_SCALE);

function useSquareFitSize(containerRef: React.RefObject<HTMLElement | null>): number {
  const [size, setSize] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      const next = Math.floor(Math.min(width, height));
      setSize(next >= MIN_DISC_PX ? next : next > 0 ? next : 0);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  return size;
}

function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Start boundary of a day slot (same angle as the radial tick for that day). */
function daySlotStartAngle(day: number, totalDays: number, offsetDeg = 0): number {
  return normalizeAngle(((day - 1) / totalDays) * 360 + offsetDeg);
}

/** End boundary of a day slot; may exceed 360 when building arc paths. */
function daySlotEndAngle(day: number, totalDays: number, offsetDeg = 0): number {
  return (day / totalDays) * 360 + offsetDeg;
}

/** Center of a day slot — where the selection needle points. */
function daySlotCenterAngle(day: number, totalDays: number, offsetDeg = 0): number {
  return normalizeAngle(((day - 0.5) / totalDays) * 360 + offsetDeg);
}

function dayToAngle(day: number, totalDays: number, offsetDeg = 0): number {
  return daySlotCenterAngle(day, totalDays, offsetDeg);
}

function angleToDay(angle: number, totalDays: number, offsetDeg = 0): number {
  const unrotated = normalizeAngle(angle - offsetDeg);
  // Inverse of daySlotCenterAngle: center of day N sits at (N - 0.5) / totalDays turns.
  const day = Math.round((unrotated / 360) * totalDays + 0.5);
  return Math.max(1, Math.min(totalDays, day));
}

function dayRangeAngles(
  startDay: number,
  endDay: number,
  totalDays: number,
  offsetDeg = 0
): { start: number; end: number } {
  const start = daySlotStartAngle(startDay, totalDays, offsetDeg);
  let end = daySlotEndAngle(endDay, totalDays, offsetDeg);
  if (end <= start) end += 360;
  return { start, end };
}

function clientToAngle(svg: SVGSVGElement, clientX: number, clientY: number): number {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return 0;
  const local = pt.matrixTransform(ctm.inverse());
  const dx = local.x - CX;
  const dy = local.y - CY;
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  if (deg < 0) deg += 360;
  return deg;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function ringSectorPath(
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number
): string {
  let span = endAngle - startAngle;
  if (span <= 0) span += 360;
  const end = startAngle + span;
  const largeArc = span > 180 ? 1 : 0;
  const oStart = polar(CX, CY, outerR, startAngle);
  const oEnd = polar(CX, CY, outerR, end);
  const iStart = polar(CX, CY, innerR, end);
  const iEnd = polar(CX, CY, innerR, startAngle);
  return [
    `M ${oStart.x} ${oStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${oEnd.x} ${oEnd.y}`,
    `L ${iStart.x} ${iStart.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${iEnd.x} ${iEnd.y}`,
    "Z",
  ].join(" ");
}

/** Circular arc for curved ring labels (`textPath`). */
function ringLabelArcPath(cx: number, cy: number, r: number, centerAngle: number, spanDeg: number): string {
  const half = spanDeg / 2;
  const startPt = polar(cx, cy, r, centerAngle - half);
  const endPt = polar(cx, cy, r, centerAngle + half);
  const largeArc = spanDeg > 180 ? 1 : 0;
  return `M ${startPt.x} ${startPt.y} A ${r} ${r} 0 ${largeArc} 1 ${endPt.x} ${endPt.y}`;
}

function ringLabelSpanDeg(label: string): number {
  const len = label.trim().length;
  return Math.min(150, Math.max(52, 28 + len * 5.5));
}

const RING_LABEL_STROKE = 2;

/** Radius for the label arc so glyph ink centers on the coloured ring band. */
function ringLabelTextPathRadius(inner: number, outer: number, fontSize: number): number {
  const midR = (inner + outer) / 2;
  // Baseline sits on outer side of path at north; shift path inward (~40% em) to center ink in band.
  // (0.34em too high, 0.48em too low — split the difference.)
  const inward = fontSize * 0.405 + RING_LABEL_STROKE * 0.25;
  return midR - inward;
}

function dayAngles(
  startDay: number,
  endDay: number,
  totalDays: number,
  offsetDeg = 0
): { start: number; end: number } {
  return dayRangeAngles(startDay, endDay, totalDays, offsetDeg);
}

function computeRingLayout(ringCount: number): {
  ringWidth: number;
  ringRadii: (index: number) => { inner: number; outer: number };
  hubR: number;
  dayLineInnerR: number;
} {
  const count = Math.max(1, ringCount);
  const ringWidth = Math.min(
    Math.round(34 * DISC_SCALE),
    Math.floor((OUTER_R - INNER_RESERVE - RING_GAP * (count - 1)) / count)
  );
  const ringRadii = (index: number) => {
    const outer = OUTER_R - index * (ringWidth + RING_GAP);
    return { inner: outer - ringWidth, outer };
  };
  const innermost = ringRadii(count - 1).inner;
  const hubR = innermost - Math.round(10 * DISC_SCALE);
  return { ringWidth, ringRadii, hubR, dayLineInnerR: hubR };
}

function ringSectorClipPath(
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number,
  size: number
): string {
  let span = endAngle - startAngle;
  if (span <= 0) span += 360;
  const steps = Math.max(3, Math.ceil(span / 12));
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (span * i) / steps;
    const p = polar(CX, CY, innerR, angle);
    points.push(`${(p.x / size) * 100}% ${(p.y / size) * 100}%`);
  }
  for (let i = steps; i >= 0; i--) {
    const angle = startAngle + (span * i) / steps;
    const p = polar(CX, CY, outerR, angle);
    points.push(`${(p.x / size) * 100}% ${(p.y / size) * 100}%`);
  }
  return `polygon(${points.join(", ")})`;
}

type DiscSegment = {
  id: string;
  span: YearDiscSpan;
  ringIndex: number;
  path: string;
  clipPath: string;
  fill: string;
  opacity: number;
};

type DaySpanGroup = {
  key: string;
  span: YearDiscSpan;
  ringIndices: number[];
};

function spanGroupKey(span: YearDiscSpan): string {
  return span.calendarItem?.id ?? span.id;
}

function isoWeekNumber(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function formatWeekNumber(date: Date, locale: string): string {
  const week = isoWeekNumber(date);
  if (locale.startsWith("da")) return `Uge ${week}`;
  if (locale.startsWith("de")) return `KW ${week}`;
  return `Week ${week}`;
}

function monthMarkersForTimeline(timeline: YearDiscTimeline, locale: string, offsetDeg: number) {
  const { totalDays, startDate, endDate } = timeline;
  const markers: Array<{
    key: string;
    angle: number;
    tickOuter: { x: number; y: number };
    tickInner: { x: number; y: number };
    labelPos: { x: number; y: number };
    label: string;
  }> = [];

  if (timeline.mode === "calendar_year" && timeline.year !== undefined) {
    return Array.from({ length: 12 }, (_, month) => {
      const day = timeline.discDayFromDate(new Date(timeline.year!, month, 1)) ?? 1;
      const angle = daySlotStartAngle(day, totalDays, offsetDeg);
      const tickOuter = polar(CX, CY, OUTER_R + 6, angle);
      const tickInner = polar(CX, CY, OUTER_R - 2, angle);
      const labelPos = polar(CX, CY, LABEL_R, angle + 15 / totalDays);
      const label = new Date(timeline.year!, month, 1).toLocaleDateString(locale, { month: "short" });
      return { key: `m-${month}`, angle, tickOuter, tickInner, labelPos, label };
    });
  }

  let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  while (cursor <= endMonth) {
    if (cursor >= startDate) {
      const discDay = timeline.discDayFromDate(cursor);
      if (discDay !== null) {
        const angle = daySlotStartAngle(discDay, totalDays, offsetDeg);
        markers.push({
          key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
          angle,
          tickOuter: polar(CX, CY, OUTER_R + 6, angle),
          tickInner: polar(CX, CY, OUTER_R - 2, angle),
          labelPos: polar(CX, CY, LABEL_R, angle + 15 / totalDays),
          label: cursor.toLocaleDateString(locale, { month: "short" }),
        });
      }
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return markers;
}

function dayKeyFromField(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.includes("T")) {
    const d = new Date(t);
    if (!Number.isFinite(d.getTime())) return t.slice(0, 10);
    return toDateStr(d);
  }
  return t.slice(0, 10);
}

function spanOnDay(span: YearDiscSpan, date: Date): boolean {
  if (span.calendarItem) {
    return itemsForDay([span.calendarItem], date).length > 0;
  }
  const dateStr = toDateStr(date);
  const startKey = dayKeyFromField(span.startDate);
  const endKey = span.endDate ? dayKeyFromField(span.endDate) : startKey;
  if (!startKey) return false;
  return dateStr >= startKey && dateStr <= endKey;
}

function parseEventCalendarId(id: string): { eventId: string; showId?: string; jobId?: string } {
  const jobM = /^(.+):show:([^:]+):job:([^:]+)$/.exec(id);
  if (jobM?.[1] && jobM[2] && jobM[3]) return { eventId: jobM[1], showId: jobM[2], jobId: jobM[3] };
  const showM = /^(.+):show:([^:]+)$/.exec(id);
  if (showM?.[1] && showM[2]) return { eventId: showM[1], showId: showM[2] };
  return { eventId: id };
}

function calendarItemAssignedPeopleLabel(item: CalendarItem): string | null {
  if (item.kind === "booking") {
    const people = (item.raw as InternalBookingDetail).people;
    if (!people?.length) return null;
    return people.map((p) => p.person.name).join(", ");
  }
  if (item.kind === "event" || item.kind === "job") {
    const ev = item.raw as EventDetail;
    const { showId, jobId } = parseEventCalendarId(item.id);
    if (jobId) {
      const show = showId ? ev.shows?.find((s) => s.id === showId) : undefined;
      const job = show?.jobs?.find((j) => j.id === jobId);
      if (!job) return null;
      if (job.people?.length) return job.people.map((p) => p.name).join(", ");
      return job.person?.name ?? null;
    }
    if (!ev.people?.length) return null;
    return ev.people.map((p) => p.person.name).join(", ");
  }
  return null;
}

function spanInlineMetaLines(span: YearDiscSpan): string[] {
  if (span.calendarItem) {
    const people = calendarItemAssignedPeopleLabel(span.calendarItem);
    return people ? [people] : [];
  }
  const lines: string[] = [];
  if (span.projectName) lines.push(span.projectName);
  if (span.note) lines.push(span.note);
  return lines;
}

function spanTimeLabel(span: YearDiscSpan, hour12: boolean): string {
  if (span.calendarItem) return calendarItemTimeRangeLabel(span.calendarItem, hour12);
  const start = new Date(span.startDate);
  const end = new Date(span.endDate ?? span.startDate);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const timeFmt: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12 };
  if (sameDay) {
    return `${start.toLocaleTimeString(undefined, timeFmt)}–${end.toLocaleTimeString(undefined, timeFmt)}`;
  }
  return start.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12 });
}

export function YearDiscView({
  calendarYear,
  config,
  onConfigChange,
  sources,
  locale,
  onItemClick,
}: {
  calendarYear: number;
  config: YearDiscConfig;
  onConfigChange: (config: YearDiscConfig) => void;
  sources: YearDiscResolveContext;
  locale: string;
  onItemClick: (item: CalendarItem) => void;
}) {
  const { effective } = usePreferences();
  const hour12 = effective?.timeFormat === "12h";
  const svgRef = useRef<SVGSVGElement>(null);
  const discHostRef = useRef<HTMLDivElement>(null);
  const discPixelSize = useSquareFitSize(discHostRef);
  const [ringSettingsOpen, setRingSettingsOpen] = useState(false);
  const [focusedRingId, setFocusedRingId] = useState<string | null>(null);
  const timeline = useMemo(
    () => buildYearDiscTimeline(config.range ?? DEFAULT_YEAR_DISC_RANGE, calendarYear),
    [config.range, calendarYear]
  );
  const totalDays = timeline.totalDays;
  const angleOffset = yearDiscAngleOffsetDeg(timeline.northDiscDay, totalDays);
  const [selectedDay, setSelectedDay] = useState(() => defaultDiscDay(timeline));
  const rings = config.rings;
  const layout = useMemo(() => computeRingLayout(rings.length), [rings.length]);

  useEffect(() => {
    setSelectedDay(defaultDiscDay(timeline));
  }, [timeline]);

  const selectedDate = useMemo(
    () => timeline.dateFromDiscDay(selectedDay),
    [selectedDay, timeline]
  );
  const selectedAngle = dayToAngle(selectedDay, totalDays, angleOffset);
  const needleTip = polar(CX, CY, NEEDLE_OUTER_R, selectedAngle);

  const updateDayFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      setSelectedDay(angleToDay(clientToAngle(svg, clientX, clientY), totalDays, angleOffset));
    },
    [angleOffset, totalDays]
  );

  const onNeedlePointerDown = (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateDayFromPointer(event.clientX, event.clientY);
  };

  const onNeedlePointerMove = (event: React.PointerEvent) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    updateDayFromPointer(event.clientX, event.clientY);
  };

  const onDiscPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.target !== event.currentTarget) return;
    updateDayFromPointer(event.clientX, event.clientY);
  };

  const segments = useMemo(() => {
    const out: DiscSegment[] = [];
    rings.forEach((ring, ringIndex) => {
      const fill = yearDiscRingColor(ring, ringIndex);
      const { inner, outer } = layout.ringRadii(ringIndex);
      const spans = resolveYearDiscRingSpans(ring, sources);
      for (const span of spans) {
        const clip = timeline.clipSpan(span);
        if (!clip) continue;
        const angles = dayAngles(clip.startDay, clip.endDay, totalDays, angleOffset);
        out.push({
          id: `${ring.id}:${span.id}`,
          span,
          ringIndex,
          path: ringSectorPath(inner, outer, angles.start, angles.end),
          clipPath: ringSectorClipPath(inner, outer, angles.start, angles.end, SIZE),
          fill,
          opacity: span.opacity ?? 1,
        });
      }
    });
    return out;
  }, [angleOffset, rings, sources, layout, totalDays, timeline]);

  const dayLinesPath = useMemo(() => {
    const outerR = OUTER_R + 6;
    const parts: string[] = [];
    for (let day = 1; day <= totalDays; day++) {
      const angle = daySlotStartAngle(day, totalDays, angleOffset);
      const inner = polar(CX, CY, layout.dayLineInnerR, angle);
      const outer = polar(CX, CY, outerR, angle);
      parts.push(`M ${inner.x} ${inner.y} L ${outer.x} ${outer.y}`);
    }
    return parts.join(" ");
  }, [angleOffset, layout.dayLineInnerR, totalDays]);

  const monthMarkers = useMemo(
    () => monthMarkersForTimeline(timeline, locale, angleOffset),
    [angleOffset, locale, timeline]
  );

  const daySpanGroups = useMemo((): DaySpanGroup[] => {
    const groups = new Map<string, DaySpanGroup>();

    rings.forEach((ring, ringIndex) => {
      for (const span of resolveYearDiscRingSpans(ring, sources)) {
        if (!spanOnDay(span, selectedDate)) continue;
        const key = spanGroupKey(span);
        const existing = groups.get(key);
        if (existing) {
          if (!existing.ringIndices.includes(ringIndex)) {
            existing.ringIndices.push(ringIndex);
          }
        } else {
          groups.set(key, { key, span, ringIndices: [ringIndex] });
        }
      }
    });

    return Array.from(groups.values()).sort(
      (a, b) => new Date(a.span.startDate).getTime() - new Date(b.span.startDate).getTime(),
    );
  }, [rings, sources, selectedDate]);

  const selectedDayLabel = selectedDate.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  function handleSegmentClick(segment: DiscSegment) {
    const clip = timeline.clipSpan(segment.span);
    if (clip) setSelectedDay(clip.startDay);
    if (segment.span.calendarItem) onItemClick(segment.span.calendarItem);
  }

  function openRingSettings(ringId: string) {
    setFocusedRingId(ringId);
    setRingSettingsOpen(true);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden xl:flex-row xl:items-stretch">
      <div
        ref={discHostRef}
        className="flex min-h-0 min-w-0 flex-[1.15] items-center justify-center self-stretch xl:flex-1"
      >
        <div
          className="relative shrink-0"
          style={
            discPixelSize > 0
              ? { width: discPixelSize, height: discPixelSize }
              : { width: "100%", maxWidth: "100%", aspectRatio: "1 / 1" }
          }
        >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-full w-full touch-none select-none"
          role="img"
          aria-label={`Year disc ${timeline.rangeLabel}`}
          onPointerDown={onDiscPointerDown}
        >
          <circle cx={CX} cy={CY} r={OUTER_R + 14} fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.08)" />
          <path
            d={dayLinesPath}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={0.5}
            pointerEvents="none"
          />
          {rings.map((ring, index) => {
            const { inner, outer } = layout.ringRadii(index);
            const color = yearDiscRingColor(ring, index);
            return (
              <circle
                key={ring.id}
                cx={CX}
                cy={CY}
                r={(inner + outer) / 2}
                fill="none"
                stroke={color}
                strokeOpacity={0.55}
                strokeWidth={layout.ringWidth}
                className="cursor-pointer"
                onClick={(event) => {
                  event.stopPropagation();
                  openRingSettings(ring.id);
                }}
              >
                <title>{yearDiscRingLabel(ring, sources)} — click to edit ring</title>
              </circle>
            );
          })}
          {monthMarkers.map((marker) => (
            <g key={marker.key} pointerEvents="none">
              <line
                x1={marker.tickInner.x}
                y1={marker.tickInner.y}
                x2={marker.tickOuter.x}
                y2={marker.tickOuter.y}
                stroke="rgba(255,255,255,0.22)"
                strokeWidth={1.25}
              />
              <text
                x={marker.labelPos.x}
                y={marker.labelPos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-white/45 text-[11px] font-medium uppercase tracking-wide"
              >
                {marker.label}
              </text>
            </g>
          ))}
          {segments.map((segment) => (
            <path
              key={segment.id}
              d={segment.path}
              fill={segment.fill}
              opacity={segment.opacity}
              className="pointer-events-none"
            />
          ))}
          {rings.map((ring, index) => {
            const { inner, outer } = layout.ringRadii(index);
            const label = yearDiscRingLabel(ring, sources);
            const centerAngle = 0;
            const spanDeg = ringLabelSpanDeg(label);
            const textPathId = `ring-label-${ring.id}`;
            const fontSize = Math.min(14, Math.max(10, layout.ringWidth * 0.36));
            const labelPathR = ringLabelTextPathRadius(inner, outer, fontSize);

            return (
              <g
                key={`ring-label-${ring.id}`}
                className="cursor-pointer"
                onClick={(event) => {
                  event.stopPropagation();
                  openRingSettings(ring.id);
                }}
              >
                <defs>
                  <path id={textPathId} d={ringLabelArcPath(CX, CY, labelPathR, centerAngle, spanDeg * 0.92)} />
                </defs>
                <text
                  fill="rgba(255,255,255,0.92)"
                  stroke="rgba(10,10,15,0.75)"
                  strokeWidth={RING_LABEL_STROKE}
                  paintOrder="stroke fill"
                  fontSize={fontSize}
                  fontWeight={600}
                  letterSpacing="0.06em"
                  style={{ textTransform: "uppercase" }}
                >
                  <textPath href={`#${textPathId}`} startOffset="50%" textAnchor="middle">
                    {label}
                  </textPath>
                </text>
                <title>{label} — click to edit ring</title>
              </g>
            );
          })}
          <g className="pointer-events-none">
            <line
              x1={CX}
              y1={CY}
              x2={needleTip.x}
              y2={needleTip.y}
              stroke="rgba(250, 204, 21, 0.95)"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <circle
              cx={needleTip.x}
              cy={needleTip.y}
              r={9}
              fill="rgba(250, 204, 21, 0.95)"
              stroke="#0a0a0f"
              strokeWidth={2}
            />
          </g>
          <circle cx={CX} cy={CY} r={layout.hubR} fill="#0a0a0f" pointerEvents="none" />
          <text
            x={CX}
            y={CY - 26}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-white/55 text-[11px] font-medium uppercase tracking-wide"
            pointerEvents="none"
          >
            {selectedDate.toLocaleDateString(locale, { weekday: "long" })}
          </text>
          <text
            x={CX}
            y={CY - 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-white text-2xl font-semibold"
            pointerEvents="none"
          >
            {selectedDate.toLocaleDateString(locale, { day: "numeric", month: "short" })}
          </text>
          <text
            x={CX}
            y={CY + 18}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-white/70 text-sm font-medium tracking-wide"
            pointerEvents="none"
          >
            {selectedDate.toLocaleDateString(locale, { year: "numeric" })}
          </text>
          <text
            x={CX}
            y={CY + 34}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-white/45 text-[11px] font-medium tracking-wide"
            pointerEvents="none"
          >
            {formatWeekNumber(selectedDate, locale)}
          </text>
        </svg>
        <div className="pointer-events-none absolute inset-0 z-10">
          {segments.map((segment) => (
            <button
              key={`hit-${segment.id}`}
              type="button"
              aria-label={segment.span.title}
              className="pointer-events-auto absolute inset-0 cursor-pointer border-0 bg-transparent p-0"
              style={{ clipPath: segment.clipPath, WebkitClipPath: segment.clipPath }}
              onClick={() => handleSegmentClick(segment)}
            />
          ))}
        </div>
        <div
          className="pointer-events-auto absolute z-20 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none active:cursor-grabbing"
          style={{
            left: `${(needleTip.x / SIZE) * 100}%`,
            top: `${(needleTip.y / SIZE) * 100}%`,
            width: `${(36 / SIZE) * 100}%`,
            height: `${(36 / SIZE) * 100}%`,
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
            onNeedlePointerDown(event);
          }}
          onPointerMove={onNeedlePointerMove}
        />
        </div>
      </div>

      <div className="touch-scroll-y mx-auto flex min-h-0 w-full max-w-sm flex-1 basis-0 flex-col gap-3 overflow-y-auto overscroll-y-contain pr-0.5 xl:mx-0 xl:w-full xl:max-w-sm xl:shrink-0 xl:h-full xl:max-h-full">
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Selected day</p>
          <p className="mt-1 text-sm font-medium text-white">{selectedDayLabel}</p>
          <p className="mt-1 text-[11px] text-white/35">Drag the yellow handle around the disc to change day.</p>
          <ul className="mt-3 space-y-2">
            {daySpanGroups.length === 0 ? (
              <li className="text-sm text-white/40">Nothing on this day.</li>
            ) : (
              daySpanGroups.map(({ key, span, ringIndices }) => {
                const time = spanTimeLabel(span, hour12);
                const metaLines = spanInlineMetaLines(span);
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => span.calendarItem && onItemClick(span.calendarItem)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-2 text-left hover:bg-white/[0.07]",
                        span.calendarItem ? "cursor-pointer" : "cursor-default opacity-80",
                      )}
                    >
                      <span className="mt-1 flex shrink-0 flex-wrap gap-0.5">
                        {ringIndices.map((ringIndex) => (
                          <span
                            key={ringIndex}
                            className="h-2.5 w-2.5 rounded-full ring-1 ring-white/10"
                            style={{ backgroundColor: yearDiscRingColor(rings[ringIndex]!, ringIndex) }}
                          />
                        ))}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-white">{span.title}</span>
                        {time ? <span className="block text-[11px] text-white/45">{time}</span> : null}
                        {metaLines.map((line, index) => (
                          <span key={index} className="block truncate text-[11px] text-white/40">
                            {line}
                          </span>
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>

      <YearDiscRingSettingsDialog
        open={ringSettingsOpen}
        onOpenChange={(nextOpen) => {
          setRingSettingsOpen(nextOpen);
          if (!nextOpen) setFocusedRingId(null);
        }}
        focusedRingId={focusedRingId}
        config={config}
        onChange={onConfigChange}
        events={sources.events}
        tours={sources.tours}
        venues={sources.venues}
        people={sources.people}
      />
    </div>
  );
}
