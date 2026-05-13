import type { ReactNode } from "react";
import type { EventDetail, InternalBookingDetail, TourDetail } from "../../../../backend/src/types";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  getItemTimeRange,
  internalBookingDisplayTitle,
  type CalendarItem,
} from "./scheduleUtils";

function bookingTypeLabel(type: string): string {
  switch (type) {
    case "rehearsal":
      return "Rehearsal";
    case "maintenance":
      return "Maintenance";
    case "private":
      return "Private";
    case "venue_booking":
      return "Venue booking";
    case "other":
      return "Other";
    default:
      return type;
  }
}

function formatDateTime(d: Date, locale: string, hour12: boolean): string {
  return d.toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    hour12,
  });
}

function formatDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { dateStyle: "medium" });
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === "") return null;
  return (
    <div className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-x-2 text-[11px] leading-snug">
      <div className="text-white/45 font-medium">{label}</div>
      <div className="text-white/90 min-w-0 break-words">{children}</div>
    </div>
  );
}

function CalendarItemHoverBody({
  item,
  locale,
  hour12,
}: {
  item: CalendarItem;
  locale: string;
  hour12: boolean;
}) {
  const { start, end, hasExplicitTime } = getItemTimeRange(item);
  const rangeLabel = hasExplicitTime
    ? `${formatDateTime(start, locale, hour12)} – ${formatDateTime(end, locale, hour12)}`
    : `${formatDate(start, locale)}${end.getTime() !== start.getTime() ? ` – ${formatDate(end, locale)}` : ""} (all day)`;

  const kindLabel =
    item.kind === "booking"
      ? "Booking"
      : item.kind === "event"
        ? "Event"
        : item.kind === "job"
          ? "Show job"
          : item.kind === "tour"
            ? "Tour"
            : item.kind;

  if (item.kind === "booking") {
    const b = item.raw as InternalBookingDetail & { eventId?: string | null };
    const title = internalBookingDisplayTitle(b.title);
    const people =
      b.people?.length > 0
        ? b.people.map((p) => (p.role ? `${p.person.name} (${p.role})` : p.person.name)).join(", ")
        : null;

    return (
      <div className="space-y-2.5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{kindLabel}</div>
          <div className="text-sm font-semibold text-white leading-tight mt-0.5">{title}</div>
        </div>
        <div className="space-y-1.5 border-t border-white/10 pt-2">
          <DetailRow label="Type">{bookingTypeLabel(b.type)}</DetailRow>
          <DetailRow label="When">{rangeLabel}</DetailRow>
          <DetailRow label="Status">{item.status}</DetailRow>
          <DetailRow label="Venue">{b.venue?.name}</DetailRow>
          {(b.venue?.addressCity || b.venue?.addressStreet) && (
            <DetailRow label="Address">
              {[b.venue?.addressStreet, b.venue?.addressNumber, b.venue?.addressZip, b.venue?.addressCity]
                .filter(Boolean)
                .join(", ")}
            </DetailRow>
          )}
          <DetailRow label="People">{people}</DetailRow>
          <DetailRow label="Description">{b.description?.trim()}</DetailRow>
          <DetailRow label="Created by">{b.createdBy?.name}</DetailRow>
          <DetailRow label="Created">{b.createdAt ? formatDateTime(new Date(b.createdAt), locale, hour12) : null}</DetailRow>
          <DetailRow label="Updated">{b.updatedAt ? formatDateTime(new Date(b.updatedAt), locale, hour12) : null}</DetailRow>
          {b.isLocked ? <DetailRow label="Lock">Locked</DetailRow> : null}
          {b.eventId ? <DetailRow label="Linked">Mirrored from an event on this schedule</DetailRow> : null}
        </div>
      </div>
    );
  }

  if (item.kind === "event") {
    const ev = item.raw as EventDetail;
    return (
      <div className="space-y-2.5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{kindLabel}</div>
          <div className="text-sm font-semibold text-white leading-tight mt-0.5">{item.title}</div>
        </div>
        <div className="space-y-1.5 border-t border-white/10 pt-2">
          <DetailRow label="When">{rangeLabel}</DetailRow>
          <DetailRow label="Status">{item.status ?? ev.status}</DetailRow>
          <DetailRow label="Venue">{ev.venue?.name}</DetailRow>
          <DetailRow label="Description">{ev.description?.trim()}</DetailRow>
        </div>
      </div>
    );
  }

  if (item.kind === "job") {
    const ev = item.raw as EventDetail;
    return (
      <div className="space-y-2.5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{kindLabel}</div>
          <div className="text-sm font-semibold text-white leading-tight mt-0.5">{item.title}</div>
        </div>
        <div className="space-y-1.5 border-t border-white/10 pt-2">
          <DetailRow label="When">{rangeLabel}</DetailRow>
          <DetailRow label="Status">{item.status}</DetailRow>
          <DetailRow label="Venue">{item.venueLabel ?? ev.venue?.name}</DetailRow>
          <DetailRow label="Event">{ev.title}</DetailRow>
        </div>
      </div>
    );
  }

  if (item.kind === "tour") {
    const tour = item.raw as TourDetail;
    return (
      <div className="space-y-2.5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{kindLabel}</div>
          <div className="text-sm font-semibold text-white leading-tight mt-0.5">{item.title}</div>
        </div>
        <div className="space-y-1.5 border-t border-white/10 pt-2">
          <DetailRow label="When">{rangeLabel}</DetailRow>
          <DetailRow label="Status">{item.status ?? tour.status}</DetailRow>
          <DetailRow label="Venue / city">{item.venueLabel}</DetailRow>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{kindLabel}</div>
        <div className="text-sm font-semibold text-white leading-tight mt-0.5">{item.title}</div>
      </div>
      <div className="space-y-1.5 border-t border-white/10 pt-2">
        <DetailRow label="When">{rangeLabel}</DetailRow>
        <DetailRow label="Status">{item.status}</DetailRow>
      </div>
    </div>
  );
}

/**
 * Rich hover details for a schedule block (Outlook week/day grid, all-day chips, etc.).
 */
export function CalendarItemHoverCard({
  item,
  locale,
  hour12,
  side = "right",
  align = "start",
  children,
}: {
  item: CalendarItem;
  locale: string;
  hour12: boolean;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  children: ReactNode;
}) {
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side={side}
        align={align}
        className="z-[100] w-[min(22rem,calc(100vw-2rem))] max-h-[min(24rem,70vh)] overflow-y-auto border border-white/10 bg-[#14141c] p-3 text-white shadow-xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <CalendarItemHoverBody item={item} locale={locale} hour12={hour12} />
      </HoverCardContent>
    </HoverCard>
  );
}
