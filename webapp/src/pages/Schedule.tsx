import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { EventDetail, InternalBookingDetail, Venue, Person } from "../../../backend/src/types";
import { ScheduleFilters } from "@/components/schedule/ScheduleFilters";
import { CalendarGrid } from "@/components/schedule/CalendarGrid";
import { ItemDetailSheet } from "@/components/schedule/ItemDetailSheet";
import { NewBookingDialog } from "@/components/schedule/NewBookingDialog";
import { ScheduleLegend } from "@/components/schedule/ScheduleLegend";
import { toCalendarItems, formatMonthLabel } from "@/components/schedule/scheduleUtils";
import type { CalendarItem } from "@/components/schedule/scheduleUtils";

interface ScheduleData {
  events: EventDetail[];
  bookings: InternalBookingDetail[];
}

function toISODate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function Schedule() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [venueId, setVenueId] = useState("all");
  const [personId, setPersonId] = useState("all");
  const [selectedItem, setSelectedItem] = useState<CalendarItem | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);

  // First/last day of displayed month
  const from = toISODate(year, month, 1);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = toISODate(year, month, lastDay);

  // Build query string
  const params = new URLSearchParams({ from, to });
  if (venueId !== "all") params.set("venueId", venueId);
  if (personId !== "all") params.set("personId", personId);

  const { data: scheduleData, isLoading } = useQuery({
    queryKey: ["schedule", { venueId, personId, year, month }],
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

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <ScheduleFilters
          venues={venues ?? []}
          people={people ?? []}
          venueId={venueId}
          personId={personId}
          onVenueChange={setVenueId}
          onPersonChange={setPersonId}
        />
        <Button
          onClick={() => setBookingOpen(true)}
          className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-2 flex-shrink-0"
        >
          <Plus size={14} />
          New Booking
        </Button>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/5"
            onClick={prevMonth}
          >
            <ChevronLeft size={16} />
          </Button>
          <h2 className="text-base font-semibold text-white/90 min-w-[160px] text-center">
            {formatMonthLabel(year, month)}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/5"
            onClick={nextMonth}
          >
            <ChevronRight size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-white/40 hover:text-white/70 hover:bg-white/5 ml-1"
            onClick={() => {
              setYear(today.getFullYear());
              setMonth(today.getMonth());
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
          <CalendarGrid
            year={year}
            month={month}
            items={items}
            onItemClick={setSelectedItem}
          />
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
        onClose={() => setBookingOpen(false)}
        venues={venues ?? []}
        people={people ?? []}
      />
    </div>
  );
}
