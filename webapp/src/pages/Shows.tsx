import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ExternalLink, Plus, Ticket, Route, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import type { CreateProduction, Production } from "@/lib/types";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { PeopleCountGraphic } from "@/components/show/PeopleVisuals";

type CreateRunForm = {
  title: string;
  venueId: string;
  startDate: string;
};

const emptyRunForm: CreateRunForm = {
  title: "",
  venueId: "",
  startDate: "",
};

export default function Shows() {
  const navigate = useNavigate();
  const { canView, canAction } = usePermissions();
  const canAccess = canView("schedule") || canView("events");
  const canEdit = canAction("write.schedule") || canAction("write.events");
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [linkDialog, setLinkDialog] = useState<{ productionId: string; kind: "event" | "tour" } | null>(null);
  const [linkDialogCurrentLinks, setLinkDialogCurrentLinks] = useState<{ eventIds: string[]; tourIds: string[] }>({
    eventIds: [],
    tourIds: [],
  });
  const [runForm, setRunForm] = useState<CreateRunForm>(emptyRunForm);

  const { data: shows, isLoading } = useQuery({
    queryKey: ["shows", "productions"],
    queryFn: () => api.get<Production[]>("/api/productions"),
    enabled: canAccess,
  });

  const { data: venues } = useQuery({
    queryKey: ["venues"],
    queryFn: () => api.get<Array<{ id: string; name: string }>>("/api/venues"),
    enabled: canAccess,
  });

  const venueOptions = useMemo(() => venues ?? [], [venues]);

  const createShowMutation = useMutation({
    mutationFn: async () => {
      const payload: CreateProduction = {
        name: newName.trim(),
        notes: newNotes.trim() || null,
      };
      return api.post<Production>("/api/productions", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shows", "productions"] });
      queryClient.invalidateQueries({ queryKey: ["productions"] });
      setCreateOpen(false);
      setNewName("");
      setNewNotes("");
      toast({ title: "Show created" });
    },
    onError: (e) =>
      toast({
        title: e instanceof Error ? e.message : "Could not create show",
        variant: "destructive",
      }),
  });

  const deleteShowMutation = useMutation({
    mutationFn: (productionId: string) => api.delete<void>(`/api/productions/${productionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shows", "productions"] });
      queryClient.invalidateQueries({ queryKey: ["productions"] });
      toast({ title: "Show deleted" });
    },
    onError: (e) =>
      toast({
        title: e instanceof Error ? e.message : "Could not delete show",
        variant: "destructive",
      }),
  });

  const createInhouseEventMutation = useMutation({
    mutationFn: async ({
      productionId,
      form,
      currentLinkedEventIds,
    }: {
      productionId: string;
      form: CreateRunForm;
      currentLinkedEventIds: string[];
    }) => {
      const created = await api.post<{ id: string }>("/api/events", {
        title: form.title.trim(),
        startDate: form.startDate || null,
        venueId: form.venueId || undefined,
        productionId,
      });
      const linkedEventIds = Array.from(new Set([...(currentLinkedEventIds ?? []), created.id]));
      await api.patch<Production>(`/api/productions/${productionId}`, { linkedEventIds });
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shows", "productions"] });
      queryClient.invalidateQueries({ queryKey: ["productions"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setLinkDialog(null);
      setRunForm(emptyRunForm);
      toast({ title: "In-house event created" });
    },
    onError: (e) =>
      toast({
        title: e instanceof Error ? e.message : "Could not create in-house event",
        variant: "destructive",
      }),
  });

  const createTourMutation = useMutation({
    mutationFn: async ({
      productionId,
      form,
      currentLinkedTourIds,
    }: {
      productionId: string;
      form: CreateRunForm;
      currentLinkedTourIds: string[];
    }) => {
      const created = await api.post<{ id: string }>("/api/tours", {
        name: form.title.trim(),
        productionId,
      });
      const linkedTourIds = Array.from(new Set([...(currentLinkedTourIds ?? []), created.id]));
      await api.patch<Production>(`/api/productions/${productionId}`, { linkedTourIds });
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shows", "productions"] });
      queryClient.invalidateQueries({ queryKey: ["productions"] });
      queryClient.invalidateQueries({ queryKey: ["tours"] });
      setLinkDialog(null);
      setRunForm(emptyRunForm);
      toast({ title: "Tour created" });
    },
    onError: (e) =>
      toast({
        title: e instanceof Error ? e.message : "Could not create tour",
        variant: "destructive",
      }),
  });

  if (!canAccess) {
    return <div className="p-6 text-sm text-muted-foreground">You do not have access to shows in this organization.</div>;
  }

  return (
    <div className="page-shell">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-white/50">
          Create your in-house produced shows and from each show create local/in-house events or tours.
        </p>
        <Button
          onClick={() => setCreateOpen(true)}
          disabled={!canEdit}
          className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-2 flex-shrink-0"
        >
          <Plus size={14} /> New Show
        </Button>
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wide border-b border-white/10">
          Shows
        </div>
        {isLoading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded bg-white/5" />
            ))}
          </div>
        ) : (shows ?? []).length === 0 ? (
          <div className="py-12 text-center text-white/30 text-sm">No shows yet. Create your first one.</div>
        ) : (
          (shows ?? []).map((show) => (
            <div key={show.id} className="border-b last:border-b-0 border-white/5 px-4 sm:px-5 py-3.5">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-start gap-2 text-left rounded-md py-0.5 -my-0.5 px-1 -mx-1 hover:bg-white/[0.04]"
                  onClick={() => navigate(`/shows/${show.id}`)}
                >
                  <ChevronRight size={16} className="text-white/45 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-x-2 flex-wrap min-w-0">
                      <span className="text-sm font-medium text-white/90 truncate">{show.name}</span>
                      <span className="text-[10px] tabular-nums text-white/40 shrink-0">
                        {(show.linkedEventTitles?.length ?? 0)} events
                      </span>
                      <span className="text-[10px] tabular-nums text-white/40 shrink-0">
                        {(show.linkedTourNames?.length ?? 0)} tours
                      </span>
                    </div>
                    {show.notes ? <p className="text-[11px] text-white/35 mt-0.5 truncate">{show.notes}</p> : null}
                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                      <PeopleCountGraphic count={show.actorCount ?? show.actorNames?.length ?? 0} label="Actors" />
                      <PeopleCountGraphic count={show.techCount ?? show.techNames?.length ?? 0} label="Tech" />
                      <div className="rounded-md border border-white/10 bg-white/5 p-3">
                        <p className="text-xs uppercase tracking-wide text-white/40">Stage</p>
                        <p className="mt-2 text-sm text-white/85">
                          {show.stageWidth || "-"} W • {show.stageDepth || "-"} D • {show.stageHeight || "-"} H
                        </p>
                      </div>
                    </div>
                    {show.actorNames?.length || show.techNames?.length ? (
                      <p className="mt-2 text-[11px] text-white/45 truncate">
                        Cast: {(show.actorNames ?? []).slice(0, 3).join(", ") || "—"} | Tech:{" "}
                        {(show.techNames ?? []).slice(0, 3).join(", ") || "—"}
                      </p>
                    ) : null}
                  </div>
                </button>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5 pt-0.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 border-white/15 text-white hover:bg-white/10"
                    onClick={() => navigate(`/shows/${show.id}`)}
                  >
                    Details
                    <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 border-white/15 text-white hover:bg-white/10"
                    onClick={() => navigate(`/production?productionId=${show.id}`)}
                  >
                    Open planner
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-white/15 text-white hover:bg-white/10"
                    disabled={!canEdit}
                    onClick={() => {
                      setLinkDialog({ productionId: show.id, kind: "event" });
                      setLinkDialogCurrentLinks({
                        eventIds: show.linkedEventIds ?? [],
                        tourIds: show.linkedTourIds ?? [],
                      });
                      setRunForm({ ...emptyRunForm, title: `${show.name} - Local run` });
                    }}
                  >
                    <Ticket className="mr-1.5 h-3.5 w-3.5" />
                    Event
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 border-white/15 text-white hover:bg-white/10"
                    disabled={!canEdit}
                    onClick={() => {
                      setLinkDialog({ productionId: show.id, kind: "tour" });
                      setLinkDialogCurrentLinks({
                        eventIds: show.linkedEventIds ?? [],
                        tourIds: show.linkedTourIds ?? [],
                      });
                      setRunForm({ ...emptyRunForm, title: `${show.name} - Tour` });
                    }}
                  >
                    <Route className="mr-1.5 h-3.5 w-3.5" />
                    Tour
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/30 hover:text-red-400"
                    disabled={!canEdit || deleteShowMutation.isPending}
                    onClick={() => deleteShowMutation.mutate(show.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create show</DialogTitle>
            <DialogDescription>Add a new in-house produced show.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="show-name">Show name</Label>
              <Input id="show-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="show-notes">Notes</Label>
              <Textarea id="show-notes" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => createShowMutation.mutate()}
              disabled={!newName.trim() || createShowMutation.isPending}
            >
              {createShowMutation.isPending ? "Creating..." : "Create show"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(linkDialog)} onOpenChange={(open) => !open && setLinkDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{linkDialog?.kind === "event" ? "Create in-house event" : "Create tour"}</DialogTitle>
            <DialogDescription>
              {linkDialog?.kind === "event"
                ? "Create a local/in-house event linked to this show."
                : "Create a tour linked to this show."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="run-title">Title</Label>
              <Input
                id="run-title"
                value={runForm.title}
                onChange={(e) => setRunForm((prev) => ({ ...prev, title: e.target.value }))}
              />
            </div>
            {linkDialog?.kind === "event" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="run-start">Start date/time</Label>
                  <Input
                    id="run-start"
                    type="datetime-local"
                    value={runForm.startDate}
                    onChange={(e) => setRunForm((prev) => ({ ...prev, startDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="run-venue">Venue</Label>
                  <select
                    id="run-venue"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={runForm.venueId}
                    onChange={(e) => setRunForm((prev) => ({ ...prev, venueId: e.target.value }))}
                  >
                    <option value="">No venue yet</option>
                    {venueOptions.map((venue) => (
                      <option key={venue.id} value={venue.id}>
                        {venue.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (!linkDialog) return;
                if (linkDialog.kind === "event") {
                  createInhouseEventMutation.mutate({
                    productionId: linkDialog.productionId,
                    form: runForm,
                    currentLinkedEventIds: linkDialogCurrentLinks.eventIds,
                  });
                  return;
                }
                createTourMutation.mutate({
                  productionId: linkDialog.productionId,
                  form: runForm,
                  currentLinkedTourIds: linkDialogCurrentLinks.tourIds,
                });
              }}
              disabled={
                !linkDialog ||
                !runForm.title.trim() ||
                createInhouseEventMutation.isPending ||
                createTourMutation.isPending
              }
            >
              {createInhouseEventMutation.isPending || createTourMutation.isPending ? "Saving..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

