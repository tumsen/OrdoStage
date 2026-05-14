import { useLayoutEffect, useMemo, useRef, useState } from "react";
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
  toDatetimeLocalValue,
} from "@/components/schedule/scheduleUtils";
import type { CalendarItem } from "@/components/schedule/scheduleUtils";
import { CALENDAR_PANEL_FLEX_COLUMN_CLASS, CALENDAR_PANEL_SHELL_CLASS } from "@/lib/weekGridColumns";
import { ScheduleItemDetailSheet } from "@/components/schedule/ScheduleItemDetailSheet";
import { EditItemSheet } from "@/components/schedule/EditItemSheet";
import { NewBookingDialog } from "@/components/schedule/NewBookingDialog";
import { VenueCalendarContextStrip } from "@/components/venue/VenueCalendarContextStrip";
import { useIsMobile } from "@/hooks/use-mobile";
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

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function next31DayStrip(from: Date): Date[] {
  return Array.from({ length: 31 }, (_, i) => addDays(from, i));
}

function formatDayRangeLabel(start: Date, end: Date, locale: string): string {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const optsShort: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const optsWithYear: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  const a = start.toLocaleDateString(locale, sameMonth ? optsShort : optsWithYear);
  const b = end.toLocaleDateString(locale, optsWithYear);
  return `${a} – ${b}`;
}

type VenueBookingCalendarView = "month" | "next31";

const SIDEBAR_USER_BLOCK_SELECTOR = "[data-ordo-sidebar-user-block]";
const CALENDAR_SHELL_MIN_HEIGHT_PX = 200;

