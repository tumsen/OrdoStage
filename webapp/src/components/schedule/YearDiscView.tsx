import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  calendarItemTimeRangeLabel,
  itemsForDay,
  toDateStr,
  type CalendarItem,
} from "@/components/schedule/scheduleUtils";
import { YearDiscRingEditor } from "@/components/schedule/YearDiscRingEditor";
import {
  buildYearDiscTimeline,
  defaultDiscDay,
  DEFAULT_YEAR_DISC_RANGE,
  resolveYearDiscRingSpans,
  yearDiscRingColor,
  yearDiscRingLabel,
  type YearDiscConfig,
  type YearDiscResolveContext,
  type YearDiscSpan,
  type YearDiscTimeline,
} from "@/components/schedule/yearDiscConfig";

const DISC_SCALE = 1.2;
const SIZE = Math.round(720 * DISC_SCALE);
const CX = SIZE / 2;
const CY = SIZE / 2;
const OUTER_R = Math.round(318 * DISC_SCALE);
const RING_GAP = Math.round(3 * DISC_SCALE);
const LABEL_R = OUTER_R + Math.round(22 * DISC_SCALE);
const NEEDLE_OUTER_R = OUTER_R + Math.round(12 * DISC_SCALE);
const INNER_RESERVE = Math.round(90 * DISC_SCALE);

function dayToAngle(day: number, totalDays: number): number {
  return ((day - 0.5) / totalDays) * 360;
}

