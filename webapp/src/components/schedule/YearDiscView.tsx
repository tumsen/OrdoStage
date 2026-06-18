import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  calendarItemTimeRangeLabel,
  getItemTimeRange,
  itemsForDay,
  scheduleVisibilityFilterKey,
  type CalendarItem,
} from "@/components/schedule/scheduleUtils";

type RingId = "event" | "tour" | "rehearsal" | "venue_booking" | "other";

const RINGS: Array<{ id: RingId; label: string; fill: string }> = [
  { id: "event", label: "Events", fill: "rgba(79, 70, 229, 0.92)" },
  { id: "tour", label: "Tours", fill: "rgba(162, 28, 175, 0.92)" },
  { id: "rehearsal", label: "Rehearsals", fill: "rgba(217, 119, 6, 0.92)" },
  { id: "venue_booking", label: "Venue", fill: "rgba(225, 29, 72, 0.92)" },
  { id: "other", label: "Other", fill: "rgba(37, 99, 235, 0.88)" },
];

const SIZE = 720;
const CX = SIZE / 2;
const CY = SIZE / 2;
const OUTER_R = 318;
const RING_WIDTH = 34;
const RING_GAP = 3;
const LABEL_R = OUTER_R + 22;
const NEEDLE_OUTER_R = OUTER_R + 12;

function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

function dayOfYear(date: Date): number {
  const jan1 = new Date(date.getFullYear(), 0, 1);
  return Math.floor((date.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000)) + 1;
}

function dateFromDayOfYear(year: number, day: number): Date {
  return new Date(year, 0, day);
}

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

