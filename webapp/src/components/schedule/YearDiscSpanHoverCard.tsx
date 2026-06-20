import type { ReactElement } from "react";

import { CalendarItemHoverBody } from "@/components/schedule/CalendarItemHoverCard";
import { ScheduleHoverCardContent } from "@/components/schedule/ScheduleHoverCardContent";
import { calendarItemTimeRangeLabel } from "@/components/schedule/scheduleUtils";
import type { YearDiscSpan } from "@/components/schedule/yearDiscConfig";
import { HoverCard, HoverCardTrigger } from "@/components/ui/hover-card";

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

export function YearDiscSpanHoverContent({
  span,
  ringColor,
  locale,
  hour12,
}: {
  span: YearDiscSpan;
  ringColor: string;
  locale: string;
  hour12: boolean;
}) {
  const time = spanTimeLabel(span, hour12);

  if (span.calendarItem) {
    return <CalendarItemHoverBody item={span.calendarItem} locale={locale} hour12={hour12} />;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: ringColor }} />
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Time tracking</div>
          <div className="mt-0.5 text-sm font-semibold leading-tight text-white">{span.title}</div>
        </div>
      </div>
      {time ? (
        <div className="border-t border-white/10 pt-2 text-[11px] leading-snug text-white/90">{time}</div>
      ) : null}
    </div>
  );
}

export function YearDiscSpanHoverCard({
  span,
  ringColor,
  locale,
  hour12,
  children,
  onHoverChange,
}: {
  span: YearDiscSpan;
  ringColor: string;
  locale: string;
  hour12: boolean;
  children: ReactElement;
  onHoverChange?: (hovered: boolean) => void;
}) {
  return (
    <HoverCard
      openDelay={200}
      closeDelay={300}
      onOpenChange={(open) => {
        onHoverChange?.(open);
      }}
    >
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <ScheduleHoverCardContent>
        <YearDiscSpanHoverContent span={span} ringColor={ringColor} locale={locale} hour12={hour12} />
      </ScheduleHoverCardContent>
    </HoverCard>
  );
}
