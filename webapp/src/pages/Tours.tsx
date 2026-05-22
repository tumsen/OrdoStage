import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Plus, Trash2, Route } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import type { Tour, CreateTour, TourListItem } from "../../../backend/src/types";
import { TourShowsOverviewGrid } from "@/components/tour/TourShowsOverviewGrid";
import { computeTourCrewTotals } from "@/lib/tourShowListStats";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

function TourListRow({
  tour,
  onDelete,
}: {
  tour: TourListItem;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const crewTotals = computeTourCrewTotals(tour.shows, tour.handsNeeded, tour.tourPeopleCount);
  const dayCount = tour.shows.length;
  const scheduleEventCount = tour.shows.reduce(
    (n, s) => n + (s.scheduleEvents?.length ?? 0),
    0
  );

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
                <span className="text-sm font-medium text-white/90">{tour.name}</span>
                <TourStatusBadge status={tour.status} />
                {dayCount > 0 ? (
                  <span
                    className="text-[10px] tabular-nums text-white/40 shrink-0"
                    title="Crew on busiest day (tour roster when a day has no custom roster)"
                  >
                    {crewTotals.people} crew
                    {crewTotals.handsNeeded != null ? ` · ${crewTotals.handsNeeded} needed` : ""}
                  </span>
                ) : null}
                {scheduleEventCount > 0 && !open ? (
                  <span className="text-[10px] text-white/35">
                    {scheduleEventCount} schedule block{scheduleEventCount === 1 ? "" : "s"} · expand to view
                  </span>
                ) : null}
              </div>
              {tour.tourManagerName ? (
                <p className="text-[11px] text-white/35 mt-0.5 truncate">
                  Manager: {tour.tourManagerName}
                </p>
              ) : null}
              <TourShowsOverviewGrid
                shows={tour.shows}
                tourHandsNeeded={tour.handsNeeded}
                tourPeopleCount={tour.tourPeopleCount}
                showColumnHeaders
                includeScheduleEvents={open}
                className="mt-1.5"
              />
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
              to={`/tours/${tour.id}`}
              className="inline-flex items-center gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              Go to tour
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

function TourStatusBadge({ status }: { status: Tour["status"] }) {
  if (status === "active") {
    return (
      <Badge className="bg-green-900/40 text-green-300 border-green-700/40 hover:bg-green-900/40">
        Active
      </Badge>
    );
  }
  if (status === "completed") {
    return (
      <Badge className="bg-blue-900/40 text-blue-300 border-blue-700/40 hover:bg-blue-900/40">
        Completed
      </Badge>
    );
  }
  return (
    <Badge className="bg-white/5 text-white/40 border-white/10 hover:bg-white/5">
      Draft
    </Badge>
  );
}

interface NewTourDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function NewTourDialog({ open, onOpenChange }: NewTourDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"draft" | "active" | "completed">("draft");
  const [tourManagerName, setTourManagerName] = useState("");
  const [tourManagerPhone, setTourManagerPhone] = useState("");
  const [tourManagerEmail, setTourManagerEmail] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useMutation({
    mutationFn: (data: CreateTour) => api.post<Tour>("/api/tours", data),
    onSuccess: (tour) => {
      queryClient.invalidateQueries({ queryKey: ["tours"] });
      onOpenChange(false);
      resetForm();
      navigate(`/tours/${tour.id}`);
    },
  });

  function resetForm() {
    setName("");
    setDescription("");
    setStatus("draft");
    setTourManagerName("");
    setTourManagerPhone("");
    setTourManagerEmail("");
    setNotes("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const payload: CreateTour = {
      name: name.trim(),
      status,
    };
    if (description.trim()) payload.description = description.trim();
    if (tourManagerName.trim()) payload.tourManagerName = tourManagerName.trim();
    if (tourManagerPhone.trim()) payload.tourManagerPhone = tourManagerPhone.trim();
    if (tourManagerEmail.trim()) payload.tourManagerEmail = tourManagerEmail.trim();
    if (notes.trim()) payload.notes = notes.trim();
    createMutation.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}>
      <DialogContent className="bg-[#16161f] border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Tour</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-white/60 text-xs uppercase tracking-wide">
              Tour Name <span className="text-red-400">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. UK Tour 2026"
              className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white/60 text-xs uppercase tracking-wide">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the tour..."
              className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-none"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white/60 text-xs uppercase tracking-wide">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white">
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="pt-2 border-t border-white/10">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-3">Tour Manager</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 col-span-2">
                <Label className="text-white/60 text-xs uppercase tracking-wide">Name</Label>
                <Input
                  value={tourManagerName}
                  onChange={(e) => setTourManagerName(e.target.value)}
                  placeholder="Tour manager name"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/60 text-xs uppercase tracking-wide">Phone</Label>
                <Input
                  value={tourManagerPhone}
                  onChange={(e) => setTourManagerPhone(e.target.value)}
                  placeholder="+44..."
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/60 text-xs uppercase tracking-wide">Email</Label>
                <Input
                  value={tourManagerEmail}
                  onChange={(e) => setTourManagerEmail(e.target.value)}
                  placeholder="email@..."
                  type="email"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-white/60 text-xs uppercase tracking-wide">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any general notes about this tour..."
              className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-none"
              rows={3}
            />
          </div>

          {createMutation.isError ? (
            <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : "Failed to create tour."}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-white/10 text-white/60 hover:text-white bg-transparent"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || createMutation.isPending}
              className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
            >
              {createMutation.isPending ? "Creating..." : "Create Tour"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Tours() {
  const queryClient = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: tours, isLoading, error } = useQuery({
    queryKey: ["tours"],
    queryFn: () => api.get<TourListItem[]>("/api/tours"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/tours/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tours"] });
      setDeleteId(null);
    },
  });

  const tourToDelete = (tours ?? []).find((t) => t.id === deleteId);

  return (
    <div className="page-shell">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-white/40">
          <Route size={14} />
          <span className="text-sm">
            {isLoading ? "Loading..." : `${(tours ?? []).length} tour${(tours ?? []).length !== 1 ? "s" : ""}`}
          </span>
        </div>
        <Button
          onClick={() => setNewOpen(true)}
          className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-2 flex-shrink-0"
        >
          <Plus size={14} /> New Tour
        </Button>
      </div>

      {/* List */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wide border-b border-white/10">
          Tours
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded bg-white/5" />
            ))}
          </div>
        ) : error ? (
          <div className="py-10 text-center text-red-400 text-sm">Failed to load tours.</div>
        ) : (tours ?? []).length === 0 ? (
          <div className="py-16 text-center">
            <Route size={28} className="text-white/15 mx-auto mb-3" />
            <p className="text-white/30 text-sm">No tours yet.</p>
            <p className="text-white/20 text-xs mt-1">Create your first tour to get started.</p>
            <Button
              onClick={() => setNewOpen(true)}
              variant="outline"
              size="sm"
              className="mt-4 border-white/10 text-white/50 hover:text-white bg-transparent gap-2"
            >
              <Plus size={12} /> New Tour
            </Button>
          </div>
        ) : (
          (tours ?? []).map((tour) => (
            <TourListRow key={tour.id} tour={tour} onDelete={() => setDeleteId(tour.id)} />
          ))
        )}
      </div>

      <NewTourDialog open={newOpen} onOpenChange={setNewOpen} />

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent className="bg-[#16161f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tour?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              {tourToDelete
                ? `"${tourToDelete.name}" and all its shows and people assignments will be permanently deleted.`
                : "This tour will be permanently deleted."}
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
                if (!confirmDeleteAction(`tour "${tourToDelete?.name ?? ""}"`)) return;
                deleteMutation.mutate(deleteId);
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