function ringForItem(item: CalendarItem): RingId {
  const key = scheduleVisibilityFilterKey(item);
  if (key === "event") return "event";
  if (key === "tour") return "tour";
  if (key === "rehearsal") return "rehearsal";
  if (key === "venue_booking") return "venue_booking";
  return "other";
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

function itemSpanInYear(
  item: CalendarItem,
  year: number
): { startDay: number; endDay: number } | null {
  if (item.kind === "summary") return null;
  const { start, end } = getItemTimeRange(item);
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
  if (end < yearStart || start > yearEnd) return null;
  const clippedStart = start < yearStart ? yearStart : start;
  const clippedEnd = end > yearEnd ? yearEnd : end;
  return { startDay: dayOfYear(clippedStart), endDay: dayOfYear(clippedEnd) };
}

function ringRadii(ringIndex: number): { inner: number; outer: number } {
  const outer = OUTER_R - ringIndex * (RING_WIDTH + RING_GAP);
  return { inner: outer - RING_WIDTH, outer };
}

const HUB_R = ringRadii(RINGS.length - 1).inner - 10;
const DAY_LINE_INNER_R = HUB_R;

type DiscSegment = {
  id: string;
  item: CalendarItem;
  ringId: RingId;
  path: string;
  fill: string;
  opacity: number;
};

function defaultDayForYear(year: number, totalDays: number): number {
  const now = new Date();
  if (now.getFullYear() === year) return dayOfYear(now);
  return Math.min(totalDays, 1);
}

export function YearDiscView({
  year,
  items,
  locale,
  onItemClick,
}: {
  year: number;
  items: CalendarItem[];
  locale: string;
  onItemClick: (item: CalendarItem) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const totalDays = daysInYear(year);
  const [selectedDay, setSelectedDay] = useState(() => defaultDayForYear(year, totalDays));

  useEffect(() => {
    setSelectedDay(defaultDayForYear(year, daysInYear(year)));
  }, [year]);

  const selectedDate = useMemo(() => dateFromDayOfYear(year, selectedDay), [selectedDay, year]);
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
    const ringIndex = new Map(RINGS.map((ring, index) => [ring.id, index]));
    const fillByRing = new Map(RINGS.map((ring) => [ring.id, ring.fill]));
    const out: DiscSegment[] = [];

    for (const item of items) {
      const span = itemSpanInYear(item, year);
      if (!span) continue;
      const ringId = ringForItem(item);
      const index = ringIndex.get(ringId) ?? 0;
      const { inner, outer } = ringRadii(index);
      const angles = dayAngles(span.startDay, span.endDay, totalDays);
      out.push({
        id: item.id,
        item,
        ringId,
        path: ringSectorPath(inner, outer, angles.start, angles.end),
        fill: fillByRing.get(ringId) ?? RINGS[0].fill,
        opacity: item.disabled ? 0.35 : 1,
      });
    }

    return out;
  }, [items, totalDays, year]);

  const dayLinesPath = useMemo(() => {
    const outerR = OUTER_R + 6;
    const parts: string[] = [];
    for (let day = 1; day <= totalDays; day++) {
      const angle = ((day - 1) / totalDays) * 360;
      const inner = polar(CX, CY, DAY_LINE_INNER_R, angle);
      const outer = polar(CX, CY, outerR, angle);
      parts.push(`M ${inner.x} ${inner.y} L ${outer.x} ${outer.y}`);
    }
    return parts.join(" ");
  }, [totalDays]);

  const monthMarkers = useMemo(() => {
    return Array.from({ length: 12 }, (_, month) => {
      const day = dayOfYear(new Date(year, month, 1));
      const angle = ((day - 1) / totalDays) * 360;
      const tickOuter = polar(CX, CY, OUTER_R + 6, angle);
      const tickInner = polar(CX, CY, OUTER_R - 2, angle);
      const labelPos = polar(CX, CY, LABEL_R, angle + 15 / totalDays);
      const label = new Date(year, month, 1).toLocaleDateString(locale, { month: "short" });
      return { month, angle, tickOuter, tickInner, labelPos, label };
    });
  }, [locale, totalDays, year]);

  const dayItems = useMemo(() => {
    return itemsForDay(items, selectedDate).sort((a, b) => {
      const aTime = new Date(a.startDate).getTime();
      const bTime = new Date(b.startDate).getTime();
      return aTime - bTime;
    });
  }, [items, selectedDate]);

  const selectedDayLabel = selectedDate.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const hovered = segments.find((segment) => segment.id === hoveredId)?.item ?? null;

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-center">
      <div className="relative mx-auto w-full max-w-[min(100%,42rem)]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-auto w-full touch-none select-none"
          role="img"
          aria-label={`Year disc ${year}`}
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
          {RINGS.map((ring, index) => {
            const { inner, outer } = ringRadii(index);
            return (
              <circle
                key={ring.id}
                cx={CX}
                cy={CY}
                r={(inner + outer) / 2}
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={RING_WIDTH}
                pointerEvents="none"
              />
            );
          })}
          {monthMarkers.map((marker) => (
            <g key={marker.month} pointerEvents="none">
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
              onClick={() => {
                const span = itemSpanInYear(segment.item, year);
                if (span) setSelectedDay(span.startDay);
                onItemClick(segment.item);
              }}
            >
              <title>{segment.item.title}</title>
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
          <circle cx={CX} cy={CY} r={HUB_R} fill="#0a0a0f" pointerEvents="none" />
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
            className="fill-white/40 text-[10px] uppercase tracking-[0.15em]"
            pointerEvents="none"
          >
            {year}
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
          <ul className="mt-3 max-h-[min(50vh,24rem)] space-y-2 overflow-y-auto pr-0.5">
            {dayItems.length === 0 ? (
              <li className="text-sm text-white/40">No events this day.</li>
            ) : (
              dayItems.map((item) => {
                const time = calendarItemTimeRangeLabel(item);
                const ring = RINGS.find((r) => r.id === ringForItem(item));
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onItemClick(item)}
                      className="flex w-full items-start gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-2 text-left hover:bg-white/[0.07]"
                    >
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: ring?.fill ?? RINGS[0].fill }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-white">{item.title}</span>
                        {time ? <span className="block text-[11px] text-white/45">{time}</span> : null}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Rings</p>
          <ul className="mt-2 space-y-2">
            {RINGS.map((ring) => (
              <li key={ring.id} className="flex items-center gap-2 text-sm text-white/75">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: ring.fill }} />
                {ring.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
