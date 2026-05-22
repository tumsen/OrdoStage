import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, ExternalLink, Plus, Trash2, Filter } from "lucide-react";
import { api } from "@/lib/api";
import { invalidateWorkAnnouncementBar } from "@/lib/invalidateWorkAnnouncementBar";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import { computeEventWorkTotals } from "@/lib/eventShowStaffing";
import type { EventDetail, EventShow, EventTeam } from "@/lib/types";
import {
  EventShowsOverviewGrid,
  effectiveShowStatus,
  formatPlannedHoursShort,
} from "@/components/event/EventShowsOverviewGrid";
import { EventTeamBadgeWidthScope } from "@/components/event/ShowTeamStaffingSummary";
import { eventMatchesDateRange } from "@/components/schedule/scheduleUtils";
import { DateInputWithWeekday } from "@/components/DateInputWithWeekday";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type StatusFilter = "all" | "draft" | "confirmed" | "cancelled";

function eventPassesShowStatusFilter(event: EventDetail, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  const shows = event.shows ?? [];
  if (shows.length === 0) return filter === "draft";
  return shows.some((s) => effectiveShowStatus(s) === filter);
}

function EventListRow({
  event,
  shows,
  teams,
  onDelete,
}: {
  event: EventDetail;
  shows: EventShow[];
  teams: EventTeam[];
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const eventWorkTotals = computeEventWorkTotals(event.shows ?? []);
  const jobCount = (event.shows ?? []).reduce((n, s) => n + (s.jobs?.length ?? 0), 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-white/5">
      <div className="flex items-start gap-2 px-4 sm:px-5 py-3.5">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-start gap-2 text-left rounded-md py-0.5 -my-0.5 px-1 -mx-1 hover:bg-white/[0.04]"
          >
            {open ? (
              <ChevronDown size={16} className="text-white/45 shrink-0 mt-0.5" />
            ) : (
              <ChevronRight size={16} className="text-white/45 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-x-2 flex-wrap min-w-0">
                <span className="text-sm font-medium text-white/90">{event.title}</span>
                {(event.shows?.length ?? 0) > 0 ? (
                  <span
                    className="text-[10px] tabular-nums text-white/40 shrink-0"
                    title="People and planned hours (all shows on this event)"
                  >
                    {eventWorkTotals.people} p · {formatPlannedHoursShort(eventWorkTotals.jobHours)} h
                  </span>
                ) : null}
                {jobCount > 0 && !open ? (
                  <span className="text-[10px] text-white/35">
                    {jobCount} job{jobCount === 1 ? "" : "s"} · expand to view
                  </span>
                ) : null}
              </div>
              <EventTeamBadgeWidthScope shows={shows} teams={teams}>
                <EventShowsOverviewGrid
                  shows={shows}
                  teams={teams}
                  includeJobs={open}
                  showTeamStaffingDetail
                  showColumnHeaders
                  className="mt-1.5"
                />
              </EventTeamBadgeWidthScope>
            </div>
          </button>
        </CollapsibleTrigger>
        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-7 border-white/15 text-white hover:bg-white/10"
          >
            <Link
              to={`/events/${event.id}`}
              className="inline-flex items-center gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              Go to event
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-white/30 hover:text-red-400"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
    </Collapsible>
  );
}

export default function Events() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFrom, setDateFrom] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: events, isLoading, error } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.get<EventDetail[]>("/api/events"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      void invalidateWorkAnnouncementBar(queryClient);
      setDeleteId(null);
    },
  });

  const filtered = (events ?? []).filter((e) => {
    if (!eventPassesShowStatusFilter(e, statusFilter)) return false;
    if (!eventMatchesDateRange(e, dateFrom, dateTo)) return false;
    return true;
  });

  return (
    <div className="page-shell">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <div className="flex items-center gap-2 text-white/40">
            <Filter size={14} />
            <span className="text-xs">Filter:</span>
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger
              className="w-36 bg-white/5 border-white/10 text-white text-sm h-8"
              title="Filter by each show's status"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#16161f] border-white/10 text-white">
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <DateInputWithWeekday value={dateFrom} onChange={setDateFrom} allowClear />
          <span className="text-white/30 text-xs">to</span>
          <DateInputWithWeekday value={dateTo} onChange={setDateTo} allowClear />
        </div>
        <Button
          onClick={() => navigate("/events/new")}
          className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-2 flex-shrink-0"
        >
          <Plus size={14} /> New Event
        </Button>
      </div>

      {/* List */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wide border-b border-white/10">
          Events
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded bg-white/5" />
            ))}
          </div>
        ) : error ? (
          <div className="py-10 text-center text-red-400 text-sm">Failed to load events.</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-white/30 text-sm">
            {(events ?? []).length === 0
              ? "No events yet. Create your first one!"
              : "No events match your filters."}
          </div>
        ) : (
          filtered.map((event) => {
            const teams = event.teams ?? [];
            const showsSorted = [...(event.shows ?? [])].sort((a, b) => {
              const da = a.showDate.slice(0, 10);
              const db = b.showDate.slice(0, 10);
              if (da !== db) return da.localeCompare(db);
              return a.showTime.localeCompare(b.showTime);
            });
            const shows =
              statusFilter === "all"
                ? showsSorted
                : showsSorted.filter((s) => effectiveShowStatus(s) === statusFilter);

            return (
              <EventListRow
                key={event.id}
                event={event}
                shows={shows}
                teams={teams}
                onDelete={() => setDeleteId(event.id)}
              />
            );
          })
        )}
      </div>

      {/* Delete dialog */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent className="bg-[#16161f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete event?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              This will permanently delete the event and all its documents.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
              onClick={() => {
                if (!deleteId) return;
                if (!confirmDeleteAction("event")) return;
                deleteMutation.mutate(deleteId);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
