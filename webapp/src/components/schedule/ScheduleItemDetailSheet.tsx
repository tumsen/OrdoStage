import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MapPin, Pencil, UserCircle, Users } from "lucide-react";
import type { CalendarItem } from "./scheduleUtils";
import { getItemTimeRange, itemColor } from "./scheduleUtils";
import { cn } from "@/lib/utils";
import type {
  EventDetail,
  InternalBookingDetail,
  TourDetail,
  TourShow,
} from "../../../../backend/src/types";
import {
  scheduleEventLabel,
  sortedTourScheduleEvents,
  tourShowScheduleSummaryCompact,
} from "@/lib/tourScheduleDisplay";
import { usePreferences } from "@/hooks/usePreferences";

const BOOKING_TYPE_LABELS: Record<string, string> = {
  rehearsal: "Rehearsal",
  maintenance: "Maintenance",
  private: "Private",
  venue_booking: "Venue booking",
  other: "Other",
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-yellow-900/40 text-yellow-300 border border-yellow-700/40",
  confirmed: "bg-green-900/40 text-green-300 border border-green-700/40",
  cancelled: "bg-red-900/40 text-red-300 border border-red-700/40",
  active: "bg-emerald-900/40 text-emerald-200 border border-emerald-700/40",
  completed: "bg-slate-800/80 text-slate-300 border border-slate-600/50",
};

function formatScheduleInstant(d: Date, locale: string, hasTime: boolean, hour12: boolean): string {
  if (!Number.isFinite(d.getTime())) return "—";
  if (hasTime) {
    return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", hour12 });
  }
  return d.toLocaleDateString(locale, { dateStyle: "medium" });
}

function ScheduleStartEndBlock({ item, locale, hour12 }: { item: CalendarItem; locale: string; hour12: boolean }) {
  const { start, end, hasExplicitTime } = getItemTimeRange(item);
  const startStr = formatScheduleInstant(start, locale, hasExplicitTime, hour12);
  const endStr = formatScheduleInstant(end, locale, hasExplicitTime, hour12);
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 shrink-0 text-white/35 [&_svg]:block">
        <Clock size={16} />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-sm leading-snug items-baseline">
          <span className="text-white/45">Start:</span>
          <span className="text-white/85 tabular-nums">{startStr}</span>
          <span className="text-white/45">End:</span>
          <span className="text-white/85 tabular-nums">{endStr}</span>
        </div>
        {!hasExplicitTime ? (
          <p className="text-xs text-white/40">No specific start time on this block.</p>
        ) : null}
      </div>
    </div>
  );
}

function formatAddress(parts: {
  street?: string | null;
  number?: string | null;
  zip?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}): string | null {
  const line1 = [parts.street, parts.number].filter(Boolean).join(" ").trim();
  const line2 = [parts.zip, parts.city].filter(Boolean).join(" ").trim();
  const tail = [parts.state, parts.country].filter(Boolean).join(", ").trim();
  const full = [line1, line2, tail].filter(Boolean).join(", ").trim();
  return full || null;
}

/** Parse `eventId`, optional `showId`, optional `jobId` from calendar item id. */
function parseEventCalendarId(id: string): { eventId: string; showId?: string; jobId?: string } {
  const jobM = /^(.+):show:([^:]+):job:([^:]+)$/.exec(id);
  if (jobM?.[1] && jobM[2] && jobM[3]) return { eventId: jobM[1], showId: jobM[2], jobId: jobM[3] };
  const showM = /^(.+):show:([^:]+)$/.exec(id);
  if (showM?.[1] && showM[2]) return { eventId: showM[1], showId: showM[2] };
  return { eventId: id };
}

const TOUR_CAL_RE = /^tour:([^:]+):show:([^:]+)(?::ev:([^:]+))?$/;

function parseTourCalendarId(
  id: string
): { tourId: string; showId: string; scheduleEventId?: string } | null {
  const m = TOUR_CAL_RE.exec(id);
  if (!m?.[1] || !m[2]) return null;
  return { tourId: m[1], showId: m[2], scheduleEventId: m[3] };
}

