import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Plus, Trash2, Eye, Filter } from "lucide-react";
import { api } from "@/lib/api";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import type { Event } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDate } from "@/lib/dateUtils";
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

type StatusFilter = "all" | "draft" | "confirmed" | "cancelled";

export default function Events() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: events, isLoading, error } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.get<Event[]>("/api/events"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setDeleteId(null);
    },
  });

  const filtered = (events ?? []).filter((e) => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
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
            <SelectTrigger className="w-36 bg-white/5 border-white/10 text-white text-sm h-8">
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
            weekdayClassName="text-[10px] text-white/40"
          />
          <span className="text-white/30 text-xs">to</span>
          <DateInputWithWeekday
            value={dateTo}
            onChange={setDateTo}
            className="h-8 w-[10rem] px-3 text-sm text-white/70"
            weekdayClassName="text-[10px] text-white/40"
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
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-0">
          {/* Header */}
          <div className="contents">
            <div className="px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wide border-b border-white/10">Title</div>
            <div className="px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wide border-b border-white/10 hidden sm:block">Date</div>
            <div className="px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wide border-b border-white/10">Status</div>
            <div className="px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wide border-b border-white/10"></div>
          </div>

          {isLoading ? (
            <div className="col-span-4 p-5 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded bg-white/5" />
              ))}
            </div>
          ) : error ? (
            <div className="col-span-4 py-10 text-center text-red-400 text-sm">
              Failed to load events.
            </div>
          ) : filtered.length === 0 ? (
            <div className="col-span-4 py-12 text-center text-white/30 text-sm">
              {(events ?? []).length === 0
                ? "No events yet. Create your first one!"
                : "No events match your filters."}
            </div>
          ) : (
            filtered.map((event) => {
              const isDraft = event.status === "draft";
              const isCancelled = event.status === "cancelled";
              const isConfirmed = event.status === "confirmed";
              return (
              <div key={event.id} className="contents group">
                <div
                  className="px-5 py-3.5 border-b border-white/5 cursor-pointer"
                  onClick={() => navigate(`/events/${event.id}`)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white/90 group-hover:text-white transition-colors truncate">
                      {event.title}
                    </span>
                    {isConfirmed && (
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-700/50">
                        Confirmed
                      </span>
                    )}
                    {isDraft && (
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-ordo-yellow/20 text-ordo-yellow border border-ordo-yellow/40">
                        Draft
                      </span>
                    )}
                    {isCancelled && (
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-950/60 text-red-400 border border-red-700/50">
                        Cancelled
                      </span>
                    )}
                  </div>
                  {event.tags ? (
                    <div className="text-xs text-white/30 mt-0.5 truncate">{event.tags}</div>
                  ) : null}
                </div>
                <div
                  className="px-5 py-3.5 border-b border-white/5 text-sm text-white/50 hidden sm:flex items-center cursor-pointer"
                  onClick={() => navigate(`/events/${event.id}`)}
                >
                  {formatDate(event.startDate)}
                </div>
                <div
                  className="px-5 py-3.5 border-b border-white/5 flex items-center cursor-pointer"
                  onClick={() => navigate(`/events/${event.id}`)}
                >
                  <StatusBadge status={event.status} />
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