export default function VenueDetail() {
  const { id: venueId = "" } = useParams<{ id: string }>();
  const isMobile = useIsMobile();
  const { canWrite } = usePermissions();
  const { effective } = usePreferences();
  const calendarShellRef = useRef<HTMLDivElement>(null);
  const [calendarShellHeightPx, setCalendarShellHeightPx] = useState<number | null>(null);
  const locale =
    effective?.language === "da" ? "da-DK" : effective?.language === "de" ? "de-DE" : "en-US";

  const [anchorMonth, setAnchorMonth] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [calendarView, setCalendarView] = useState<VenueBookingCalendarView>("month");
  const [next31Start, setNext31Start] = useState(() => startOfLocalDay(new Date()));
  const [detailItem, setDetailItem] = useState<CalendarItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<{ startDate: string; endDate: string } | null>(null);

  const { from, to } = useMemo(() => {
    if (calendarView === "month") return monthRangeISO(anchorMonth);
    const start = next31Start;
    return { from: toISODate(start), to: toISODate(addDays(start, 30)) };
  }, [calendarView, anchorMonth, next31Start]);

  const gridDays = useMemo(() => {
    if (calendarView === "month") return getMonthCalendarDays(anchorMonth);
    return next31DayStrip(next31Start);
  }, [calendarView, anchorMonth, next31Start]);

  const { data: venue, isLoading: venueLoading, isError: venueError } = useQuery({
    queryKey: ["venue", venueId],
    queryFn: () => api.get<Venue>(`/api/venues/${venueId}`),
    enabled: Boolean(venueId),
  });

  const { data: scheduleData, isLoading: scheduleLoading } = useQuery({
    queryKey: ["schedule", "venue-detail", venueId, calendarView, from, to],
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

  useLayoutEffect(() => {
    if (!venueId || isMobile) {
      setCalendarShellHeightPx(null);
      return;
    }

    const measure = () => {
      const shell = calendarShellRef.current;
      const divider = document.querySelector<HTMLElement>(SIDEBAR_USER_BLOCK_SELECTOR);
      if (!shell || !divider || venueLoading || !venue) {
        setCalendarShellHeightPx(null);
        return;
      }
      const shellTop = shell.getBoundingClientRect().top;
      const dividerTop = divider.getBoundingClientRect().top;
      // Base span = distance from shell top to sidebar user divider; calendar uses 2× that height.
      const spanPx = Math.floor(dividerTop - shellTop);
      const heightPx = spanPx * 2;
      if (spanPx < CALENDAR_SHELL_MIN_HEIGHT_PX / 2 || heightPx > 16_000) {
        setCalendarShellHeightPx(null);
        return;
      }
      setCalendarShellHeightPx(Math.max(CALENDAR_SHELL_MIN_HEIGHT_PX, heightPx));
    };

    measure();

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(measure);
    });
    ro.observe(document.documentElement);

    const shellEl = calendarShellRef.current;
    if (shellEl) ro.observe(shellEl);

    const dividerEl = document.querySelector<HTMLElement>(SIDEBAR_USER_BLOCK_SELECTOR);
    if (dividerEl) ro.observe(dividerEl);

    const scrollEl = document.querySelector<HTMLElement>("[data-ordo-main-scroll]");
    scrollEl?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      scrollEl?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [isMobile, venueId, venueLoading, venue, scheduleLoading, calendarView]);

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
    <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-hidden p-4 md:p-6">
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-3">
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
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <Skeleton className="h-8 w-64 shrink-0 bg-white/5" />
          <Skeleton className="min-h-0 flex-1 w-full rounded-xl border border-white/10 bg-white/5" />
        </div>
      ) : (
        <>
          {/* Booking calendar uses all space above the strip so fitHoursVertically can fill one viewport band. */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <h2 className="text-sm font-semibold text-white/90 shrink-0">Bookings</h2>
              <div className="flex rounded-lg border border-white/10 p-0.5 bg-white/[0.03]">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`h-7 px-2.5 text-xs ${calendarView === "month" ? "bg-white/10 text-white" : "text-white/60 hover:text-white"}`}
                  onClick={() => setCalendarView("month")}
                >
                  Month
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`h-7 px-2.5 text-xs ${calendarView === "next31" ? "bg-white/10 text-white" : "text-white/60 hover:text-white"}`}
                  onClick={() => {
                    setNext31Start(startOfLocalDay(new Date()));
                    setCalendarView("next31");
                  }}
                >
                  Next 31 days
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {calendarView === "month" ? (
                <>
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
                    {formatMonthLabel(anchorMonth.getFullYear(), anchorMonth.getMonth())}
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
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 border-white/10 bg-white/5 text-white"
                    onClick={() => setNext31Start((d) => addDays(d, -7))}
                    aria-label="Previous week"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span
                    className="text-xs text-white/50 tabular-nums min-w-[11rem] text-center max-w-[min(100%,14rem)] truncate"
                    title={formatDayRangeLabel(next31Start, addDays(next31Start, 30), locale)}
                  >
                    {formatDayRangeLabel(next31Start, addDays(next31Start, 30), locale)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 border-white/10 bg-white/5 text-white"
                    onClick={() => setNext31Start((d) => addDays(d, 7))}
                    aria-label="Next week"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-white/50 hover:text-white hover:bg-white/5"
                onClick={() => {
                  const t = new Date();
                  if (calendarView === "month") {
                    setAnchorMonth(new Date(t.getFullYear(), t.getMonth(), 1));
                  } else {
                    setNext31Start(startOfLocalDay(t));
                  }
                }}
              >
                Today
              </Button>
              {canWrite ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-1.5 sm:ml-1"
                  onClick={() => setBookingOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Booking
                </Button>
              ) : null}
            </div>
          </div>

          <div
            ref={calendarShellRef}
            className={`${CALENDAR_PANEL_SHELL_CLASS} min-h-0 ${
              calendarShellHeightPx != null ? "shrink-0" : "flex-1"
            }`}
            style={calendarShellHeightPx != null ? { height: calendarShellHeightPx } : undefined}
          >
            <div className={CALENDAR_PANEL_FLEX_COLUMN_CLASS}>
              {scheduleLoading ? (
                <Skeleton className="min-h-0 flex-1 w-full bg-white/5 rounded-xl border border-white/10" />
              ) : (
                <OutlookTimeGrid
                  className="min-h-0 flex-1"
                  days={gridDays}
                  items={calendarItems}
                  onItemClick={(item) => setDetailItem(item)}
                  readOnly
                  compactDayHeaders
                  fitHoursVertically
                  rejectCreateDragWhenOverlapping={canWrite}
                  onSelectTimeRange={
                    canWrite
                      ? (start, end) => {
                          setBookingSlot({
                            startDate: toDatetimeLocalValue(start),
                            endDate: toDatetimeLocalValue(end),
                          });
                          setBookingOpen(true);
                        }
                      : undefined
                  }
                />
              )}
            </div>
          </div>
          </div>

          <div className="max-h-[min(38svh,22rem)] min-h-0 shrink-0 overflow-x-hidden overflow-y-auto">
            <VenueCalendarContextStrip
              venueId={venueId}
              venue={venue}
              showEditLink={canWrite}
              archiveFolderName={venue?.name}
            />
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
        onClose={() => {
          setBookingOpen(false);
          setBookingSlot(null);
        }}
        initialSlot={bookingSlot}
        venues={venues ?? []}
        people={people ?? []}
        fixedVenueId={venueId}
        fixedVenueName={venue?.name}
        fixedBookingType="venue_booking"
      />
    </div>
  );
}