function DetailBlock({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 shrink-0 text-white/35 [&_svg]:block">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-white/40 mb-0.5">{label}</div>
        <div className="text-sm text-white/85 leading-snug">{children}</div>
      </div>
    </div>
  );
}

export function ScheduleItemDetailSheet({
  item,
  locale,
  onClose,
  onEdit,
}: {
  item: CalendarItem | null;
  locale: string;
  onClose: () => void;
  onEdit?: (item: CalendarItem) => void;
}) {
  const open = item !== null;
  const canEdit = Boolean(onEdit) && item && item.kind !== "tour";
  const { effective } = usePreferences();
  const hour12 = effective?.timeFormat !== "24h";

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="bg-[#0d0d14] border-white/10 text-white w-full sm:max-w-lg flex flex-col max-h-[90vh]">
        {!item ? null : (
          <>
            <SheetHeader className="space-y-3 pb-3 border-b border-white/10 shrink-0 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "text-[11px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider border",
                    itemColor(item)
                  )}
                >
                  {item.kind === "tour"
                    ? "Tour"
                    : item.kind === "job"
                      ? "Show job"
                      : item.kind === "event"
                        ? "Event"
                        : BOOKING_TYPE_LABELS[item.type ?? "other"]}
                </span>
                {item.status ? (
                  <span
                    className={cn(
                      "text-[11px] px-2 py-0.5 rounded font-medium border",
                      STATUS_BADGE[item.status] ?? "bg-white/5 text-white/60 border-white/10"
                    )}
                  >
                    {item.status}
                  </span>
                ) : null}
              </div>
              <SheetTitle className="text-white text-lg font-semibold leading-snug pr-8">
                {item.title}
              </SheetTitle>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto min-h-0 py-4 space-y-5">
              <ScheduleStartEndBlock item={item} locale={locale} hour12={hour12} />

              {item.kind === "booking" ? (
                <BookingBody item={item} />
              ) : item.kind === "tour" ? (
                <TourBody item={item} locale={locale} />
              ) : (
                <EventJobBody item={item} locale={locale} />
              )}
            </div>

            <SheetFooter className="border-t border-white/10 pt-3 pb-1 gap-2 flex-row flex-wrap shrink-0">
              {item.kind === "tour" ? (
                <Button asChild variant="secondary" className="bg-white/10 border-white/15 text-white hover:bg-white/15">
                  <Link to={`/tours/${(item.raw as TourDetail).id}`} onClick={onClose}>
                    Open tour
                  </Link>
                </Button>
              ) : null}
              {(item.kind === "event" || item.kind === "job") ? (
                <Button asChild variant="secondary" className="bg-white/10 border-white/15 text-white hover:bg-white/15">
                  <Link to={`/events/${parseEventCalendarId(item.id).eventId}`} onClick={onClose}>
                    Open event
                  </Link>
                </Button>
              ) : null}
              {canEdit ? (
                <Button
                  type="button"
                  variant="default"
                  className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-1.5"
                  onClick={() => {
                    onEdit?.(item);
                    onClose();
                  }}
                >
                  <Pencil size={14} />
                  Edit
                </Button>
              ) : null}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function BookingBody({ item }: { item: CalendarItem }) {
  const b = item.raw as InternalBookingDetail;
  return (
    <>
      {b.description ? (
        <DetailBlock icon={<Calendar size={16} />} label="Description">
          {b.description}
        </DetailBlock>
      ) : null}
      {b.venue ? (
        <DetailBlock icon={<MapPin size={16} />} label="Venue">
          <span className="font-medium text-white">{b.venue.name}</span>
          {formatAddress({
            street: b.venue.addressStreet,
            number: b.venue.addressNumber,
            zip: b.venue.addressZip,
            city: b.venue.addressCity,
            state: b.venue.addressState,
            country: b.venue.addressCountry,
          }) ? (
            <div className="text-xs text-white/45 mt-1">
              {formatAddress({
                street: b.venue.addressStreet,
                number: b.venue.addressNumber,
                zip: b.venue.addressZip,
                city: b.venue.addressCity,
                state: b.venue.addressState,
                country: b.venue.addressCountry,
              })}
            </div>
          ) : null}
        </DetailBlock>
      ) : null}
      {b.createdBy ? (
        <DetailBlock icon={<UserCircle size={16} />} label="Booked by">
          <span className="font-medium">{b.createdBy.name}</span>
          <div className="text-xs text-white/45">{b.createdBy.email}</div>
        </DetailBlock>
      ) : null}
      {b.people?.length ? (
        <DetailBlock icon={<Users size={16} />} label="People">
          <ul className="space-y-1">
            {b.people.map((p) => (
              <li key={p.id} className="text-sm">
                <span className="text-white/90">{p.person.name}</span>
                {p.role ? <span className="text-white/40 ml-1">({p.role})</span> : null}
              </li>
            ))}
          </ul>
        </DetailBlock>
      ) : null}
      {b.eventId ? (
        <DetailBlock icon={<Calendar size={16} />} label="Linked event">
          <Link
            to={`/events/${b.eventId}`}
            className="text-red-400 hover:text-red-300 underline-offset-2 hover:underline"
          >
            View event
          </Link>
        </DetailBlock>
      ) : null}
      {b.isLocked ? (
        <p className="text-xs text-amber-400/90 border border-amber-700/40 rounded-md px-2 py-1.5 bg-amber-950/30">
          This booking is locked.
        </p>
      ) : null}
    </>
  );
}

function TourBody({ item, locale }: { item: CalendarItem; locale: string }) {
  const tour = item.raw as TourDetail;
  const parts = parseTourCalendarId(item.id);
  const show =
    parts && tour.shows
      ? (tour.shows as TourShow[]).find((s) => s.id === parts.showId) ?? null
      : null;
  const ev =
    show && parts?.scheduleEventId
      ? sortedTourScheduleEvents(show).find((e) => e.id === parts.scheduleEventId) ?? null
      : null;

  const dayLabel = show?.date
    ? new Date(show.date).toLocaleDateString(locale, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <>
      <DetailBlock icon={<Calendar size={16} />} label="Tour">
        <span className="font-medium text-white">{tour.name}</span>
        {tour.description?.trim() ? (
          <p className="text-xs text-white/50 mt-2 leading-relaxed whitespace-pre-wrap">{tour.description}</p>
        ) : null}
      </DetailBlock>
      {dayLabel ? (
        <DetailBlock icon={<Calendar size={16} />} label="Tour day">
          {dayLabel}
        </DetailBlock>
      ) : null}
      {show ? (
        <>
          {show.type !== "show" ? (
            <DetailBlock icon={<Calendar size={16} />} label="Day type">
              {show.type === "travel" ? "Travel" : show.type === "day_off" ? "Day off" : show.type}
              {show.fromLocation || show.toLocation ? (
                <div className="text-xs text-white/45 mt-1">
                  {[show.fromLocation, show.toLocation].filter(Boolean).join(" → ")}
                </div>
              ) : null}
            </DetailBlock>
          ) : null}
          {item.venueLabel ? (
            <DetailBlock icon={<MapPin size={16} />} label="Venue">
              {item.venueLabel}
              {formatAddress({
                street: show.venueStreet,
                number: show.venueNumber,
                zip: show.venueZip,
                city: show.venueCity,
                state: show.venueState,
                country: show.venueCountry,
              }) ? (
                <div className="text-xs text-white/45 mt-1">
                  {formatAddress({
                    street: show.venueStreet,
                    number: show.venueNumber,
                    zip: show.venueZip,
                    city: show.venueCity,
                    state: show.venueState,
                    country: show.venueCountry,
                  })}
                </div>
              ) : null}
            </DetailBlock>
          ) : show.venueName || show.venueCity ? (
            <DetailBlock icon={<MapPin size={16} />} label="Venue">
              {show.venueName || show.venueCity}
            </DetailBlock>
          ) : null}
          {ev ? (
            <DetailBlock icon={<Clock size={16} />} label="Schedule row">
              {scheduleEventLabel(ev)} · {ev.startTime}–{ev.endTime}
            </DetailBlock>
          ) : tourShowScheduleSummaryCompact(show) ? (
            <DetailBlock icon={<Clock size={16} />} label="Day timeline">
              <span className="text-xs text-white/70 font-mono tabular-nums whitespace-pre-wrap">
                {tourShowScheduleSummaryCompact(show)}
              </span>
            </DetailBlock>
          ) : null}
          {show.notes?.trim() ? (
            <DetailBlock icon={<Calendar size={16} />} label="Day notes">
              <span className="text-xs text-white/60 whitespace-pre-wrap">{show.notes}</span>
            </DetailBlock>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function EventJobBody({ item, locale }: { item: CalendarItem; locale: string }) {
  const ev = item.raw as EventDetail;
  const { showId, jobId } = parseEventCalendarId(item.id);
  const show = showId ? ev.shows?.find((s) => s.id === showId) : undefined;
  const job =
    jobId && show ? show.jobs?.find((j) => j.id === jobId) : undefined;

  return (
    <>
      {ev.description?.trim() ? (
        <DetailBlock icon={<Calendar size={16} />} label="Event description">
          <span className="text-sm text-white/70 whitespace-pre-wrap">{ev.description}</span>
        </DetailBlock>
      ) : null}
      {ev.venue ? (
        <DetailBlock icon={<MapPin size={16} />} label="Event venue">
          <span className="font-medium text-white">{ev.venue.name}</span>
          {formatAddress({
            street: ev.venue.addressStreet,
            number: ev.venue.addressNumber,
            zip: ev.venue.addressZip,
            city: ev.venue.addressCity,
            state: ev.venue.addressState,
            country: ev.venue.addressCountry,
          }) ? (
            <div className="text-xs text-white/45 mt-1">
              {formatAddress({
                street: ev.venue.addressStreet,
                number: ev.venue.addressNumber,
                zip: ev.venue.addressZip,
                city: ev.venue.addressCity,
                state: ev.venue.addressState,
                country: ev.venue.addressCountry,
              })}
            </div>
          ) : null}
        </DetailBlock>
      ) : null}
      {show ? (
        <>
          <DetailBlock icon={<Calendar size={16} />} label="Show">
            <div className="text-white/90">
              {new Date(show.showDate).toLocaleDateString(locale, {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </div>
            {show.showTime ? (
              <div className="text-xs text-white/50 mt-1">
                Doors / show time {show.showTime}
                {show.durationMinutes ? ` · ${show.durationMinutes} min` : ""}
              </div>
            ) : null}
            {show.venue ? (
              <div className="text-xs text-white/45 mt-1">Show venue: {show.venue.name}</div>
            ) : null}
          </DetailBlock>
        </>
      ) : null}
      {job ? (
        <DetailBlock icon={<Users size={16} />} label="Job">
          <div className="font-medium text-white">{job.title}</div>
          <div className="text-xs text-white/50 mt-1 tabular-nums">
            {job.jobDate ? new Date(job.jobDate).toLocaleDateString(locale) : ""}
            {job.startTime ? ` · ${job.startTime}` : ""}
            {job.durationMinutes ? ` · ${job.durationMinutes} min` : ""}
          </div>
          {(job.people?.length ?? 0) > 0 || job.person ? (
            <div className="text-xs text-white/45 mt-1">
              Assigned:{" "}
              {(job.people?.length
                ? job.people.map((p) => p.name).join(", ")
                : job.person?.name) ?? "—"}
            </div>
          ) : null}
          {job.venue ? (
            <div className="text-xs text-white/45 mt-1">At: {job.venue.name}</div>
          ) : null}
        </DetailBlock>
      ) : null}
      {ev.contactPerson?.trim() ? (
        <DetailBlock icon={<UserCircle size={16} />} label="Contact">
          {ev.contactPerson}
        </DetailBlock>
      ) : null}
      {ev.people?.length ? (
        <DetailBlock icon={<Users size={16} />} label="Team">
          <ul className="space-y-1">
            {ev.people.map((p) => (
              <li key={p.id} className="text-sm">
                <span className="text-white/90">{p.person.name}</span>
                {p.role ? <span className="text-white/40 ml-1">({p.role})</span> : null}
              </li>
            ))}
          </ul>
        </DetailBlock>
      ) : (
        <p className="text-[11px] text-white/35 italic">Full team and documents load on the event page.</p>
      )}
    </>
  );
}
