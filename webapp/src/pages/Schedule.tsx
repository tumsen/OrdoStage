import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { EventDetail, InternalBookingDetail, Venue, Person } from "../../../backend/src/types";
import {
  ScheduleFilters,
  type ScheduleViewMode,
  type VisibilityFilters,
} from "@/components/schedule/ScheduleFilters";
import { CalendarGrid } from "@/components/schedule/CalendarGrid";
import { ItemDetailSheet } from "@/components/schedule/ItemDetailSheet";
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

interface ScheduleData {
  events: EventDetail[];
  bookings: InternalBookingDetail[];
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
  const fromDate = new Date(anchorDate);
  const toDate = addDays(fromDate, 6);
  return { from: toISODate(fromDate), to: toISODate(toDate) };
}

function rangeLabel(mode: ScheduleViewMode, date: Date): string {
  if (mode === "year") return String(date.getFullYear());
  if (mode === "yeardisc") return `Year Disc ${date.getFullYear()}`;
  if (mode === "month") return formatMonthLabel(date.getFullYear(), date.getMonth());
  if (mode === "week") {
    const fromDate = startOfWeek(date);
    const toDate = addDays(fromDate, 6);
    return `${fromDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${toDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  }
  if (mode === "day") {
    return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  const toDate = addDays(date, 6);
  return `Next 7 days (${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} - ${toDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })})`;
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

function YearDiscView({ year, items }: { year: number; items: CalendarItem[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 12 }).map((_, month) => {
        const start = new Date(year, month, 1);
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
  const today = new Date();
  const [anchorDate, setAnchorDate] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [viewMode, setViewMode] = useState<ScheduleViewMode>("month");
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
    other: true,
  });

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
    ? toCalendarItems(scheduleData.events, scheduleData.bookings)
    : [];

  const visibleItems = items.filter((item) => {
    if (item.kind === "event") return visibility.event;
    if (item.type === "rehearsal") return visibility.rehearsal;
    if (item.type === "maintenance") return visibility.maintenance;
    if (item.type === "private") return visibility.private;
    return visibility.other;
  });

  function moveBackward() {
    if (viewMode === "year" || viewMode === "yeardisc") setAnchorDate((d) => addYears(d, -1));
    else if (viewMode === "month") setAnchorDate((d) => addMonths(d, -1));
    else if (viewMode === "week" || viewMode === "next7") setAnchorDate((d) => addDays(d, -7));
    else setAnchorDate((d) => addDays(d, -1));
  }

  function moveForward() {
    if (viewMode === "year" || viewMode === "yeardisc") setAnchorDate((d) => addYears(d, 1));
    else if (viewMode === "month") setAnchorDate((d) => addMonths(d, 1));
    else if (viewMode === "week" || viewMode === "next7") setAnchorDate((d) => addDays(d, 7));
    else setAnchorDate((d) => addDays(d, 1));
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
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
      <div className="flex items-center justify-between">
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
            {rangeLabel(viewMode, anchorDate)}
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
      <div className="bg-white/[0.02] border border-white/[0.07] rounded-xl p-3 md:p-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg bg-white/5" />
            ))}
          </div>
        ) : (
          <>
            {viewMode === "year" ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {Array.from({ length: 12 }).map((_, m) => (
                  <div key={m} className="rounded-lg border border-white/10 p-2">
                    <div className="text-xs text-white/40 mb-2 px-1">
                      {formatMonthLabel(anchorDate.getFullYear(), m)}
                    </div>
                    <CalendarGrid
                      year={anchorDate.getFullYear()}
                      month={m}
                      items={visibleItems}
                      onItemClick={setSelectedItem}
                    />
                  </div>
                ))}
              </div>
            ) : viewMode === "yeardisc" ? (
              <YearDiscView year={anchorDate.getFullYear()} items={visibleItems} />
            ) : viewMode === "month" ? (
              <CalendarGrid
                year={anchorDate.getFullYear()}
                month={anchorDate.getMonth()}
                items={visibleItems}
                onItemClick={setSelectedItem}
              />
            ) : viewMode === "week" || viewMode === "day" ? (
              <div className="space-y-2">
                <p className="text-[11px] text-white/35">
                  Drag across a day column to select a time range; the new booking form opens with start and end filled in.
                </p>
                <OutlookTimeGrid
                  days={getRangeDays(viewMode, anchorDate)}
                  items={visibleItems}
                  onItemClick={setSelectedItem}
                  onSelectTimeRange={(start, end) => {
                    setBookingSlot({
                      startDate: toDatetimeLocalValue(start),
                      endDate: toDatetimeLocalValue(end),
                    });
                    setBookingOpen(true);
                  }}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {getRangeDays(viewMode, anchorDate).map((date) => {
                  const dayItems = itemsForDay(visibleItems, date);
                  return (
                    <div key={date.toISOString()} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                      <div className="text-xs text-white/40 mb-2">
                        {date.toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                      {dayItems.length === 0 ? (
                        <div className="text-xs text-white/25 italic">No items</div>
                      ) : (
                        <div className="space-y-1">
                          {dayItems.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => setSelectedItem(item)}
                              className="w-full text-left text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/80"
                            >
                              {item.title}
                            </button>
                          ))}
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

      {/* Detail sheet */}
      <ItemDetailSheet
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
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
