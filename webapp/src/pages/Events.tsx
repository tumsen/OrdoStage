import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Plus, Trash2, Eye, Filter, Check } from "lucide-react";
import { api } from "@/lib/api";
import { invalidateWorkAnnouncementBar } from "@/lib/invalidateWorkAnnouncementBar";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import { computeEventWorkTotals, computeShowStaffingStats } from "@/lib/eventShowStaffing";
import type { EventDetail, EventShow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { DateInputWithWeekday } from "@/components/DateInputWithWeekday";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { usePreferences } from "@/hooks/usePreferences";
import { localeForLanguage } from "@/lib/preferences";

type StatusFilter = "all" | "draft" | "confirmed" | "cancelled";

/** Show is draft unless explicitly confirmed or cancelled. */
function effectiveShowStatus(show: EventShow): "draft" | "confirmed" | "cancelled" {
  if (show.status === "confirmed") return "confirmed";
  if (show.status === "cancelled") return "cancelled";
  return "draft";
}

function eventPassesShowStatusFilter(event: EventDetail, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  const shows = event.shows ?? [];
  if (shows.length === 0) return filter === "draft";
  return shows.some((s) => effectiveShowStatus(s) === filter);
}

export default function Events() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { effective } = usePreferences();
  const prefsLocale = localeForLanguage(effective?.language ?? "en");
  const hour12 = effective?.timeFormat === "12h";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
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
    if (dateFrom && e.startDate && new Date(e.startDate) < new Date(dateFrom)) return false;
    if (dateTo && e.startDate && new Date(e.startDate) > new Date(dateTo + "T23:59:59")) return false;
    if ((dateFrom || dateTo) && !e.startDate) return false;
    return true;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
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
          <DateInputWithWeekday
            value={dateFrom}
            onChange={setDateFrom}
            className="h-8 w-[10rem] px-3 text-sm text-white/70"
            weekdayClassName="text-sm text-white/40"
          />
          <span className="text-white/30 text-xs">to</span>
          <DateInputWithWeekday
            value={dateTo}
            onChange={setDateTo}
            className="h-8 w-[10rem] px-3 text-sm text-white/70"
            weekdayClassName="text-sm text-white/40"
          />
        </div>
        <Button
          onClick={() => navigate("/events/new")}
          className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-2 flex-shrink-0"
        >
          <Plus size={14} /> New Event
        </Button>
      </div>

      {/* Table */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] gap-0">
          {/* Header */}
          <div className="contents">
            <div className="px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wide border-b border-white/10">Title</div>
            <div className="px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wide border-b border-white/10"></div>
          </div>

          {isLoading ? (
            <div className="col-span-2 p-5 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded bg-white/5" />
              ))}
            </div>
          ) : error ? (
            <div className="col-span-2 py-10 text-center text-red-400 text-sm">
              Failed to load events.
            </div>
          ) : filtered.length === 0 ? (
            <div className="col-span-2 py-12 text-center text-white/30 text-sm">
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
              const eventWorkTotals = computeEventWorkTotals(event.shows ?? []);
              return (
              <div key={event.id} className="contents group">
                <div
                  className="px-5 py-3.5 border-b border-white/5 cursor-pointer"
                  onClick={() => navigate(`/events/${event.id}`)}
                >
                  <div className="flex items-baseline gap-x-2 flex-wrap min-w-0">
                    <span className="text-sm font-medium text-white/90 group-hover:text-white transition-colors truncate">
                      {event.title}
                    </span>
                    {(event.shows?.length ?? 0) > 0 ? (
                      <span
                        className="text-[10px] tabular-nums text-white/40 shrink-0"
                        title="People and planned hours (all shows on this event)"
                      >
                        {eventWorkTotals.people} p · {formatPlannedHoursShort(eventWorkTotals.jobHours)} h
                      </span>
                    ) : null}
                  </div>
                  {shows.length > 0 ? (
                    <div className="mt-1 overflow-x-auto -mx-1 px-1">
                      <ul
                        className="min-w-[min(100%,42rem)] grid items-center gap-x-0 gap-y-1.5 text-[10px] leading-snug"
                        style={{
                          /* Badge | weekday | date | HH:MM (+ pad) | venue | … — time track matches format */
                          gridTemplateColumns: hour12
                            ? "auto 10ch minmax(11rem,20ch) minmax(6.25rem,11ch) minmax(0,6.5rem) 6.5rem 2.25rem 3.25rem minmax(0,1fr)"
                            : "auto 10ch minmax(11rem,20ch) minmax(3.25rem,6ch) minmax(0,6.5rem) 6.5rem 2.25rem 3.25rem minmax(0,1fr)",
                        }}
                      >
                        {shows.map((show) => {
                          const stats = computeShowStaffingStats(show, teams);
                          const { ok, total } = stats;
                          const showOff = effectiveShowStatus(show) === "cancelled";
                          const venueName = show.venue?.name ?? "Venue";
                          const ticketBits = formatEventListTicketBits(show, prefsLocale, hour12);
                          const when = formatEventListWhenParts(show, prefsLocale, hour12);
                          const showStatus = effectiveShowStatus(show);
                          const hoursLabel = formatPlannedHoursShort(stats.jobHours);
                          const rowTone = showOff
                            ? "text-white/30 line-through decoration-white/20"
                            : "text-white/50";
                          const whenTone = showOff ? undefined : "text-white/[0.82]";
                          const venueTone = showOff ? undefined : "text-white/55";
                          return (
                            <li key={show.id} className="contents">
                              <div className="justify-self-start pr-2">
                                <StatusBadge
                                  status={showStatus}
                                  className={cn(
                                    "text-[10px] py-px px-1.5 font-medium",
                                    showOff && "opacity-50"
                                  )}
                                />
                              </div>
                              <span
                                className={cn(
                                  "min-w-0 truncate text-left",
                                  rowTone,
                                  whenTone
                                )}
                                title={when.weekdayLabel}
                              >
                                {when.weekdayLabel}
                              </span>
                              <span
                                className={cn(
                                  "min-w-0 truncate pl-2 pr-0.5 text-left",
                                  rowTone,
                                  whenTone
                                )}
                                title={when.dateOnlyLabel}
                              >
                                {when.dateOnlyLabel}
                              </span>
                              <span
                                className={cn(
                                  "block w-full whitespace-nowrap text-right tabular-nums pr-1",
                                  rowTone,
                                  whenTone
                                )}
                              >
                                {when.timeLabel}
                              </span>
                              <span
                                className={cn("min-w-0 truncate", rowTone, venueTone)}
                                title={venueName}
                              >
                                {venueName}
                              </span>
                              <div className="min-w-0 truncate">
                                <EventListStaffingHint ok={ok} total={total} muted={showOff} />
                              </div>
                              <span
                                className={cn(
                                  "block w-full text-right tabular-nums",
                                  showOff
                                    ? "text-white/25 line-through decoration-white/20"
                                    : "text-white/45"
                                )}
                                title={`${stats.people} people on this show`}
                              >
                                {stats.people}
                              </span>
                              <span
                                className={cn(
                                  "block w-full text-right tabular-nums",
                                  showOff
                                    ? "text-white/25 line-through decoration-white/20"
                                    : "text-white/45"
                                )}
                                title={`${hoursLabel} h planned jobs`}
                              >
                                {hoursLabel}h
                              </span>
                              <div
                                className={cn(
                                  "min-w-0 truncate text-right sm:text-left",
                                  ticketBits ? (showOff ? "text-white/35" : "text-white/45") : "text-white/25",
                                  showOff && "line-through decoration-white/20"
                                )}
                                title={ticketBits ?? undefined}
                              >
                                {ticketBits ?? "—"}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-white/35">No shows scheduled</p>
                  )}
                </div>
                <div className="px-5 py-3.5 border-b border-white/5 flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/30 hover:text-white"
                    onClick={() => navigate(`/events/${event.id}`)}
                  >
                    <Eye size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/30 hover:text-red-400"
                    onClick={() => setDeleteId(event.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
              );
            })
          )}
        </div>
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

function formatPlannedHoursShort(jobHours: number): string {
  return jobHours >= 10 ? jobHours.toFixed(1) : jobHours.toFixed(2);
}

function formatEventListWhenParts(
  show: EventShow,
  locale: string,
  hour12: boolean
): { weekdayLabel: string; dateOnlyLabel: string; timeLabel: string } {
  const base = new Date(show.showDate.slice(0, 10));
  const [hh, mm] = show.showTime.split(":").map((x) => Number(x));
  if (Number.isFinite(hh) && Number.isFinite(mm)) {
    base.setHours(hh, mm, 0, 0);
  }
  const weekdayLabel = base.toLocaleDateString(locale, { weekday: "long" });
  const dateOnlyLabel = base.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeLabel = base.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12,
  });
  return { weekdayLabel, dateOnlyLabel, timeLabel };
}

function formatEventListSoldAt(iso: string, locale: string, hour12: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", hour12 });
}

/** Returns null when no ticket fields are set. */
function formatEventListTicketBits(show: EventShow, locale: string, hour12: boolean): string | null {
  const parts: string[] = [];
  if (show.ticketsOnSale != null) parts.push(`On sale ${show.ticketsOnSale}`);
  if (show.soldTickets != null) parts.push(`Sold ${show.soldTickets}`);
  if (show.soldTicketsRecordedAt) {
    parts.push(`Sold updated ${formatEventListSoldAt(show.soldTicketsRecordedAt, locale, hour12)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function EventListStaffingHint({
  ok,
  total,
  muted,
}: {
  ok: number;
  total: number;
  muted?: boolean;
}) {
  if (total === 0) {
    return <span className={cn("text-white/35", muted && "text-white/25")}>No teams</span>;
  }
  if (ok === total) {
    return (
      <span
        className={cn("inline-flex items-center gap-0.5 text-emerald-400", muted && "text-emerald-400/50")}
      >
        <Check size={10} className="shrink-0" aria-hidden />
        Staffing OK
      </span>
    );
  }
  return (
    <span className={cn("text-amber-400/90", muted && "text-amber-400/40")}>{ok}/{total} teams OK</span>
  );
}
