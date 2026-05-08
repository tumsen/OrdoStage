import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { invalidateWorkAnnouncementBar } from "@/lib/invalidateWorkAnnouncementBar";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import type { EventDetail, InternalBookingDetail, Venue, Person, TourDetail } from "../../../backend/src/types";
import {
  ScheduleFilters,
  type ScheduleViewMode,
  type VisibilityFilters,
} from "@/components/schedule/ScheduleFilters";
import { CalendarGrid } from "@/components/schedule/CalendarGrid";
import { ItemDetailSheet as _ItemDetailSheet } from "@/components/schedule/ItemDetailSheet"; // unused, kept for reference
import { EditItemSheet } from "@/components/schedule/EditItemSheet";
import { NewBookingDialog } from "@/components/schedule/NewBookingDialog";
import { ScheduleLegend } from "@/components/schedule/ScheduleLegend";
import {
  toCalendarItems,
  formatMonthLabel,
  itemsForDay,
  toDatetimeLocalValue,
} from "@/components/schedule/scheduleUtils";
import type { CalendarItem } from "@/components/schedule/scheduleUtils";
import { OutlookTimeGrid } from "@/components/schedule/OutlookTimeGrid";
import { toast } from "@/hooks/use-toast";
import { usePreferences } from "@/hooks/usePreferences";

