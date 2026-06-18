import { useMemo, useState } from "react";

import {
  getItemTimeRange,
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

function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

function dayOfYear(date: Date): number {
  const jan1 = new Date(date.getFullYear(), 0, 1);
  return Math.floor((date.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000)) + 1;
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

type DiscSegment = {
  id: string;
  item: CalendarItem;
  ringId: RingId;
  path: string;
  fill: string;
  opacity: number;
};

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
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const totalDays = daysInYear(year);

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

  const hovered = segments.find((segment) => segment.id === hoveredId)?.item ?? null;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-center">
      <div className="relative mx-auto w-full max-w-[min(100%,42rem)]">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Year disc ${year}`}
        >
          <circle cx={CX} cy={CY} r={OUTER_R + 14} fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.08)" />
          {RINGS.map((ring, index) => {
            const { inner, outer } = ringRadii(index);
            return (
              <g key={ring.id}>
                <circle
                  cx={CX}
                  cy={CY}
                  r={(inner + outer) / 2}
                  fill="none"
                  stroke="rgba(255,255,255,0.06)"
                  strokeWidth={RING_WIDTH}
                />
              </g>
            );
          })}
          {monthMarkers.map((marker) => (
            <g key={marker.month}>
              <line
                x1={marker.tickInner.x}
                y1={marker.tickInner.y}
                x2={marker.tickOuter.x}
                y2={marker.tickOuter.y}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={1}
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
              onClick={() => onItemClick(segment.item)}
            >
              <title>{segment.item.title}</title>
            </path>
          ))}
          <circle cx={CX} cy={CY} r={ringRadii(RINGS.length - 1).inner - 10} fill="#0a0a0f" />
          <text
            x={CX}
            y={CY - 6}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-white text-4xl font-semibold"
          >
            {year}
          </text>
          <text
            x={CX}
            y={CY + 22}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-white/40 text-[11px] uppercase tracking-[0.2em]"
          >
            Year disc
          </text>
        </svg>
        {hovered ? (
          <div className="pointer-events-none absolute bottom-3 left-1/2 max-w-[90%] -translate-x-1/2 rounded-lg border border-white/10 bg-[#16161f]/95 px-3 py-2 text-center shadow-lg">
            <p className="truncate text-sm font-medium text-white">{hovered.title}</p>
          </div>
        ) : null}
      </div>
      <div className="mx-auto w-full max-w-xs shrink-0 rounded-lg border border-white/10 bg-white/[0.02] p-3 lg:mx-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Rings</p>
        <ul className="mt-2 space-y-2">
          {RINGS.map((ring) => (
            <li key={ring.id} className="flex items-center gap-2 text-sm text-white/75">
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: ring.fill }} />
              {ring.label}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-snug text-white/35">
          January at the top, year flows clockwise — like a{" "}
          <a
            href="https://plandisc.com/en/"
            target="_blank"
            rel="noreferrer"
            className="text-blue-300/80 hover:text-blue-200"
          >
            Plandisc
          </a>{" "}
          circular planner. Click a segment for details.
        </p>
      </div>
    </div>
  );
}
