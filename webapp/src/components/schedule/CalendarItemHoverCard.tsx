import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { EventDetail, InternalBookingDetail, TourDetail } from "../../../../backend/src/types";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { internalBookingDisplayTitle, type CalendarItem } from "./scheduleUtils";
import {
  BookingBody,
  EventJobBody,
  ScheduleStartEndBlock,
  TourBody,
} from "./ScheduleItemDetailSheet";

const BOOKING_TYPE_LABELS: Record<string, string> = {
  rehearsal: "Rehearsal",
  maintenance: "Maintenance",
  private: "Private",
  venue_booking: "Venue booking",
  other: "Other",
};

function parseEventCalendarId(id: string): { eventId: string; showId?: string; jobId?: string } {
  const jobM = /^(.+):show:([^:]+):job:([^:]+)$/.exec(id);
  if (jobM?.[1] && jobM[2] && jobM[3]) return { eventId: jobM[1], showId: jobM[2], jobId: jobM[3] };
  const showM = /^(.+):show:([^:]+)$/.exec(id);
  if (showM?.[1] && showM[2]) return { eventId: showM[1], showId: showM[2] };
  return { eventId: id };
}

function kindLabel(item: CalendarItem): string {
  if (item.kind === "booking") return BOOKING_TYPE_LABELS[item.type ?? "other"] ?? "Booking";
  if (item.kind === "event") return "Event";
  if (item.kind === "job") return "Show job";
  if (item.kind === "tour") return "Tour";
  return item.kind;
}

function itemTitle(item: CalendarItem): string {
  if (item.kind === "booking") {
    return internalBookingDisplayTitle((item.raw as InternalBookingDetail).title);
  }
  return item.title;
}

function FooterLinks({ item }: { item: CalendarItem }) {
  if (item.kind === "booking") {
    return null;
  }

  if (item.kind === "tour") {
    const tour = item.raw as TourDetail;
    return (
      <div className="border-t border-white/10 pt-2">
        <Link
          to={`/tours/${tour.id}`}
          className="text-[11px] font-medium text-sky-300 hover:text-sky-200 underline underline-offset-2"
          onClick={(e) => e.stopPropagation()}
        >
          Open tour
        </Link>
      </div>
    );
  }

  if (item.kind === "event" || item.kind === "job") {
    const eventId = parseEventCalendarId(item.id).eventId;
    return (
      <div className="border-t border-white/10 pt-2">
        <Link
          to={`/events/${eventId}`}
          className="text-[11px] font-medium text-sky-300 hover:text-sky-200 underline underline-offset-2"
          onClick={(e) => e.stopPropagation()}
        >
          Open event
        </Link>
      </div>
    );
  }

  return null;
}

export function CalendarItemHoverBody({
  item,
  locale,
  hour12,
}: {
  item: CalendarItem;
  locale: string;
  hour12: boolean;
}) {
  const status = item.status ?? (item.kind === "event" ? (item.raw as EventDetail).status : undefined);

  return (
    <div className="space-y-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{kindLabel(item)}</div>
          {status ? (
            <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] capitalize text-white/55">
              {status}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 text-sm font-semibold leading-snug text-white">{itemTitle(item)}</div>
      </div>

      <ScheduleStartEndBlock item={item} locale={locale} hour12={hour12} />

      {item.kind === "booking" ? <BookingBody item={item} /> : null}
      {item.kind === "tour" ? <TourBody item={item} locale={locale} /> : null}
      {item.kind === "event" || item.kind === "job" ? <EventJobBody item={item} locale={locale} /> : null}

      <FooterLinks item={item} />
    </div>
  );
}

/**
 * Rich hover details for a schedule block. Only the name label opens the card so stacked
 * entries stay independently hoverable.
 */
export function CalendarItemHoverCard({
  item,
  locale,
  hour12,
  side = "right",
  align = "start",
  label,
  labelClassName,
}: {
  item: CalendarItem;
  locale: string;
  hour12: boolean;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  label: ReactNode;
  labelClassName?: string;
}) {
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span
          data-entry-name-label
          className={cn(
            "pointer-events-auto inline-block min-w-0 max-w-full cursor-default",
            labelClassName,
          )}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {label}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        side={side}
        align={align}
        className="w-[min(24rem,calc(100vw-2rem))] max-h-[min(32rem,80vh)] overflow-y-auto border border-white/10 bg-[#14141c] p-3 text-white shadow-xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <CalendarItemHoverBody item={item} locale={locale} hour12={hour12} />
      </HoverCardContent>
    </HoverCard>
  );
}
