import { useQuery, useQueries } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, MapPin, CheckCircle2, Plus, ArrowRight, TrendingUp, Route, ChevronLeft, ChevronRight, Coffee, Truck, Receipt } from "lucide-react";
import { api } from "@/lib/api";
import type { EventDetail, Venue } from "@/lib/types";
import type { TourDetail, TourListItem } from "../../../backend/src/types";
import { tourShowPrimaryTime } from "@/lib/tourScheduleDisplay";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate, eventStartsOnOrAfterToday } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CALENDAR_STICKY_HEADER_CHROME } from "@/lib/weekGridColumns";
import { useMemo, useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number | string; color: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}><Icon size={18} /></div>
      <div>
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-xs text-white/40 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

// ── Month Calendar ────────────────────────────────────────────────────────────

type CalEntry = { label: string; color: "event" | "show" | "travel" | "day_off"; href: string };

function MonthCalendar({ events, tourDetails }: { events: EventDetail[]; tourDetails: TourDetail[] }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed

  // Build a map: "YYYY-MM-DD" → CalEntry[]
  const entriesByDate = new Map<string, CalEntry[]>();
  function addEntry(dateStr: string | null | undefined, entry: CalEntry) {
    if (dateStr == null || dateStr === "") return;
    const key = dateStr.slice(0, 10);
    if (!entriesByDate.has(key)) entriesByDate.set(key, []);
    entriesByDate.get(key)!.push(entry);
  }

  for (const e of events) {
    const shows = e.shows ?? [];
    if (shows.length > 0) {
      for (const show of shows) {
        const venue = show.venue?.name?.trim();
        const time = show.showTime?.trim();
        const bits = [e.title, time || undefined, venue].filter(Boolean) as string[];
        addEntry(show.showDate, {
          label: bits.join(" · "),
          color: "show",
          href: `/events/${e.id}`,
        });
      }
    } else {
      addEntry(e.startDate, { label: e.title, color: "event", href: `/events/${e.id}` });
    }
  }
  for (const tour of tourDetails) {
    for (const show of tour.shows ?? []) {
      const primaryTime = tourShowPrimaryTime(show);
      const baseTitle =
        show.type === "travel"
          ? `Travel${show.fromLocation && show.toLocation ? `: ${show.fromLocation}→${show.toLocation}` : ""}`
          : show.type === "day_off"
          ? "Day Off"
          : show.venueName || show.venueCity || tour.name;
      const title =
        primaryTime && show.type !== "travel" && show.type !== "day_off"
          ? `${baseTitle} · ${primaryTime}`
          : baseTitle;
      addEntry(show.date, {
        label: title,
        color: show.type === "travel" ? "travel" : show.type === "day_off" ? "day_off" : "show",
        href: `/tours/${tour.id}`,
      });
    }
  }

  // Calendar grid for current month
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Offset: Monday=0 ... Sunday=6
  const startOffset = ((firstDay.getDay() + 6) % 7);
  const totalCells = startOffset + lastDay.getDate();
  const rows = Math.ceil(totalCells / 7);

  const todayKey = new Date().toISOString().slice(0, 10);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  const entryColorClass: Record<CalEntry["color"], string> = {
    event: "bg-indigo-500/30 text-indigo-300",
    show: "bg-red-900/40 text-red-300",
    travel: "bg-blue-900/40 text-blue-300",
    day_off: "bg-green-900/40 text-green-300",
  };

  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
      {/* Calendar header */}
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{MONTH_NAMES[month]} {year}</h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-white/40 hover:text-white" onClick={prevMonth}>
            <ChevronLeft size={14} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-white/40 hover:text-white" onClick={nextMonth}>
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>

      <div className="p-4">
        {/* Day name headers */}
        <div className={`grid grid-cols-7 mb-2 border-b border-white/10 ${CALENDAR_STICKY_HEADER_CHROME}`}>
          {DAY_NAMES.map((d) => (
            <div key={d} className="text-center text-[10px] text-white/25 font-medium py-1">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: rows * 7 }, (_, idx) => {
            const dayNum = idx - startOffset + 1;
            if (dayNum < 1 || dayNum > lastDay.getDate()) {
              return <div key={idx} className="min-h-[60px]" />;
            }
            const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
            const entries = entriesByDate.get(dateKey) ?? [];
            const isToday = dateKey === todayKey;
            return (
              <div
                key={idx}
                className={cn(
                  "min-h-[60px] rounded-lg p-1.5 flex flex-col gap-0.5 border",
                  entries.length > 0 ? "border-white/10 bg-white/[0.03]" : "border-white/[0.03]",
                  isToday ? "ring-1 ring-inset ring-white/25" : ""
                )}
              >
                <span className={cn("text-[11px] leading-none mb-0.5 font-medium", isToday ? "text-white" : entries.length ? "text-white/55" : "text-white/20")}>
                  {dayNum}
                </span>
                {entries.slice(0, 3).map((entry, i) => (
                  <Link key={i} to={entry.href} className={cn("rounded px-1 py-0.5 text-[9px] leading-tight truncate hover:opacity-80", entryColorClass[entry.color])}>
                    {entry.label}
                  </Link>
                ))}
                {entries.length > 3 ? (
                  <span className="text-[9px] text-white/30 px-1">+{entries.length - 3}</span>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-white/[0.06]">
          {([
            { color: "event", label: "Events" },
            { color: "show", label: "Shows" },
            { color: "travel", label: "Travel" },
            { color: "day_off", label: "Day Off" },
          ] as const).map(({ color, label }) => (
            <div key={color} className="flex items-center gap-1.5">
              <div className={cn("w-2.5 h-2.5 rounded-sm", entryColorClass[color])} />
              <span className="text-[10px] text-white/30">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const { canAction, isOwner } = usePermissions();
  const canManageBilling = canAction("billing.manage");

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.get<EventDetail[]>("/api/events"),
  });

  const { data: venues, isLoading: venuesLoading } = useQuery({
    queryKey: ["venues"],
    queryFn: () => api.get<Venue[]>("/api/venues"),
  });

  const { data: tours } = useQuery({
    queryKey: ["tours"],
    queryFn: () => api.get<TourListItem[]>("/api/tours"),
  });

  const { data: orgUsage } = useQuery({
    queryKey: ["org"],
    queryFn: () =>
      api.get<{
        billableMembersThisMonth?: Array<{ id: string; name: string | null; email: string }>;
        estimatedMonthlyCents?: number;
        estimatedCurrencyCode?: string;
      }>("/api/org"),
  });

  // Fetch detail for each tour that has shows (to get show dates)
  const tourDetailQueries = useQueries({
    queries: (tours ?? [])
      .filter((t) => t._count.shows > 0)
      .map((t) => ({
        queryKey: ["tour", t.id],
        queryFn: () => api.get<TourDetail>(`/api/tours/${t.id}`),
      })),
  });

  const tourDetails = tourDetailQueries
    .map((q) => q.data)
    .filter((d): d is TourDetail => !!d);

  const totalEvents = events?.length ?? 0;
  const upcomingShowsList = useMemo(() => {
    const rows: { event: EventDetail; show: EventDetail["shows"][number] }[] = [];
    for (const event of events ?? []) {
      for (const show of event.shows ?? []) {
        if (!eventStartsOnOrAfterToday(show.showDate)) continue;
        rows.push({ event, show });
      }
    }
    rows.sort((a, b) => {
      const da = a.show.showDate.slice(0, 10);
      const db = b.show.showDate.slice(0, 10);
      if (da !== db) return da.localeCompare(db);
      return a.show.showTime.localeCompare(b.show.showTime);
    });
    return rows;
  }, [events]);

  const upcomingCount = upcomingShowsList.length;
  const confirmedEvents = events?.filter((e) => e.status === "confirmed").length ?? 0;
  const venueCount = venues?.length ?? 0;
  const tourCount = tours?.length ?? 0;
  const billableCount = orgUsage?.billableMembersThisMonth?.length ?? 0;

  // Upcoming tour shows (next 60 days across all tours)
  const now = new Date();
  const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const upcomingShows = tourDetails
    .flatMap((tour) =>
      (tour.shows ?? [])
        .filter((s) => {
          if (!s.date) return false;
          const d = new Date(s.date);
          return !Number.isNaN(d.getTime()) && d >= now && d <= in60;
        })
        .map((s) => ({ show: s, tour }))
    )
    .sort((a, b) => new Date(a.show.date).getTime() - new Date(b.show.date).getTime())
    .slice(0, 6);

  return (
    <div className="page-shell space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Welcome back</h2>
          <p className="text-sm text-white/40 mt-1">Here's what's on stage.</p>
        </div>
        <Button onClick={() => navigate("/events/new")} className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-2">
          <Plus size={15} />New Event
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {eventsLoading || venuesLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl bg-white/5" />)
        ) : (
          <>
            <StatCard icon={CalendarDays} label="Total Events" value={totalEvents} color="bg-indigo-500/15 text-indigo-400" />
            <StatCard icon={TrendingUp} label="Upcoming shows" value={upcomingCount} color="bg-purple-500/15 text-purple-400" />
            <StatCard icon={CheckCircle2} label="Confirmed" value={confirmedEvents} color="bg-emerald-500/15 text-emerald-400" />
            <StatCard icon={MapPin} label="Venues" value={venueCount} color="bg-red-500/15 text-red-400" />
            <StatCard icon={Route} label="Tours" value={tourCount} color="bg-amber-500/15 text-amber-400" />
            <StatCard icon={Receipt} label="Billable seats (month)" value={billableCount} color="bg-rose-500/15 text-rose-300" />
          </>
        )}
      </div>

      {orgUsage?.billableMembersThisMonth && orgUsage.billableMembersThisMonth.length > 0 ? (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Usage this month</h3>
            {isOwner ? (
              <Link to="/account#billing" className="text-xs text-white/40 hover:text-white/70">
                Billing details →
              </Link>
            ) : null}
          </div>
          <p className="text-xs text-white/45 leading-relaxed">
            Billable members (UTC month to date) had jobs, staffing, event edits, or work time. You only pay for seats
            with activity—idle teammates are not counted.
          </p>
          <ul className="divide-y divide-white/5 rounded-lg border border-white/10 overflow-hidden">
            {orgUsage.billableMembersThisMonth.slice(0, 8).map((u) => (
              <li key={u.id} className="px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 text-sm">
                <span className="text-white/85 truncate">{u.name?.trim() || "—"}</span>
                <span className="text-white/40 text-xs truncate">{u.email}</span>
              </li>
            ))}
          </ul>
          {orgUsage.billableMembersThisMonth.length > 8 ? (
            <p className="text-[11px] text-white/35">
              +{orgUsage.billableMembersThisMonth.length - 8} more
              {isOwner ? " on the billing page" : ""}.
            </p>
          ) : null}
          {canManageBilling && orgUsage.estimatedMonthlyCents != null ? (
            <p className="text-xs text-white/55 pt-1">
              Estimated run rate:{" "}
              <span className="text-white/80 font-medium">
                {orgUsage.estimatedCurrencyCode ?? "EUR"} {(orgUsage.estimatedMonthlyCents / 100).toFixed(2)}
              </span>{" "}
              this month (estimate only).
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Calendar */}
      <MonthCalendar events={events ?? []} tourDetails={tourDetails} />

      {/* Two-column bottom section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Events */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Upcoming shows</h3>
            <Link to="/events" className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {eventsLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 rounded bg-white/5" />)}</div>
          ) : upcomingShowsList.length === 0 ? (
            <div className="py-10 text-center text-white/30 text-sm">No upcoming shows scheduled.</div>
          ) : (
            <div className="max-h-[min(28rem,50svh)] overflow-y-auto overscroll-contain divide-y divide-white/5 min-h-0">
              {upcomingShowsList.map(({ event, show }) => (
                <Link
                  key={show.id}
                  to={`/events/${event.id}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.03] transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white/90 truncate group-hover:text-white">{event.title}</div>
                    <div className="text-xs text-white/40 mt-0.5 truncate">
                      {formatDate(show.showDate)}
                      {show.showTime ? ` · ${show.showTime}` : ""}
                      {show.venue?.name ? ` · ${show.venue.name}` : ""}
                    </div>
                  </div>
                  <StatusBadge status={show.status} />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Tour Shows */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Upcoming Tour Dates</h3>
            <Link to="/tours" className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1">
              View tours <ArrowRight size={12} />
            </Link>
          </div>
          {upcomingShows.length === 0 ? (
            <div className="py-10 text-center text-white/30 text-sm">
              No upcoming tour dates.
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={() => navigate("/tours")} className="border-white/10 text-white/50 hover:text-white gap-2">
                  <Plus size={13} /> Go to Tours
                </Button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {upcomingShows.map(({ show, tour }) => {
                const dateLabel = new Date(show.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
                const venueLabel = show.venueName || show.venueCity || (show.type === "travel" ? [show.fromLocation, show.toLocation].filter(Boolean).join(" → ") : "");
                return (
                  <Link key={show.id} to={`/tours/${tour.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.03] transition-colors group">
                    <div className={cn("w-7 h-7 rounded flex items-center justify-center flex-shrink-0",
                      show.type === "travel" ? "bg-blue-900/30 text-blue-400" :
                      show.type === "day_off" ? "bg-green-900/30 text-green-400" :
                      "bg-red-900/20 text-red-400"
                    )}>
                      {show.type === "travel" ? <Truck size={12} /> : show.type === "day_off" ? <Coffee size={12} /> : <CalendarDays size={12} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white/85 truncate group-hover:text-white">
                        {venueLabel || tour.name}
                      </div>
                      <div className="text-xs text-white/35 mt-0.5">
                        {tour.name} · {dateLabel}
                        {show.showTime ? ` · ${show.showTime}` : ""}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
