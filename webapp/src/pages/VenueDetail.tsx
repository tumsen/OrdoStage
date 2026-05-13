import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { EventDetail, InternalBookingDetail, Person, TourDetail, Venue } from "../../../backend/src/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OutlookTimeGrid } from "@/components/schedule/OutlookTimeGrid";
import {
  toCalendarItems,
  getMonthCalendarDays,
  calendarItemVenueIdForFilter,
  formatMonthLabel,
} from "@/components/schedule/scheduleUtils";
import type { CalendarItem } from "@/components/schedule/scheduleUtils";
import { CALENDAR_PANEL_FLEX_COLUMN_CLASS, CALENDAR_PANEL_SHELL_CLASS } from "@/lib/weekGridColumns";
import { formatAddress, googleMapsUrl, appleMapsUrl } from "@/components/AddressFields";
import { VenueDocumentsSection } from "@/components/VenueDocumentsSection";
import { ScheduleItemDetailSheet } from "@/components/schedule/ScheduleItemDetailSheet";
import { EditItemSheet } from "@/components/schedule/EditItemSheet";
import { NewBookingDialog } from "@/components/schedule/NewBookingDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { usePreferences } from "@/hooks/usePreferences";

interface ScheduleData {
  events: EventDetail[];
  bookings: InternalBookingDetail[];
  tours: TourDetail[];
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthRangeISO(anchor: Date): { from: string; to: string } {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const from = new Date(y, m, 1);
  const to = new Date(y, m + 1, 0);
  return { from: toISODate(from), to: toISODate(to) };
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

export default function VenueDetail() {
  const { id: venueId = "" } = useParams<{ id: string }>();
  const { canWrite } = usePermissions();
  const { effective } = usePreferences();
  const locale =
    effective?.language === "da" ? "da-DK" : effective?.language === "de" ? "de-DE" : "en-US";

  const [anchorMonth, setAnchorMonth] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [detailItem, setDetailItem] = useState<CalendarItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);

  const { from, to } = useMemo(() => monthRangeISO(anchorMonth), [anchorMonth]);
  const monthDays = useMemo(() => getMonthCalendarDays(anchorMonth), [anchorMonth]);

  const { data: venue, isLoading: venueLoading, isError: venueError } = useQuery({
    queryKey: ["venue", venueId],
    queryFn: () => api.get<Venue>(`/api/venues/${venueId}`),
    enabled: Boolean(venueId),
  });

  const { data: scheduleData, isLoading: scheduleLoading } = useQuery({
    queryKey: ["schedule", "venue-detail", venueId, from, to],
    queryFn: () =>
      api.get<ScheduleData>(`/api/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&venueId=${encodeURIComponent(venueId)}`),
    enabled: Boolean(venueId),
  });

  const { data: venues } = useQuery({
    queryKey: ["venues"],
    queryFn: () => api.get<Venue[]>("/api/venues"),
  });

  const { data: people } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<Person[]>("/api/people"),
  });

  const calendarItems: CalendarItem[] = useMemo(() => {
    if (!scheduleData) return [];
    const raw = toCalendarItems(scheduleData.events, scheduleData.bookings, scheduleData.tours ?? [], {});
    return raw.filter((item) => calendarItemVenueIdForFilter(item) === venueId);
  }, [scheduleData, venueId]);

  if (!venueId) {
    return (
      <div className="p-6">
        <p className="text-white/50 text-sm">Missing venue id.</p>
        <Button asChild variant="link" className="text-white/70 mt-2">
          <Link to="/venues">Back to venues</Link>
        </Button>
      </div>
    );
  }

  if (venueError) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-red-400 text-sm">Venue not found or you do not have access.</p>
        <Button asChild variant="outline" className="border-white/10 text-white">
          <Link to="/venues">Back to venues</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-5 overflow-hidden p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3 shrink-0 min-w-0">
        <Button asChild variant="ghost" size="sm" className="text-white/70 hover:text-white gap-1 -ml-2 shrink-0">
          <Link to="/venues">
            <ChevronLeft className="h-4 w-4" />
            Venues
          </Link>
        </Button>
        {venue && !venueLoading ? (
          <span className="text-lg font-semibold text-white truncate min-w-0">{venue.name}</span>
        ) : null}
      </div>

      {venueLoading || !venue ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-64 bg-white/5" />
          <Skeleton className="min-h-[280px] w-full bg-white/5 rounded-xl border border-white/10" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
            <h2 className="text-sm font-semibold text-white/90 min-w-0">
              Bookings · {formatMonthLabel(anchorMonth.getFullYear(), anchorMonth.getMonth())}
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 border-white/10 bg-white/5 text-white"
                onClick={() => setAnchorMonth((d) => addMonths(d, -1))}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-white/50 tabular-nums min-w-[10rem] text-center">
                {anchorMonth.toLocaleDateString(locale, { month: "long", year: "numeric" })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 border-white/10 bg-white/5 text-white"
                onClick={() => setAnchorMonth((d) => addMonths(d, 1))}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              {canWrite ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-1.5 ml-2"
                  onClick={() => setBookingOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Booking
                </Button>
              ) : null}
            </div>
          </div>

          <div className={`${CALENDAR_PANEL_SHELL_CLASS} flex-1 min-h-0`}>
            <div className={CALENDAR_PANEL_FLEX_COLUMN_CLASS}>
              {scheduleLoading ? (
                <Skeleton className="min-h-[320px] w-full bg-white/5 rounded-xl border border-white/10" />
              ) : (
                <OutlookTimeGrid
                  className="min-h-0 flex-1"
                  days={monthDays}
                  items={calendarItems}
                  onItemClick={(item) => setDetailItem(item)}
                  readOnly
                  compactDayHeaders
                />
              )}
            </div>
          </div>

          <div className="space-y-3 shrink-0 border-t border-white/10 pt-5">
            <h1 className="text-2xl font-semibold text-white tracking-tight">{venue.name}</h1>
            {venue.addressStreet || venue.addressCity || venue.addressCountry ? (
              <div className="text-sm text-white/55 max-w-xl">
                {formatAddress({
                  street: venue.addressStreet,
                  number: venue.addressNumber,
                  zip: venue.addressZip,
                  city: venue.addressCity,
                  state: venue.addressState,
                  country: venue.addressCountry,
                })}
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <a
                    href={googleMapsUrl({
                      street: venue.addressStreet,
                      number: venue.addressNumber,
                      zip: venue.addressZip,
                      city: venue.addressCity,
                      state: venue.addressState,
                      country: venue.addressCountry,
                    })}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-300 hover:text-blue-200"
                  >
                    Google Maps
                  </a>
                  <a
                    href={appleMapsUrl({
                      street: venue.addressStreet,
                      number: venue.addressNumber,
                      zip: venue.addressZip,
                      city: venue.addressCity,
                      state: venue.addressState,
                      country: venue.addressCountry,
                    })}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-300 hover:text-blue-200"
                  >
                    Apple Maps
                  </a>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-white/45">
              {venue.capacity != null ? <span>Capacity: {venue.capacity.toLocaleString(locale)}</span> : null}
              {venue.width || venue.length || venue.height ? (
                <span>
                  Size: W {venue.width ?? "—"} · L {venue.length ?? "—"} · H {venue.height ?? "—"}
                </span>
              ) : null}
            </div>
            {venue.notes ? <p className="text-sm text-white/40 max-w-2xl whitespace-pre-wrap">{venue.notes}</p> : null}
          </div>

          <div className="shrink-0 rounded-xl border border-white/10 bg-white/[0.02] p-3 md:p-4">
            <h2 className="text-xs font-medium text-white/40 uppercase tracking-wide mb-3">Images &amp; documents</h2>
            <VenueDocumentsSection venueId={venue.id} canWrite={canWrite} readOnly />
          </div>
        </>
      )}

      <ScheduleItemDetailSheet
        item={detailItem}
        locale={locale}
        onClose={() => setDetailItem(null)}
        onEdit={(item) => setSelectedItem(item)}
      />

      <EditItemSheet
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        venues={venues ?? []}
        people={people ?? []}
      />

      <NewBookingDialog
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        venues={venues ?? []}
        people={people ?? []}
        initialValues={{ venueId: venue?.id, type: "venue_booking" }}
      />
    </div>
  );
}