interface ScheduleData {
  events: EventDetail[];
  bookings: InternalBookingDetail[];
  tours: TourDetail[];
}

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const dow = (d.getDay() + 6) % 7; // Monday-based
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function getRange(mode: ScheduleViewMode, anchorDate: Date): { from: string; to: string } {
  if (mode === "year" || mode === "yeardisc") {
    const y = anchorDate.getFullYear();
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  if (mode === "month") {
    const y = anchorDate.getFullYear();
    const m = anchorDate.getMonth();
    const from = new Date(y, m, 1);
    const to = new Date(y, m + 1, 0);
    return { from: toISODate(from), to: toISODate(to) };
  }
  if (mode === "week") {
    const fromDate = startOfWeek(anchorDate);
    const toDate = addDays(fromDate, 6);
    return { from: toISODate(fromDate), to: toISODate(toDate) };
  }
  if (mode === "day") {
    return { from: toISODate(anchorDate), to: toISODate(anchorDate) };
  }
  if (mode === "venueocc") {
    const fromDate = startOfWeek(anchorDate);
    const toDate = addDays(fromDate, 6);
    return { from: toISODate(fromDate), to: toISODate(toDate) };
  }
  const fromDate = new Date(anchorDate);
  const toDate = addDays(fromDate, 6);
  return { from: toISODate(fromDate), to: toISODate(toDate) };
}

function rangeLabel(mode: ScheduleViewMode, date: Date, locale: string): string {
  if (mode === "year") return String(date.getFullYear());
  if (mode === "yeardisc") return `Year Disc ${date.getFullYear()}`;
  if (mode === "month") return formatMonthLabel(date.getFullYear(), date.getMonth());
  if (mode === "week") {
    const fromDate = startOfWeek(date);
    const toDate = addDays(fromDate, 6);
    return `${fromDate.toLocaleDateString(locale, { month: "short", day: "numeric" })} - ${toDate.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  if (mode === "day") {
    return date.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  if (mode === "venueocc") {
    const fromDate = startOfWeek(date);
    const toDate = addDays(fromDate, 6);
    return `Venue occupation (${fromDate.toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
    })} - ${toDate.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })})`;
  }
  const toDate = addDays(date, 6);
  return `Next 7 days (${date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  })} - ${toDate.toLocaleDateString(locale, { month: "short", day: "numeric" })})`;
}

function getRangeDays(mode: ScheduleViewMode, anchorDate: Date): Date[] {
  if (mode === "week") {
    const start = startOfWeek(anchorDate);
    return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
  }
  if (mode === "next7") {
    return Array.from({ length: 7 }).map((_, i) => addDays(anchorDate, i));
  }
  return [anchorDate];
}

type OccupancyEntry = {
  itemId: string;
  title: string;
  kind: "event" | "booking" | "job";
  status?: string;
  start: Date;
  end: Date;
};

function resolveItemVenue(item: CalendarItem): { id: string; name: string } | null {
  if (item.id.startsWith("tour:")) return null;
  if (item.kind === "booking") {
    const booking = item.raw as InternalBookingDetail;
    if (!booking.venueId || !booking.venue?.name) return null;
    return { id: booking.venueId, name: booking.venue.name };
  }

  if (item.kind === "job") {
    const event = item.raw as EventDetail;
    const jm = /:job:([^:]+)$/.exec(item.id);
    if (!jm) return null;
    for (const s of event.shows ?? []) {
      const job = s.jobs?.find((j) => j.id === jm[1]);
      if (job?.venueId && job.venue?.name) return { id: job.venueId, name: job.venue.name };
    }
    return null;
  }

  const event = item.raw as EventDetail;
  const showMatch = /:show:([^:]+)$/.exec(item.id);
  if (showMatch?.[1]) {
    const show = (event.shows ?? []).find((s) => s.id === showMatch[1]);
    if (show?.venueId && show.venue?.name) return { id: show.venueId, name: show.venue.name };
  }

  if (event.venueId && event.venue?.name) return { id: event.venueId, name: event.venue.name };
  return null;
}

function backingVenueBookingFor(item: CalendarItem, candidates: CalendarItem[]): CalendarItem | null {
  if (item.kind !== "event") return null;
  const eventId = (item.raw as EventDetail).id;
  const itemStart = new Date(item.startDate);
  const itemEnd = item.endDate ? new Date(item.endDate) : new Date(itemStart.getTime() + 60 * 60 * 1000);
  if (!Number.isFinite(itemStart.getTime()) || !Number.isFinite(itemEnd.getTime())) return null;

  return (
    candidates.find((candidate) => {
      if (candidate.renderBehind !== true || candidate.kind !== "booking") return false;
      const booking = candidate.raw as InternalBookingDetail & { eventId?: string | null };
      if (booking.eventId !== eventId) return false;
      const bookingStart = new Date(candidate.startDate);
      const bookingEnd = candidate.endDate
        ? new Date(candidate.endDate)
        : new Date(bookingStart.getTime() + 60 * 60 * 1000);
      if (!Number.isFinite(bookingStart.getTime()) || !Number.isFinite(bookingEnd.getTime())) return false;
      return bookingStart.getTime() < itemEnd.getTime() && bookingEnd.getTime() > itemStart.getTime();
    }) ?? null
  );
}

function VenueOccupationView({
  items,
  venues,
  locale,
  venueFilterId,
}: {
  items: CalendarItem[];
  venues: Venue[];
  locale: string;
  venueFilterId: string;
}) {
  const byVenue = new Map<string, { name: string; entries: OccupancyEntry[] }>();

  for (const item of items) {
    if (!item.startDate) continue;
    const venue = resolveItemVenue(item);
    if (!venue) continue;
    if (venueFilterId !== "all" && venue.id !== venueFilterId) continue;

    const start = new Date(item.startDate);
    const end = item.endDate ? new Date(item.endDate) : new Date(start.getTime() + 60 * 60 * 1000);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) continue;

    const current = byVenue.get(venue.id) ?? { name: venue.name, entries: [] };
    current.entries.push({
      itemId: item.id,
      title: item.title,
      kind: item.kind,
      status: item.status,
      start,
      end,
    });
    byVenue.set(venue.id, current);
  }

  const selectedVenueOnly =
    venueFilterId !== "all" ? venues.find((v) => v.id === venueFilterId) ?? null : null;

  const venueRows =
    selectedVenueOnly
      ? [{
          id: selectedVenueOnly.id,
          name: selectedVenueOnly.name,
          entries: (byVenue.get(selectedVenueOnly.id)?.entries ?? []).sort(
            (a, b) => a.start.getTime() - b.start.getTime()
          ),
        }]
      : Array.from(byVenue.entries())
          .map(([id, value]) => ({
            id,
            name: value.name,
            entries: value.entries.sort((a, b) => a.start.getTime() - b.start.getTime()),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

  if (venueRows.length === 0) {
    return <div className="text-sm text-white/50">No venue occupation found in this range.</div>;
  }

  return (
    <div className="space-y-3">
      {venueRows.map((venue) => (
        <div key={venue.id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <div className="text-sm font-semibold text-white/90">{venue.name}</div>
          <div className="text-xs text-white/40 mb-2">{venue.entries.length} occupied slot(s)</div>
          {venue.entries.length === 0 ? (
            <div className="text-xs text-white/40 italic">No occupation in selected range.</div>
          ) : (
            <div className="space-y-1.5">
              {venue.entries.map((entry) => (
                <div key={entry.itemId} className="text-xs text-white/75 rounded border border-white/10 bg-white/[0.02] px-2 py-1.5">
                  <span className="font-medium text-white/90">
                    {entry.start.toLocaleDateString(locale, {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}{" "}
                    {entry.start.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}-
                    {entry.end.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="text-white/40"> | </span>
                  <span>{entry.title}</span>
                  <span className="text-white/40"> ({entry.kind})</span>
                  {entry.status ? <span className="text-white/40"> [{entry.status}]</span> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function YearDiscView({ year, items }: { year: number; items: CalendarItem[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 12 }).map((_, month) => {
        const end = new Date(year, month + 1, 0);
        const daysInMonth = end.getDate();
        let occupiedDays = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const date = new Date(year, month, d);
          if (itemsForDay(items, date).length > 0) occupiedDays += 1;
        }
        const pct = Math.round((occupiedDays / daysInMonth) * 100);
        const radius = 32;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (pct / 100) * circumference;

        return (
          <div key={month} className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <div className="text-xs text-white/50 mb-2">{formatMonthLabel(year, month)}</div>
            <div className="flex items-center gap-4">
              <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90">
                <circle cx="42" cy="42" r={radius} stroke="rgba(255,255,255,0.12)" strokeWidth="8" fill="none" />
                <circle
                  cx="42"
                  cy="42"
                  r={radius}
                  stroke="rgba(244,63,94,0.95)"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                />
              </svg>
              <div>
                <div className="text-2xl font-semibold text-white">{pct}%</div>
                <div className="text-xs text-white/40">
                  {occupiedDays}/{daysInMonth} days occupied
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Schedule() {
  const queryClient = useQueryClient();
  const { effective } = usePreferences();
  const locale =
    effective?.language === "da"
      ? "da-DK"
      : effective?.language === "de"
        ? "de-DE"
        : "en-US";
  const today = new Date();
  const [anchorDate, setAnchorDate] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [viewMode, setViewMode] = useState<ScheduleViewMode>("week");
  const [venueId, setVenueId] = useState("all");
  const [personId, setPersonId] = useState("all");
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<{ startDate: string; endDate: string } | null>(null);
  const [visibility, setVisibility] = useState<VisibilityFilters>({
    event: true,
    rehearsal: true,
    maintenance: true,
    private: true,
    venue_booking: true,
    other: true,
  });

  const deleteBookingMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/bookings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      void invalidateWorkAnnouncementBar(queryClient);
      toast({ title: "Booking deleted" });
    },
    onError: () => toast({ title: "Failed to delete booking", variant: "destructive" }),
  });

  function handleItemClick(item: CalendarItem) {
    if (item.id.startsWith("tour:")) return;
    setSelectedItem(item);
  }

  function handleDeleteItem(item: CalendarItem) {
    if (item.id.startsWith("tour:")) return;
    if (item.kind === "job") return;
    if (item.kind === "event") {
      const rawEvent = item.raw as EventDetail;
      const eventId = rawEvent.id;
      if (!confirmDeleteAction(`event "${item.title}"`)) return;
      api.delete(`/api/events/${eventId}`).then(() => {
        queryClient.invalidateQueries({ queryKey: ["schedule"] });
        void invalidateWorkAnnouncementBar(queryClient);
        toast({ title: "Event deleted" });
      }).catch(() => toast({ title: "Failed to delete event", variant: "destructive" }));
    } else {
      if (!confirmDeleteAction(`booking "${item.title}"`)) return;
      deleteBookingMutation.mutate(item.id);
    }
  }

  const { from, to } = getRange(viewMode, anchorDate);

  // Build query string
  const params = new URLSearchParams({ from, to });
  if (venueId !== "all") params.set("venueId", venueId);
  if (personId !== "all") params.set("personId", personId);

  const { data: scheduleData, isLoading } = useQuery({
    queryKey: ["schedule", { venueId, personId, viewMode, from, to }],
    queryFn: () => api.get<ScheduleData>(`/api/schedule?${params.toString()}`),
  });

  const { data: venues } = useQuery({
    queryKey: ["venues"],
    queryFn: () => api.get<Venue[]>("/api/venues"),
  });

  const { data: people } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<Person[]>("/api/people"),
  });

  const items: CalendarItem[] = scheduleData
    ? toCalendarItems(scheduleData.events, scheduleData.bookings, scheduleData.tours ?? [], {
        personIdFilter: personId !== "all" ? personId : undefined,
      })
    : [];

  const visibleItems = items.filter((item) => {
    if (item.kind === "event") return visibility.event;
    if (item.kind === "job") return visibility.event;
    if (item.type === "rehearsal") return visibility.rehearsal;
    if (item.type === "maintenance") return visibility.maintenance;
    if (item.type === "private") return visibility.private;
    if (item.type === "venue_booking") return visibility.venue_booking;
    return visibility.other;
  });

  function moveBackward() {
    if (viewMode === "year" || viewMode === "yeardisc") setAnchorDate((d) => addYears(d, -1));
    else if (viewMode === "month") setAnchorDate((d) => addMonths(d, -1));
    else if (viewMode === "week" || viewMode === "next7" || viewMode === "venueocc") setAnchorDate((d) => addDays(d, -7));
    else setAnchorDate((d) => addDays(d, -1));
  }

  function moveForward() {
    if (viewMode === "year" || viewMode === "yeardisc") setAnchorDate((d) => addYears(d, 1));
    else if (viewMode === "month") setAnchorDate((d) => addMonths(d, 1));
    else if (viewMode === "week" || viewMode === "next7" || viewMode === "venueocc") setAnchorDate((d) => addDays(d, 7));
    else setAnchorDate((d) => addDays(d, 1));
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 md:p-6">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between shrink-0">
        <ScheduleFilters
          venues={venues ?? []}
          people={people ?? []}
          viewMode={viewMode}
          visibility={visibility}
          venueId={venueId}
          personId={personId}
          onVenueChange={setVenueId}
          onPersonChange={setPersonId}
          onViewModeChange={setViewMode}
          onVisibilityChange={(key, value) => setVisibility((prev) => ({ ...prev, [key]: value }))}
        />
        <Button
          onClick={() => {
            setBookingSlot(null);
            setBookingOpen(true);
          }}
          className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-2 flex-shrink-0"
        >
          <Plus size={14} />
          New Booking
        </Button>
      </div>

      {/* Calendar navigation */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/5"
            onClick={moveBackward}
          >
            <ChevronLeft size={16} />
          </Button>
          <h2 className="text-base font-semibold text-white/90 min-w-[160px] text-center">
            {rangeLabel(viewMode, anchorDate, locale)}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/5"
            onClick={moveForward}
          >
            <ChevronRight size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-white/40 hover:text-white/70 hover:bg-white/5 ml-1"
            onClick={() => {
              setAnchorDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
            }}
          >
            Today
          </Button>
        </div>

        <ScheduleLegend />
      </div>

      {/* Calendar */}
      <div className="min-h-0 flex-1 overflow-hidden bg-white/[0.02] border border-white/[0.07] rounded-xl p-3 md:p-4">
        {isLoading ? (
          <div className="h-full overflow-auto space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg bg-white/5" />
            ))}
          </div>
        ) : (
          <>
            {viewMode === "year" ? (
              <div className="h-full overflow-auto grid grid-cols-1 xl:grid-cols-2 gap-4 pr-1">
                {Array.from({ length: 12 }).map((_, m) => (
                  <div key={m} className="rounded-lg border border-white/10 p-2">
                    <div className="text-xs text-white/40 mb-2 px-1">
                      {formatMonthLabel(anchorDate.getFullYear(), m)}
                    </div>
                    <CalendarGrid
                      year={anchorDate.getFullYear()}
                      month={m}
                      items={visibleItems}
                      onItemClick={handleItemClick}
                    />
                  </div>
                ))}
              </div>
            ) : viewMode === "yeardisc" ? (
              <div className="h-full overflow-auto pr-1">
                <YearDiscView year={anchorDate.getFullYear()} items={visibleItems} />
              </div>
            ) : viewMode === "month" ? (
              <div className="h-full overflow-auto pr-1">
                <CalendarGrid
                  year={anchorDate.getFullYear()}
                  month={anchorDate.getMonth()}
                  items={visibleItems}
                  onItemClick={handleItemClick}
                />
              </div>
            ) : viewMode === "week" || viewMode === "day" ? (
              <div className="flex h-full min-h-0 flex-col">
                <OutlookTimeGrid
                  className="min-h-0 flex-1"
                  days={getRangeDays(viewMode, anchorDate)}
                  items={visibleItems}
                  onItemClick={handleItemClick}
                  onDeleteItem={handleDeleteItem}
                  onSelectTimeRange={(start, end) => {
                    setBookingSlot({
                      startDate: toDatetimeLocalValue(start),
                      endDate: toDatetimeLocalValue(end),
                    });
                    setBookingOpen(true);
                  }}
                />
              </div>
            ) : viewMode === "venueocc" ? (
              <div className="h-full overflow-auto pr-1">
                <VenueOccupationView
                  items={visibleItems}
                  venues={venues ?? []}
                  locale={locale}
                  venueFilterId={venueId}
                />
              </div>
            ) : (
              <div className="h-full overflow-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pr-1">
                {getRangeDays(viewMode, anchorDate).map((date) => {
                  const dayItems = itemsForDay(visibleItems, date);
                  const backingItems = dayItems.filter((item) => item.renderBehind === true);
                  const foregroundItems = dayItems.filter((item) => item.renderBehind !== true);
                  return (
                    <div key={date.toISOString()} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                      <div className="text-xs text-white/40 mb-2">
                        {date.toLocaleDateString(locale, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                      {foregroundItems.length === 0 ? (
                        <div className="text-xs text-white/25 italic">No items</div>
                      ) : (
                        <div className="space-y-1">
                          {foregroundItems.map((item) => {
                            const backing = backingVenueBookingFor(item, backingItems);
                            return (
                              <button
                                key={item.id}
                                onClick={() => setSelectedItem(item)}
                                className={`relative w-full overflow-hidden text-left text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/80 ${
                                  backing ? "ring-2 ring-rose-300/70 shadow-[0_0_0_2px_rgba(244,63,94,0.22)]" : ""
                                }`}
                                title={backing ? `${item.title} · venue booked` : item.title}
                              >
                                {backing ? (
                                  <span className="absolute inset-0 bg-rose-500/20 pointer-events-none" aria-hidden="true" />
                                ) : null}
                                <span className="relative">{item.title}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit sheet — slides in from right for events and bookings */}
      <EditItemSheet
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        venues={venues ?? []}
        people={people ?? []}
      />

      {/* New booking dialog */}
      <NewBookingDialog
        open={bookingOpen}
        onClose={() => {
          setBookingOpen(false);
          setBookingSlot(null);
        }}
        initialSlot={bookingSlot}
        venues={venues ?? []}
        people={people ?? []}
      />
    </div>
  );
}
