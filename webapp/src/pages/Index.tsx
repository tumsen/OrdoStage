import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { CalendarDays, MapPin, CheckCircle2, Plus, ArrowRight, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import type { Event, Venue } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate, isNext30Days } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-xs text-white/40 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.get<Event[]>("/api/events"),
  });

  const { data: venues, isLoading: venuesLoading } = useQuery({
    queryKey: ["venues"],
    queryFn: () => api.get<Venue[]>("/api/venues"),
  });

  const totalEvents = events?.length ?? 0;
  const upcomingThisMonth = events?.filter((e) => isNext30Days(e.startDate)).length ?? 0;
  const confirmedEvents = events?.filter((e) => e.status === "confirmed").length ?? 0;
  const venueCount = venues?.length ?? 0;

  const upcomingEvents = (events ?? [])
    .filter((e) => isNext30Days(e.startDate))
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .slice(0, 10);

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      {/* Hero row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Welcome back</h2>
          <p className="text-sm text-white/40 mt-1">Here's what's on stage.</p>
        </div>
        <Button
          onClick={() => navigate("/events/new")}
          className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-2"
        >
          <Plus size={15} />
          New Event
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {eventsLoading || venuesLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl bg-white/5" />
          ))
        ) : (
          <>
            <StatCard
              icon={CalendarDays}
              label="Total Events"
              value={totalEvents}
              color="bg-indigo-500/15 text-indigo-400"
            />
            <StatCard
              icon={TrendingUp}
              label="Next 30 Days"
              value={upcomingThisMonth}
              color="bg-purple-500/15 text-purple-400"
            />
            <StatCard
              icon={CheckCircle2}
              label="Confirmed"
              value={confirmedEvents}
              color="bg-emerald-500/15 text-emerald-400"
            />
            <StatCard
              icon={MapPin}
              label="Venues"
              value={venueCount}
              color="bg-red-500/15 text-red-400"
            />
          </>
        )}
      </div>

      {/* Upcoming events */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Upcoming Events</h3>
          <Link
            to="/events"
            className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1 transition-colors"
          >
            View all <ArrowRight size={12} />
          </Link>
        </div>

        {eventsLoading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded bg-white/5" />
            ))}
          </div>
        ) : upcomingEvents.length === 0 ? (
          <div className="py-12 text-center text-white/30 text-sm">
            No upcoming events in the next 30 days.
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/events/new")}
                className="border-white/10 text-white/50 hover:text-white hover:border-white/20 gap-2"
              >
                <Plus size={13} /> Create your first event
              </Button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {upcomingEvents.map((event) => (
              <Link
                key={event.id}
                to={`/events/${event.id}`}
                className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.03] transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white/90 truncate group-hover:text-white transition-colors">
                    {event.title}
                  </div>
                  <div className="text-xs text-white/40 mt-0.5">{formatDate(event.startDate)}</div>
                </div>
                <StatusBadge status={event.status} />
                <ArrowRight
                  size={14}
                  className="text-white/20 group-hover:text-white/50 transition-colors flex-shrink-0"
                />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
