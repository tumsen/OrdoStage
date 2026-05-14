import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { FileUp, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import type { VenueDocument } from "@/lib/types";
import { venueDocumentKindLabel } from "@/lib/venueDocumentKinds";
import { DocumentListThumbnail } from "@/components/DocumentListThumbnail";

const backendBase = () => import.meta.env.VITE_BACKEND_URL || "";

function venueDocDownloadUrl(docId: string): string {
  return `${backendBase()}/api/venues/documents/${docId}/download`;
}

type VenueDocKind = VenueDocument["kind"];

async function uploadVenueDocument(
  venueId: string,
  file: File,
  name: string,
  kind: VenueDocKind
): Promise<void> {
  const baseUrl = import.meta.env.VITE_BACKEND_URL || "";
  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", name.trim() || file.name);
  formData.append("kind", kind);
  const resp = await fetch(`${baseUrl}/api/venues/${venueId}/documents`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!resp.ok) {
    let message = "Failed to upload file.";
    try {
      const parsed = await resp.json();
      const maybe = (parsed as { error?: { message?: string } })?.error?.message;
      if (typeof maybe === "string" && maybe.trim()) message = maybe;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
}

function isImagePreviewDoc(d: VenueDocument): boolean {
  return d.kind === "image" || (d.mimeType?.startsWith("image/") ?? false);
}

function VenueDocRow({
  doc,
  readOnly,
  canWrite,
  onPatched,
  onDelete,
  isDeleting,
}: {
  doc: VenueDocument;
  readOnly: boolean;
  canWrite: boolean;
  onPatched: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [name, setName] = useState(doc.name);
  const [kind, setKind] = useState<VenueDocKind>(doc.kind);
  const { toast } = useToast();

  useEffect(() => {
    setName(doc.name);
    setKind(doc.kind);
  }, [doc.id, doc.name, doc.kind]);

  const dirty = name.trim() !== doc.name || kind !== doc.kind;

  const patchMutation = useMutation({
    mutationFn: async (body: { name?: string; kind?: VenueDocKind }) => {
      await api.patch<VenueDocument>(`/api/venues/documents/${doc.id}`, body);
    },
    onSuccess: () => {
      onPatched();
      toast({ title: "File updated" });
    },
    onError: (e: Error) => {
      toast({ title: "Could not update file", description: e.message, variant: "destructive" });
    },
  });

  async function handleSave() {
    const n = name.trim();
    if (!n) return;
    const body: { name?: string; kind?: VenueDocKind } = {};
    if (n !== doc.name) body.name = n;
    if (kind !== doc.kind) body.kind = kind;
    if (Object.keys(body).length === 0) return;
    await patchMutation.mutateAsync(body);
  }

  const editable = canWrite && !readOnly;

  return (
    <li className="flex flex-col gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2 py-2 text-[11px] sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <DocumentListThumbnail
          downloadUrl={venueDocDownloadUrl(doc.id)}
          mimeType={doc.mimeType}
          filename={doc.filename}
          preferImage={isImagePreviewDoc(doc)}
        />
        {editable ? (
          <Select value={kind} onValueChange={(v) => setKind(v as VenueDocKind)}>
            <SelectTrigger className="h-8 w-[8.5rem] shrink-0 bg-white/5 border-white/10 text-white text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#16161f] border-white/10 text-white">
              <SelectItem value="drawing">Drawing</SelectItem>
              <SelectItem value="image">Image</SelectItem>
              <SelectItem value="document">Document</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="outline" className="shrink-0 border-white/10 text-white/70 text-[10px] font-normal">
            {venueDocumentKindLabel(doc.kind)}
          </Badge>
        )}
        {editable ? (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 min-w-0 flex-1 bg-white/5 border-white/10 text-white text-xs"
            placeholder="Label shown in list"
            aria-label="File label"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-white/80" title={doc.filename}>
            {doc.name}
          </span>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {editable ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 text-[11px] bg-white/10 hover:bg-white/15"
            disabled={!dirty || !name.trim() || patchMutation.isPending}
            onClick={() => void handleSave()}
          >
            {patchMutation.isPending ? "Saving…" : "Save"}
          </Button>
        ) : null}
        <a href={venueDocDownloadUrl(doc.id)} className="shrink-0 text-blue-300 hover:text-blue-200">
          Download
        </a>
        {editable ? (
          <button
            type="button"
            className="shrink-0 text-red-300/80 hover:text-red-200 disabled:opacity-40 p-0.5"
            title="Delete"
            disabled={isDeleting}
            onClick={() => onDelete()}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </li>
  );
}

export function VenueDocumentsSection({
  venueId,
  canWrite,
  readOnly = false,
}: {
  venueId: string;
  canWrite: boolean;
  /** List and download only — no upload or delete (e.g. venue overview page). */
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadKind, setUploadKind] = useState<VenueDocKind>("drawing");
  const [uploadLabel, setUploadLabel] = useState("");

  const { data: docs, isLoading } = useQuery({
    queryKey: ["venues", venueId, "documents"],
    queryFn: () => api.get<VenueDocument[]>(`/api/venues/${venueId}/documents`),
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => api.delete(`/api/venues/documents/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["venues", venueId, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["venues"] });
    },
    onError: (e: Error) => {
      toast({ title: "Could not delete file", description: e.message, variant: "destructive" });
    },
  });

  async function handleSelectedFile(file: File | null) {
    if (!file) return;
    try {
      await uploadVenueDocument(venueId, file, uploadLabel.trim() || file.name, uploadKind);
      queryClient.invalidateQueries({ queryKey: ["venues", venueId, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["venues"] });
      setUploadLabel("");
      toast({ title: "File uploaded" });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
      <Label className="text-white/50 text-xs uppercase tracking-wide">Files</Label>
      <p className="text-[10px] text-white/35 leading-snug">
        {readOnly
          ? "Files attached to this venue. Add or remove them when editing the venue from the venues list."
          : "Label each file as a drawing, image, document, or other. You can change the type and display name after upload."}
      </p>
      {isLoading ? (
        <p className="text-[11px] text-white/35 py-1">Loading…</p>
      ) : (docs ?? []).length === 0 ? (
        <p className="text-[11px] text-white/35 py-1">No files yet.</p>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
          {(docs ?? []).map((d) => (
            <VenueDocRow
              key={d.id}
              doc={d}
              readOnly={readOnly}
              canWrite={canWrite}
              isDeleting={deleteMutation.isPending}
              onPatched={() => {
                queryClient.invalidateQueries({ queryKey: ["venues", venueId, "documents"] });
                queryClient.invalidateQueries({ queryKey: ["venues"] });
              }}
              onDelete={() => {
                if (!confirmDeleteAction(`file “${d.name}”`)) return;
                deleteMutation.mutate(d.id);
              }}
            />
          ))}
        </ul>
      )}
      {canWrite && !readOnly ? (
        <div className="space-y-2 pt-1 border-t border-white/10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-white/45 text-[10px] uppercase tracking-wide">Type</Label>
              <Select value={uploadKind} onValueChange={(v) => setUploadKind(v as VenueDocKind)}>
                <SelectTrigger className="h-8 bg-white/5 border-white/10 text-white text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#16161f] border-white/10 text-white">
                  <SelectItem value="drawing">Drawing (plans, plots, CAD/PDF)</SelectItem>
                  <SelectItem value="image">Image (photos, PNG/JPG)</SelectItem>
                  <SelectItem value="document">Document (contracts, riders, text)</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/45 text-[10px] uppercase tracking-wide">Display name</Label>
              <Input
                value={uploadLabel}
                onChange={(e) => setUploadLabel(e.target.value)}
                placeholder="Shown in the list (optional)"
                className="h-8 bg-white/5 border-white/10 text-white text-xs placeholder:text-white/25"
              />
            </div>
          </div>
          <div
            className="rounded-md border border-dashed border-white/10 bg-white/[0.03] p-2"
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              void handleSelectedFile(e.dataTransfer.files?.[0] ?? null);
            }}
          >
            <p className="text-[10px] text-white/40 mb-2">Drop a file here or choose one</p>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept="image/*,video/*,.pdf,.svg,application/pdf,.doc,.docx"
              onChange={async (e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                await handleSelectedFile(file);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-white/10 bg-white/5 text-white/85 hover:bg-white/10 gap-1.5"
              onClick={() => fileRef.current?.click()}
            >
              <FileUp className="h-3.5 w-3.5" />
              Upload file
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
