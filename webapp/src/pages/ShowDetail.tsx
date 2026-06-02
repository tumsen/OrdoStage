import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Upload, Download, Trash2, FileText } from "lucide-react";
import { api } from "@/lib/api";
import type { Production, ProductionDocument, UpdateProduction } from "@/lib/types";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

type FormState = {
  name: string;
  description: string;
  notes: string;
  actorCount: string;
  durationMinutes: string;
  stageSize: string;
  technicalSpecs: string;
};

function toForm(show: Production | null): FormState {
  return {
    name: show?.name ?? "",
    description: show?.description ?? "",
    notes: show?.notes ?? "",
    actorCount: show?.actorCount == null ? "" : String(show.actorCount),
    durationMinutes: show?.durationMinutes == null ? "" : String(show.durationMinutes),
    stageSize: show?.stageSize ?? "",
    technicalSpecs: show?.technicalSpecs ?? "",
  };
}

export default function ShowDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canView, canAction } = usePermissions();
  const canAccess = canView("schedule") || canView("events");
  const canEdit = canAction("write.schedule") || canAction("write.events");

  const { data: show, isLoading } = useQuery({
    queryKey: ["shows", "detail", id],
    queryFn: () => api.get<Production>(`/api/productions/${id}`),
    enabled: Boolean(id) && canAccess,
  });
  const { data: documents } = useQuery({
    queryKey: ["shows", "detail", id, "documents"],
    queryFn: () => api.get<ProductionDocument[]>(`/api/productions/${id}/documents`),
    enabled: Boolean(id) && canAccess,
  });

  const [form, setForm] = useState<FormState>(() => toForm(null));

  useEffect(() => {
    if (show) setForm(toForm(show));
  }, [show]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing show id");
      const payload: UpdateProduction = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        notes: form.notes.trim() || null,
        actorCount: form.actorCount.trim() ? Number(form.actorCount) : null,
        durationMinutes: form.durationMinutes.trim() ? Number(form.durationMinutes) : null,
        stageSize: form.stageSize.trim() || null,
        technicalSpecs: form.technicalSpecs.trim() || null,
      };
      return api.patch<Production>(`/api/productions/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shows", "detail", id] });
      queryClient.invalidateQueries({ queryKey: ["shows", "productions"] });
      queryClient.invalidateQueries({ queryKey: ["productions"] });
      toast({ title: "Show updated" });
    },
    onError: (e) =>
      toast({ title: e instanceof Error ? e.message : "Could not update show", variant: "destructive" }),
  });

  const uploadTechRiderMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!id) throw new Error("Missing show id");
      const data = new FormData();
      data.set("file", file);
      const res = await api.raw(`/api/productions/${id}/tech-rider`, { method: "POST", body: data });
      if (!res.ok) throw new Error("Could not upload tech rider");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shows", "detail", id] });
      toast({ title: "Tech rider uploaded" });
    },
    onError: (e) =>
      toast({ title: e instanceof Error ? e.message : "Could not upload tech rider", variant: "destructive" }),
  });

  const deleteTechRiderMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Missing show id");
      await api.delete<void>(`/api/productions/${id}/tech-rider`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shows", "detail", id] });
      toast({ title: "Tech rider removed" });
    },
    onError: (e) =>
      toast({ title: e instanceof Error ? e.message : "Could not remove tech rider", variant: "destructive" }),
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: async (input: { file: File; type: string; name: string }) => {
      if (!id) throw new Error("Missing show id");
      const data = new FormData();
      data.set("file", input.file);
      data.set("type", input.type);
      data.set("name", input.name || input.file.name);
      const res = await api.raw(`/api/productions/${id}/documents`, { method: "POST", body: data });
      if (!res.ok) throw new Error("Could not upload document");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shows", "detail", id, "documents"] });
      toast({ title: "Document uploaded" });
    },
    onError: (e) =>
      toast({ title: e instanceof Error ? e.message : "Could not upload document", variant: "destructive" }),
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (docId: string) => {
      if (!id) throw new Error("Missing show id");
      await api.delete<void>(`/api/productions/${id}/documents/${docId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shows", "detail", id, "documents"] });
      toast({ title: "Document deleted" });
    },
    onError: (e) =>
      toast({ title: e instanceof Error ? e.message : "Could not delete document", variant: "destructive" }),
  });

  if (!canAccess) {
    return <div className="p-6 text-sm text-muted-foreground">No access to shows.</div>;
  }
  if (!id) {
    return <div className="p-6 text-sm text-muted-foreground">Missing show id.</div>;
  }

  return (
    <div className="w-full space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link to="/shows">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to shows
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Show details</CardTitle>
          <CardDescription>
            Master data for this show: cast size, duration, stage/tech requirements and rider documents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">Show name</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="actor-count">Number of actors</Label>
              <Input
                id="actor-count"
                type="number"
                min={0}
                value={form.actorCount}
                onChange={(e) => setForm((p) => ({ ...p, actorCount: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                min={0}
                value={form.durationMinutes}
                onChange={(e) => setForm((p) => ({ ...p, durationMinutes: e.target.value }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="stage-size">Stage size</Label>
              <Input
                id="stage-size"
                value={form.stageSize}
                onChange={(e) => setForm((p) => ({ ...p, stageSize: e.target.value }))}
                placeholder="e.g. 10m x 8m x 5m"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="tech">Technical specs</Label>
              <Textarea
                id="tech"
                value={form.technicalSpecs}
                onChange={(e) => setForm((p) => ({ ...p, technicalSpecs: e.target.value }))}
                placeholder="Sound, lighting, power, rigging, loading notes..."
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="notes">Internal notes</Label>
              <Textarea id="notes" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => saveMutation.mutate()} disabled={!canEdit || saveMutation.isPending || !form.name.trim()}>
              {saveMutation.isPending ? "Saving..." : "Save show details"}
            </Button>
            <Button variant="outline" onClick={() => navigate(`/shows`)}>Done</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Show documents</CardTitle>
          <CardDescription>
            Upload all core show files: manuscript, tech notes, images, graphics, and other standard documentation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {[
              { type: "manuscript", label: "Upload manuscript" },
              { type: "tech_notes", label: "Upload tech notes" },
              { type: "image", label: "Upload image" },
              { type: "graphic", label: "Upload graphic" },
              { type: "other", label: "Upload other doc" },
            ].map((entry) => (
              <label key={entry.type} className="inline-flex cursor-pointer items-center">
                <input
                  type="file"
                  className="hidden"
                  disabled={!canEdit || uploadDocumentMutation.isPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      uploadDocumentMutation.mutate({
                        file,
                        type: entry.type,
                        name: file.name,
                      });
                    }
                    e.currentTarget.value = "";
                  }}
                />
                <Button type="button" variant="secondary" disabled={!canEdit || uploadDocumentMutation.isPending} asChild>
                  <span>
                    <Upload className="mr-2 h-4 w-4" />
                    {entry.label}
                  </span>
                </Button>
              </label>
            ))}
          </div>

          <div className="space-y-2">
            {(documents ?? []).map((doc) => (
              <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{doc.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.type} • {doc.filename}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={`${import.meta.env.VITE_BACKEND_URL || ""}/api/productions/${id}/documents/${doc.id}/download`}>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </a>
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={!canEdit || deleteDocumentMutation.isPending}
                    onClick={() => deleteDocumentMutation.mutate(doc.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
            {documents?.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                <FileText className="mb-2 h-4 w-4" />
                No documents yet.
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Show tech rider</CardTitle>
          <CardDescription>Upload the show-level tech rider PDF used across venues and tours.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center">
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={!canEdit || uploadTechRiderMutation.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadTechRiderMutation.mutate(file);
                  e.currentTarget.value = "";
                }}
              />
              <Button type="button" variant="secondary" disabled={!canEdit || uploadTechRiderMutation.isPending} asChild>
                <span>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload tech rider PDF
                </span>
              </Button>
            </label>

            {show?.hasTechRiderPdf ? (
              <Button variant="outline" asChild>
                <a href={`${import.meta.env.VITE_BACKEND_URL || ""}/api/productions/${id}/tech-rider/download`}>
                  <Download className="mr-2 h-4 w-4" />
                  Download current ({show.techRiderPdfName ?? "tech-rider.pdf"})
                </a>
              </Button>
            ) : null}

            {show?.hasTechRiderPdf ? (
              <Button
                variant="destructive"
                onClick={() => deleteTechRiderMutation.mutate()}
                disabled={!canEdit || deleteTechRiderMutation.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove rider
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

