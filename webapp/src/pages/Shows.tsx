import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Ticket, Route, Trash2, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import type { CreateProduction, Production } from "@/lib/types";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

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
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>No access</CardTitle>
            <CardDescription>You do not have access to shows in this organization.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 md:p-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Shows</CardTitle>
            <CardDescription>
              Create your in-house produced shows and from each show create local/in-house events or tours.
            </CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)} disabled={!canEdit}>
            <Plus className="mr-2 h-4 w-4" />
            New show
          </Button>
        </CardHeader>
      </Card>

      <div className="grid gap-4">
        {(shows ?? []).map((show) => (
          <Card key={show.id}>
            <CardHeader
              className="space-y-1 cursor-pointer"
              onClick={() => navigate(`/shows/${show.id}`)}
            >
              <CardTitle className="text-lg">{show.name}</CardTitle>
              <CardDescription>
                {(show.linkedEventTitles?.length ?? 0)} in-house/local events • {(show.linkedTourNames?.length ?? 0)} tours
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {show.notes ? <p className="text-sm text-muted-foreground">{show.notes}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
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
                  <Ticket className="mr-2 h-4 w-4" />
                  Create in-house event
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
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
                  <Route className="mr-2 h-4 w-4" />
                  Create tour
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate(`/production?productionId=${show.id}`)}>
                  Open in planner
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate(`/shows/${show.id}`)}>
                  <FileText className="mr-2 h-4 w-4" />
                  Details
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!canEdit || deleteShowMutation.isPending}
                  onClick={() => deleteShowMutation.mutate(show.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading shows...</p> : null}

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

