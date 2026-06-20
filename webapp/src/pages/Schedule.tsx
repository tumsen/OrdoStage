import { useMemo, useState, useEffect } from "react";
import { usePersistedViewMode } from "@/hooks/usePersistedViewMode";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { invalidateWorkAnnouncementBar } from "@/lib/invalidateWorkAnnouncementBar";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import type {
  EventDetail,
  InternalBookingDetail,
  Person,
  TimeReport,
  TourDetail,
  Venue,
} from "../../../backend/src/types";
import {
  ScheduleFilters,
  ScheduleViewModeSelect,
  type ScheduleViewMode,
  type VisibilityFilters,
} from "@/components/schedule/ScheduleFilters";
import { CalendarGrid } from "@/components/schedule/CalendarGrid";
import { NewBookingDialog } from "@/components/schedule/NewBookingDialog";
import { ScheduleItemDetailSheet } from "@/components/schedule/ScheduleItemDetailSheet";
import { ScheduleLegend } from "@/components/schedule/ScheduleLegend";
import { DateInputWithWeekday } from "@/components/DateInputWithWeekday";
import {
  toCalendarItems,
  formatMonthLabel,
  itemsForDay,
  toDatetimeLocalValue,
  calendarItemVenueName,
  calendarItemTimeRangeLabel,
  calendarVenueBookingSummaryLine,
  backingVenueBookingForEvent,
  orphanBackingVenueBookings,
  passesScheduleVisibilityFilters,
} from "@/components/schedule/scheduleUtils";
import type { CalendarItem } from "@/components/schedule/scheduleUtils";
import { OutlookTimeGrid } from "@/components/schedule/OutlookTimeGrid";
import { YearDiscEntityFilters } from "@/components/schedule/YearDiscEntityFilters";
import { YearDiscViewPicker } from "@/components/schedule/YearDiscViewPicker";
import { YearDiscRangeEditor } from "@/components/schedule/YearDiscRangeEditor";
import { YearDiscView } from "@/components/schedule/YearDiscView";
import {
  DEFAULT_YEAR_DISC_RANGE,
  filterCalendarItemsForYearDisc,
  ringUsesTimeData,
  yearDiscFetchRange,
} from "@/components/schedule/yearDiscConfig";
import { usePermissions } from "@/hooks/usePermissions";
import { usePersistedYearDiscViews } from "@/hooks/usePersistedYearDiscViews";
import { CALENDAR_PANEL_FLEX_COLUMN_CLASS, CALENDAR_PANEL_SHELL_CLASS } from "@/lib/weekGridColumns";
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

function dateFromISODate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isFinite(d.getTime()) ? d : null;
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
  kind: "event" | "booking" | "job" | "tour";
  status?: string;
  start: Date;
  end: Date;
};