function angleToDay(angle: number, totalDays: number): number {
  const normalized = ((angle % 360) + 360) % 360;
  const day = Math.floor((normalized / 360) * totalDays) + 1;
  return Math.max(1, Math.min(totalDays, day));
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
  const span = Math.max(endAngle - startAngle, 0.35);
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

function dayAngles(startDay: number, endDay: number, totalDays: number): { start: number; end: number } {
  const minSpanDays = 1.2;
  const spanDays = Math.max(endDay - startDay + 1, minSpanDays);
  const start = ((startDay - 1) / totalDays) * 360;
  const end = ((startDay - 1 + spanDays) / totalDays) * 360;
  return { start, end };
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

type DiscSegment = {
  id: string;
  span: YearDiscSpan;
  ringIndex: number;
  path: string;
  fill: string;
  opacity: number;
};

function monthMarkersForTimeline(timeline: YearDiscTimeline, locale: string) {
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
      const angle = ((day - 1) / totalDays) * 360;
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
        const angle = ((discDay - 1) / totalDays) * 360;
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

function spanTimeLabel(span: YearDiscSpan): string {
  if (span.calendarItem) return calendarItemTimeRangeLabel(span.calendarItem);
  const start = new Date(span.startDate);
  const end = new Date(span.endDate ?? span.startDate);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const timeFmt: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  if (sameDay) {
    return `${start.toLocaleTimeString(undefined, timeFmt)}–${end.toLocaleTimeString(undefined, timeFmt)}`;
  }
  return start.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const timeline = useMemo(
    () => buildYearDiscTimeline(config.range ?? DEFAULT_YEAR_DISC_RANGE, calendarYear),
    [config.range, calendarYear]
  );
  const totalDays = timeline.totalDays;
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
  const selectedAngle = dayToAngle(selectedDay, totalDays);
  const needleTip = polar(CX, CY, NEEDLE_OUTER_R, selectedAngle);

  const updateDayFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      setSelectedDay(angleToDay(clientToAngle(svg, clientX, clientY), totalDays));
    },
    [totalDays]
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
        const angles = dayAngles(clip.startDay, clip.endDay, totalDays);
        out.push({
          id: `${ring.id}:${span.id}`,
          span,
          ringIndex,
          path: ringSectorPath(inner, outer, angles.start, angles.end),
          fill,
          opacity: span.opacity ?? 1,
        });
      }
    });
    return out;
  }, [rings, sources, layout, totalDays, timeline]);

  const dayLinesPath = useMemo(() => {
    const outerR = OUTER_R + 6;
    const parts: string[] = [];
    for (let day = 1; day <= totalDays; day++) {
      const angle = ((day - 1) / totalDays) * 360;
      const inner = polar(CX, CY, layout.dayLineInnerR, angle);
      const outer = polar(CX, CY, outerR, angle);
      parts.push(`M ${inner.x} ${inner.y} L ${outer.x} ${outer.y}`);
    }
    return parts.join(" ");
  }, [layout.dayLineInnerR, totalDays]);

  const monthMarkers = useMemo(
    () => monthMarkersForTimeline(timeline, locale),
    [locale, timeline]
  );

  const allSpans = useMemo(() => {
    return rings.flatMap((ring) => resolveYearDiscRingSpans(ring, sources));
  }, [rings, sources]);

  const daySpans = useMemo(() => {
    const seen = new Set<string>();
    return allSpans
      .filter((span) => spanOnDay(span, selectedDate))
      .filter((span) => {
        if (seen.has(span.id)) return false;
        seen.add(span.id);
        return true;
      })
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [allSpans, selectedDate]);

  const selectedDayLabel = selectedDate.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const hovered = segments.find((segment) => segment.id === hoveredId)?.span ?? null;

  function handleSegmentClick(segment: DiscSegment) {
    const clip = timeline.clipSpan(segment.span);
    if (clip) setSelectedDay(clip.startDay);
    if (segment.span.calendarItem) onItemClick(segment.span.calendarItem);
  }

  function ringColorForSpan(span: YearDiscSpan): string {
    const ringIndex = rings.findIndex((ring) =>
      resolveYearDiscRingSpans(ring, sources).some((s) => s.id === span.id)
    );
    if (ringIndex < 0) return yearDiscRingColor(rings[0]!, 0);
    return yearDiscRingColor(rings[ringIndex]!, ringIndex);
  }

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-center">
      <div className="relative mx-auto w-full max-w-[min(100%,50.4rem)]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-auto w-full touch-none select-none"
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
                pointerEvents="none"
              />
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
              opacity={hoveredId && hoveredId !== segment.id ? segment.opacity * 0.45 : segment.opacity}
              className="cursor-pointer transition-opacity"
              onMouseEnter={() => setHoveredId(segment.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => handleSegmentClick(segment)}
            >
              <title>{segment.span.title}</title>
            </path>
          ))}
          <line
            x1={CX}
            y1={CY}
            x2={needleTip.x}
            y2={needleTip.y}
            stroke="rgba(250, 204, 21, 0.95)"
            strokeWidth={2.5}
            strokeLinecap="round"
            pointerEvents="none"
          />
          <g
            className="cursor-grab active:cursor-grabbing"
            onPointerDown={onNeedlePointerDown}
            onPointerMove={onNeedlePointerMove}
          >
            <circle cx={needleTip.x} cy={needleTip.y} r={18} fill="transparent" />
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
            y={CY - 8}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-white text-3xl font-semibold"
            pointerEvents="none"
          >
            {selectedDate.toLocaleDateString(locale, { day: "numeric", month: "short" })}
          </text>
          <text
            x={CX}
            y={CY + 16}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-white/40 text-[10px] uppercase tracking-[0.12em]"
            pointerEvents="none"
          >
            {timeline.mode === "calendar_year"
              ? timeline.rangeLabel
              : timeline.mode === "today"
                ? "Today"
                : "365 days"}
          </text>
        </svg>
        {hovered ? (
          <div className="pointer-events-none absolute bottom-3 left-1/2 max-w-[90%] -translate-x-1/2 rounded-lg border border-white/10 bg-[#16161f]/95 px-3 py-2 text-center shadow-lg">
            <p className="truncate text-sm font-medium text-white">{hovered.title}</p>
          </div>
        ) : null}
      </div>

      <div className="mx-auto flex w-full max-w-sm shrink-0 flex-col gap-3 xl:mx-0">
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Selected day</p>
          <p className="mt-1 text-sm font-medium text-white">{selectedDayLabel}</p>
          <p className="mt-1 text-[11px] text-white/35">Drag the yellow handle around the disc to change day.</p>
          <ul className="mt-3 max-h-[min(40vh,20rem)] space-y-2 overflow-y-auto pr-0.5">
            {daySpans.length === 0 ? (
              <li className="text-sm text-white/40">Nothing on this day.</li>
            ) : (
              daySpans.map((span) => {
                const time = spanTimeLabel(span);
                return (
                  <li key={span.id}>
                    <button
                      type="button"
                      onClick={() => span.calendarItem && onItemClick(span.calendarItem)}
                      disabled={!span.calendarItem}
                      className="flex w-full items-start gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-2 text-left hover:bg-white/[0.07] disabled:cursor-default disabled:opacity-80"
                    >
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: ringColorForSpan(span) }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-white">{span.title}</span>
                        {time ? <span className="block text-[11px] text-white/45">{time}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <YearDiscRingEditor
          config={config}
          onChange={onConfigChange}
          events={sources.events}
          tours={sources.tours}
          venues={sources.venues}
          people={sources.people}
        />

        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Ring legend</p>
          <ul className="mt-2 space-y-2">
            {rings.map((ring, index) => (
              <li key={ring.id} className="flex items-center gap-2 text-sm text-white/75">
                <span
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: yearDiscRingColor(ring, index) }}
                />
                {yearDiscRingLabel(ring, sources)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
