import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Upload, Download, Trash2, FileText, Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { Person, Production, ProductionDocument, ProductionPerson, UpdateProduction } from "@/lib/types";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { PeopleCountGraphic, PersonChip } from "@/components/show/PeopleVisuals";

type FormState = {
  name: string;
  description: string;
  notes: string;
  actorCount: string;
  techCount: string;
  durationMinutes: string;
  stageWidth: string;
  stageDepth: string;
  stageHeight: string;
  technicalSpecs: string;
};

function toForm(show: Production | null): FormState {
  return {
    name: show?.name ?? "",
    description: show?.description ?? "",
    notes: show?.notes ?? "",
    actorCount: show?.actorCount == null ? "" : String(show.actorCount),
    techCount: show?.techCount == null ? "" : String(show.techCount),
    durationMinutes: show?.durationMinutes == null ? "" : String(show.durationMinutes),
    stageWidth: show?.stageWidth ?? "",
    stageDepth: show?.stageDepth ?? "",
    stageHeight: show?.stageHeight ?? "",
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
  const { data: people } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<Person[]>("/api/people"),
    enabled: canAccess,
  });
  const { data: assignedPeople } = useQuery({
    queryKey: ["shows", "detail", id, "people"],
    queryFn: () => api.get<ProductionPerson[]>(`/api/productions/${id}/people`),
    enabled: Boolean(id) && canAccess,
  });

  const [form, setForm] = useState<FormState>(() => toForm(null));
  const [docType, setDocType] = useState<ProductionDocument["type"]>("other");
  const [docFolder, setDocFolder] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedActorId, setSelectedActorId] = useState("");
  const [selectedTechId, setSelectedTechId] = useState("");

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
        techCount: form.techCount.trim() ? Number(form.techCount) : null,
        durationMinutes: form.durationMinutes.trim() ? Number(form.durationMinutes) : null,
        stageWidth: form.stageWidth.trim() || null,
        stageDepth: form.stageDepth.trim() || null,
        stageHeight: form.stageHeight.trim() || null,
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
    mutationFn: async (input: { file: File; type: string; name: string; folder: string; sortOrder: number }) => {
      if (!id) throw new Error("Missing show id");
      const data = new FormData();
      data.set("file", input.file);
      data.set("type", input.type);
      data.set("name", input.name || input.file.name);
      data.set("folder", input.folder);
      data.set("sortOrder", String(input.sortOrder));
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

  const assignProductionPersonMutation = useMutation({
    mutationFn: async (input: { personId: string; role: string }) => {
      if (!id) throw new Error("Missing show id");
      return api.post<ProductionPerson>(`/api/productions/${id}/people`, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shows", "detail", id, "people"] });
      toast({ title: "Person assigned to show" });
    },
    onError: (e) =>
      toast({ title: e instanceof Error ? e.message : "Could not assign person", variant: "destructive" }),
  });

  const removeProductionPersonMutation = useMutation({
    mutationFn: async (personId: string) => {
      if (!id) throw new Error("Missing show id");
      await api.delete<void>(`/api/productions/${id}/people/${personId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shows", "detail", id, "people"] });
      toast({ title: "Person removed from show" });
    },
    onError: (e) =>
      toast({ title: e instanceof Error ? e.message : "Could not remove person", variant: "destructive" }),
  });

  const updateDocumentMutation = useMutation({
    mutationFn: async (input: {
      docId: string;
      patch: Partial<Pick<ProductionDocument, "name" | "type" | "folder" | "sortOrder">>;
    }) => {
      if (!id) throw new Error("Missing show id");
      return api.patch<ProductionDocument>(`/api/productions/${id}/documents/${input.docId}`, input.patch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shows", "detail", id, "documents"] });
    },
    onError: (e) =>
      toast({ title: e instanceof Error ? e.message : "Could not update document", variant: "destructive" }),
  });

  const groupedDocs = useMemo(() => {
    const map = new Map<string, ProductionDocument[]>();
    for (const doc of documents ?? []) {
      const key = doc.folder?.trim() || "General";
      const list = map.get(key) ?? [];
      list.push(doc);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [documents]);

  const nextSortOrder = (folder: string) =>
    Math.max(
      0,
      ...((documents ?? [])
        .filter((d) => (d.folder?.trim() || "") === folder.trim())
        .map((d) => d.sortOrder ?? 0))
    ) + 1;

  const uploadFiles = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const folder = docFolder.trim();
    Array.from(files).forEach((file, idx) => {
      uploadDocumentMutation.mutate({
        file,
        type: docType,
        name: file.name,
        folder,
        sortOrder: nextSortOrder(folder) + idx,
      });
    });
  };

  const actorPeople = (assignedPeople ?? []).filter((p) => (p.role ?? "").toLowerCase() === "actor");
  const techPeople = (assignedPeople ?? []).filter((p) => (p.role ?? "").toLowerCase() === "tech");

  const availableActorOptions = (people ?? []).filter(
    (person) => !actorPeople.some((assigned) => assigned.personId === person.id)
  );
  const availableTechOptions = (people ?? []).filter(
    (person) => !techPeople.some((assigned) => assigned.personId === person.id)
  );

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
            Master data for this show: cast, technical crew, stage dimensions, duration, specs, and all show docs.
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
              <Label htmlFor="tech-count">Number of technical crew</Label>
              <Input
                id="tech-count"
                type="number"
                min={0}
                value={form.techCount}
                onChange={(e) => setForm((p) => ({ ...p, techCount: e.target.value }))}
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
            <div className="space-y-2">
              <Label htmlFor="stage-width">Stage width</Label>
              <Input
                id="stage-width"
                value={form.stageWidth}
                onChange={(e) => setForm((p) => ({ ...p, stageWidth: e.target.value }))}
                placeholder="e.g. 10m"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stage-depth">Stage depth</Label>
              <Input
                id="stage-depth"
                value={form.stageDepth}
                onChange={(e) => setForm((p) => ({ ...p, stageDepth: e.target.value }))}
                placeholder="e.g. 8m"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="stage-height">Stage height</Label>
              <Input
                id="stage-height"
                value={form.stageHeight}
                onChange={(e) => setForm((p) => ({ ...p, stageHeight: e.target.value }))}
                placeholder="e.g. 5m"
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

            <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
              <PeopleCountGraphic count={Number(form.actorCount) || 0} label="Actors" />
              <PeopleCountGraphic count={Number(form.techCount) || 0} label="Technical Crew" />
            </div>

            <div className="space-y-3 md:col-span-2">
              <div className="flex items-center justify-between">
                <Label>Actors (from People)</Label>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={selectedActorId}
                  onChange={(e) => setSelectedActorId(e.target.value)}
                >
                  <option value="">Select person as actor...</option>
                  {availableActorOptions.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!canEdit || !selectedActorId || assignProductionPersonMutation.isPending}
                  onClick={() => {
                    if (!selectedActorId) return;
                    assignProductionPersonMutation.mutate({ personId: selectedActorId, role: "actor" });
                    setSelectedActorId("");
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add actor
                </Button>
              </div>
              {actorPeople.length === 0 ? <p className="text-xs text-muted-foreground">No actors assigned yet.</p> : null}
              <div className="grid gap-2">
                {actorPeople.map((assignment) => (
                  <div key={`actor-${assignment.personId}`} className="grid gap-2 md:grid-cols-[1fr_auto]">
                    <PersonChip
                      name={assignment.person.name}
                      roleLabel="Actor"
                      photoUrl={
                        assignment.person.hasPhoto
                          ? `${import.meta.env.VITE_BACKEND_URL || ""}/api/people/${assignment.person.id}/photo`
                          : undefined
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canEdit || removeProductionPersonMutation.isPending}
                      onClick={() => removeProductionPersonMutation.mutate(assignment.personId)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 md:col-span-2">
              <div className="flex items-center justify-between">
                <Label>Technical crew (from People)</Label>
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={selectedTechId}
                  onChange={(e) => setSelectedTechId(e.target.value)}
                >
                  <option value="">Select person as tech...</option>
                  {availableTechOptions.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!canEdit || !selectedTechId || assignProductionPersonMutation.isPending}
                  onClick={() => {
                    if (!selectedTechId) return;
                    assignProductionPersonMutation.mutate({ personId: selectedTechId, role: "tech" });
                    setSelectedTechId("");
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add tech
                </Button>
              </div>
              {techPeople.length === 0 ? (
                <p className="text-xs text-muted-foreground">No technical crew assigned yet.</p>
              ) : null}
              <div className="grid gap-2">
                {techPeople.map((assignment) => (
                  <div key={`tech-${assignment.personId}`} className="grid gap-2 md:grid-cols-[1fr_auto]">
                    <PersonChip
                      name={assignment.person.name}
                      roleLabel="Tech"
                      photoUrl={
                        assignment.person.hasPhoto
                          ? `${import.meta.env.VITE_BACKEND_URL || ""}/api/people/${assignment.person.id}/photo`
                          : undefined
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!canEdit || removeProductionPersonMutation.isPending}
                      onClick={() => removeProductionPersonMutation.mutate(assignment.personId)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
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
          <div className="grid gap-3 rounded-md border p-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Document type</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={docType}
                onChange={(e) => setDocType(e.target.value as ProductionDocument["type"])}
              >
                <option value="manuscript">Manuscript</option>
                <option value="tech_notes">Tech notes</option>
                <option value="image">Image</option>
                <option value="graphic">Graphic</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Folder</Label>
              <Input
                placeholder="e.g. Script v2, Promo, Tech pack"
                value={docFolder}
                onChange={(e) => setDocFolder(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex w-full cursor-pointer items-center">
                <input
                  type="file"
                  multiple
                  className="hidden"
                  disabled={!canEdit || uploadDocumentMutation.isPending}
                  onChange={(e) => {
                    uploadFiles(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
                <Button type="button" variant="secondary" className="w-full" disabled={!canEdit || uploadDocumentMutation.isPending} asChild>
                  <span>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload files
                  </span>
                </Button>
              </label>
            </div>
          </div>

          <div
            className={`rounded-md border border-dashed p-4 text-center text-sm ${
              isDragOver ? "border-primary bg-primary/5" : "text-muted-foreground"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              uploadFiles(e.dataTransfer.files);
            }}
          >
            Drag and drop one or multiple files here
          </div>

          <div className="space-y-4">
            {groupedDocs.map(([folder, docs]) => (
              <div key={folder} className="space-y-2">
                <h4 className="text-sm font-semibold">{folder}</h4>
                {docs.map((doc) => (
                  <div key={doc.id} className="space-y-2 rounded-md border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
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

                    {doc.mimeType.startsWith("image/") ? (
                      <img
                        src={`${import.meta.env.VITE_BACKEND_URL || ""}/api/productions/${id}/documents/${doc.id}/download`}
                        alt={doc.name}
                        className="max-h-48 rounded-md border object-contain"
                      />
                    ) : null}
                    {doc.mimeType === "application/pdf" ? (
                      <iframe
                        title={`preview-${doc.id}`}
                        src={`${import.meta.env.VITE_BACKEND_URL || ""}/api/productions/${id}/documents/${doc.id}/download`}
                        className="h-64 w-full rounded-md border"
                      />
                    ) : null}

                    <div className="grid gap-2 md:grid-cols-4">
                      <Input
                        defaultValue={doc.name}
                        onBlur={(e) =>
                          updateDocumentMutation.mutate({
                            docId: doc.id,
                            patch: { name: e.target.value },
                          })
                        }
                        disabled={!canEdit}
                      />
                      <select
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={doc.type}
                        disabled={!canEdit}
                        onBlur={(e) =>
                          updateDocumentMutation.mutate({
                            docId: doc.id,
                            patch: { type: e.target.value as ProductionDocument["type"] },
                          })
                        }
                      >
                        <option value="manuscript">Manuscript</option>
                        <option value="tech_notes">Tech notes</option>
                        <option value="image">Image</option>
                        <option value="graphic">Graphic</option>
                        <option value="other">Other</option>
                      </select>
                      <Input
                        defaultValue={doc.folder ?? ""}
                        placeholder="Folder"
                        disabled={!canEdit}
                        onBlur={(e) =>
                          updateDocumentMutation.mutate({
                            docId: doc.id,
                            patch: { folder: e.target.value || null },
                          })
                        }
                      />
                      <Input
                        type="number"
                        min={0}
                        defaultValue={doc.sortOrder ?? 0}
                        disabled={!canEdit}
                        onBlur={(e) =>
                          updateDocumentMutation.mutate({
                            docId: doc.id,
                            patch: { sortOrder: Number(e.target.value) || 0 },
                          })
                        }
                      />
                    </div>
                  </div>
                ))}
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