function resolveItemVenue(item: CalendarItem): { id: string; name: string } | null {
  if (item.id.startsWith("tour:")) return null;
  if (item.kind === "summary") return null;
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
    if (item.kind === "summary") continue;
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

const SCHEDULE_VIEW_MODES = [
  "year",
  "yeardisc",
  "month",
  "week",
  "day",
  "next7",
  "venueocc",
] as const satisfies readonly ScheduleViewMode[];

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
  const [viewMode, setViewMode] = usePersistedViewMode(
    "ordo.viewMode.schedule",
    SCHEDULE_VIEW_MODES,
    "week",
  );
  const [venueId, setVenueId] = useState("all");
  const [personId, setPersonId] = useState("all");
  const [detailItem, setDetailItem] = useState<CalendarItem | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingSlot, setBookingSlot] = useState<{ startDate: string; endDate: string } | null>(null);
  const [visibility, setVisibility] = useState<VisibilityFilters>({
    event: true,
    tour: true,
    rehearsal: true,
    private: true,
    maintenance: true,
    venue_booking: true,
    other: true,
  });
  const {
    activeView: yearDiscView,
    views: yearDiscViews,
    setConfig: setYearDiscConfig,
    setFilters: setYearDiscFilters,
    selectView: selectYearDiscView,
    saveAs: saveYearDiscViewAs,
    renameView: renameYearDiscView,
    deleteView: deleteYearDiscView,
  } = usePersistedYearDiscViews();
  const yearDiscConfig = yearDiscView.config;

  useEffect(() => {
    if (viewMode !== "yeardisc") return;
    setVenueId(yearDiscView.filters.venueId);
  }, [viewMode, yearDiscView.id, yearDiscView.filters.venueId]);
  const { canView, canAction } = usePermissions();
  const canReadAllTime = canAction("time.read_all");

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
    setDetailItem(item);
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

  const { from, to } =
    viewMode === "yeardisc"
      ? yearDiscFetchRange(yearDiscConfig.range ?? { mode: "calendar_year" }, anchorDate.getFullYear())
      : getRange(viewMode, anchorDate);

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

  const items: CalendarItem[] = useMemo(
    () =>
      scheduleData
        ? toCalendarItems(scheduleData.events, scheduleData.bookings, scheduleData.tours ?? [], {
            personIdFilter: personId !== "all" ? personId : undefined,
          })
        : [],
    [scheduleData, personId]
  );

  const visibleItems = items.filter((item) => passesScheduleVisibilityFilters(visibility, item));
  const yearDiscItems = useMemo(() => {
    if (viewMode !== "yeardisc") return visibleItems;
    return filterCalendarItemsForYearDisc(items, {
      eventId: yearDiscView.filters.eventId,
      tourId: yearDiscView.filters.tourId,
    });
  }, [viewMode, items, visibleItems, yearDiscView.filters.eventId, yearDiscView.filters.tourId]);

  const yearDiscNeedsTime = useMemo(
    () => viewMode === "yeardisc" && yearDiscConfig.rings.some((ring) => ringUsesTimeData(ring.source)),
    [viewMode, yearDiscConfig]
  );

  const { data: yearDiscTimeReport } = useQuery({
    queryKey: ["time-report", "year-disc", from, to, personId],
    queryFn: () => {
      const params = new URLSearchParams({ from, to });
      if (personId !== "all") params.set("personIds", personId);
      return api.get<TimeReport>(`/api/time/report?${params.toString()}`);
    },
    enabled: yearDiscNeedsTime && canView("time") && canReadAllTime,
  });

  const yearDiscRangeMode = yearDiscConfig.range?.mode ?? "calendar_year";

  function moveBackward() {
    if (viewMode === "yeardisc" && yearDiscRangeMode === "calendar_year") setAnchorDate((d) => addYears(d, -1));
    else if (viewMode === "year") setAnchorDate((d) => addYears(d, -1));
    else if (viewMode === "month") setAnchorDate((d) => addMonths(d, -1));
    else if (viewMode === "week" || viewMode === "next7" || viewMode === "venueocc") setAnchorDate((d) => addDays(d, -7));
    else setAnchorDate((d) => addDays(d, -1));
  }

  function moveForward() {
    if (viewMode === "yeardisc" && yearDiscRangeMode === "calendar_year") setAnchorDate((d) => addYears(d, 1));
    else if (viewMode === "year") setAnchorDate((d) => addYears(d, 1));
    else if (viewMode === "month") setAnchorDate((d) => addMonths(d, 1));
    else if (viewMode === "week" || viewMode === "next7" || viewMode === "venueocc") setAnchorDate((d) => addDays(d, 7));
    else setAnchorDate((d) => addDays(d, 1));
  }

  const isYearDisc = viewMode === "yeardisc";

  function handleViewModeChange(nextMode: ScheduleViewMode) {
    setViewMode(nextMode);
    if (nextMode === "next7") {
      const now = new Date();
      setAnchorDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    }
  }

  return (
    <div
      className={
        isYearDisc
          ? "app-page-fill md:app-page-fill flex min-h-0 w-full flex-1 flex-col gap-2 overflow-hidden p-3 md:p-4 max-md:app-page-fill-mobile"
          : "app-page-fill md:app-page-fill flex flex-col gap-3 p-3 md:p-4 max-md:app-page-fill-mobile"
      }
    >
      {isYearDisc ? (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto">
          <ScheduleViewModeSelect viewMode={viewMode} onViewModeChange={handleViewModeChange} />
          <span className="h-4 w-px shrink-0 bg-white/10" aria-hidden="true" />
          <YearDiscViewPicker
            views={yearDiscViews}
            activeViewId={yearDiscView.id}
            onSelect={(viewId) => {
              const view = yearDiscViews.find((v) => v.id === viewId);
              selectYearDiscView(viewId);
              if (view) setVenueId(view.filters.venueId);
            }}
            onSaveAs={saveYearDiscViewAs}
            onRename={renameYearDiscView}
            onDelete={(viewId) => {
              if (yearDiscViews.length <= 1) return;
              const remaining = yearDiscViews.filter((v) => v.id !== viewId);
              const nextActive =
                yearDiscView.id === viewId ? remaining[0]! : yearDiscView;
              deleteYearDiscView(viewId);
              if (yearDiscView.id === viewId) setVenueId(nextActive.filters.venueId);
            }}
          />
          <YearDiscRangeEditor
            range={yearDiscConfig.range ?? DEFAULT_YEAR_DISC_RANGE}
            calendarYear={anchorDate.getFullYear()}
            onRangeChange={(range) => setYearDiscConfig({ ...yearDiscConfig, range })}
            onCalendarYearChange={(year) =>
              setAnchorDate(new Date(year, anchorDate.getMonth(), anchorDate.getDate()))
            }
          />
          <YearDiscEntityFilters
            venues={venues ?? []}
            events={scheduleData?.events ?? []}
            tours={scheduleData?.tours ?? []}
            venueId={venueId}
            eventId={yearDiscView.filters.eventId}
            tourId={yearDiscView.filters.tourId}
            onVenueChange={(id) => {
              setVenueId(id);
              setYearDiscFilters({ venueId: id });
            }}
            onEventChange={(id) => setYearDiscFilters({ eventId: id })}
            onTourChange={(id) => setYearDiscFilters({ tourId: id })}
          />
          <div className="flex-1 min-w-2" />
          <Button
            onClick={() => {
              setBookingSlot(null);
              setBookingOpen(true);
            }}
            className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-2 shrink-0 h-8"
          >
            <Plus size={14} />
            New Booking
          </Button>
        </div>
      ) : (
        <>
          {/* Top bar */}
          <div className="flex shrink-0 items-start gap-2">
            <ScheduleViewModeSelect viewMode={viewMode} onViewModeChange={handleViewModeChange} />
            <ScheduleFilters
              venues={venues ?? []}
              people={people ?? []}
              viewMode={viewMode}
              visibility={visibility}
              venueId={venueId}
              personId={personId}
              hideViewMode
              onVenueChange={setVenueId}
              onPersonChange={setPersonId}
              onViewModeChange={handleViewModeChange}
              onVisibilityChange={(key, value) => setVisibility((prev) => ({ ...prev, [key]: value }))}
            />
            <div className="flex-1 min-w-2" />
            <Button
              onClick={() => {
                setBookingSlot(null);
                setBookingOpen(true);
              }}
              className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-2 shrink-0 h-8"
            >
              <Plus size={14} />
              New Booking
            </Button>
          </div>

          {/* Calendar navigation */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/5"
                onClick={moveBackward}
                aria-label="Previous"
              >
                <ChevronLeft size={16} />
              </Button>
              <DateInputWithWeekday
                value={toISODate(anchorDate)}
                onChange={(value) => {
                  const next = dateFromISODate(value);
                  if (next) setAnchorDate(next);
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/5"
                onClick={moveForward}
                aria-label="Next"
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

            <div className="self-start sm:self-center">
              <ScheduleLegend />
            </div>
          </div>
        </>
      )}

      {/* Calendar (inner views supply their own surface; no wrapper bg — avoids a lighter ring in the padding). */}
      <div className={CALENDAR_PANEL_SHELL_CLASS}>
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
                      stickyDowHeader={false}
                    />
                  </div>
                ))}
              </div>
            ) : viewMode === "yeardisc" ? (
              <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden py-2">
                <YearDiscView
                  calendarYear={anchorDate.getFullYear()}
                  config={yearDiscConfig}
                  onConfigChange={setYearDiscConfig}
                  sources={{
                    calendarItems: yearDiscItems,
                    events: scheduleData?.events ?? [],
                    tours: scheduleData?.tours ?? [],
                    venues: venues ?? [],
                    people: people ?? [],
                    timeEntries: yearDiscTimeReport?.entries,
                  }}
                  locale={locale}
                />
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
            ) : viewMode === "week" || viewMode === "day" || viewMode === "next7" ? (
              <div className={CALENDAR_PANEL_FLEX_COLUMN_CLASS}>
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
                  fitHoursVertically
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
                  const orphanBacking = orphanBackingVenueBookings(foregroundItems, backingItems);
                  const dayListItems = [...foregroundItems, ...orphanBacking];
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
                      {dayListItems.length === 0 ? (
                        <div className="text-xs text-white/25 italic">No items</div>
                      ) : (
                        <div className="space-y-1">
                          {dayListItems.map((item) => {
                            const isOrphanBacking = orphanBacking.some((b) => b.id === item.id);
                            const backing = isOrphanBacking
                              ? null
                              : backingVenueBookingForEvent(item, backingItems);
                            const venueLine = calendarItemVenueName(item);
                            const timeLine = calendarItemTimeRangeLabel(item);
                            const detailLine = [timeLine, venueLine && `@ ${venueLine}`].filter(Boolean).join(" · ");
                            const backingSummary = backing ? calendarVenueBookingSummaryLine(backing) : "";
                            const titleText = backing
                              ? `${item.title} · Venue booking: ${backingSummary}`
                              : isOrphanBacking
                                ? calendarVenueBookingSummaryLine(item)
                                : [item.title, detailLine].filter(Boolean).join(" · ");
                            return (
                              <button
                                key={item.id}
                                onClick={() => {
                                  setDetailItem(item);
                                }}
                                className={`relative w-full overflow-hidden text-left text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/80 ${
                                  backing ? "ring-2 ring-rose-300/70 shadow-[0_0_0_2px_rgba(244,63,94,0.22)]" : ""
                                }`}
                                title={titleText}
                              >
                                {backing ? (
                                  <span className="absolute inset-0 bg-rose-500/20 pointer-events-none" aria-hidden="true" />
                                ) : null}
                                <span className="relative block font-medium truncate">{item.title}</span>
                                {backing ? (
                                  <span className="relative block text-[10px] text-rose-100/90 truncate leading-snug">
                                    Venue booking: {backingSummary}
                                  </span>
                                ) : null}
                                {detailLine ? (
                                  <span className="relative block text-[10px] text-white/55 truncate leading-snug">
                                    {detailLine}
                                  </span>
                                ) : null}
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

      {/* Entry detail — read-only overview for any calendar block */}
      <ScheduleItemDetailSheet
        item={detailItem}
        locale={locale}
        onClose={() => setDetailItem(null)}
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
