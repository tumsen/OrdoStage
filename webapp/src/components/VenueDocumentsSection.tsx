import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
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

const backendBase = () => import.meta.env.VITE_BACKEND_URL || "";

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

function kindLabel(kind: VenueDocKind): string {
  if (kind === "drawing") return "Drawing";
  if (kind === "image") return "Image";
  return "Other";
}

export function VenueDocumentsSection({
  venueId,
  canWrite,
}: {
  venueId: string;
  canWrite: boolean;
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

  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <Label className="text-white/50 text-xs uppercase tracking-wide">Drawings &amp; photos</Label>
      <p className="text-[10px] text-white/35 leading-snug">
        Floor plans, plots, rigging drawings, and reference images for this venue.
      </p>
      {isLoading ? (
        <p className="text-[11px] text-white/35 py-1">Loading…</p>
      ) : (docs ?? []).length === 0 ? (
        <p className="text-[11px] text-white/35 py-1">No files yet.</p>
      ) : (
        <ul className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
          {(docs ?? []).map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-2 py-1.5 text-[11px]"
            >
              <Badge
                variant="outline"
                className="shrink-0 border-white/15 text-white/70 text-[10px] font-normal"
              >
                {kindLabel(d.kind)}
              </Badge>
              <span className="text-white/80 truncate min-w-0 flex-1" title={d.filename}>
                {d.name}
              </span>
              <a
                href={`${backendBase()}/api/venues/documents/${d.id}/download`}
                className="shrink-0 text-blue-300 hover:text-blue-200"
              >
                Download
              </a>
              {canWrite ? (
                <button
                  type="button"
                  className="shrink-0 text-red-300/80 hover:text-red-200 disabled:opacity-40 p-0.5"
                  title="Delete"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (!confirmDeleteAction(`file “${d.name}”`)) return;
                    deleteMutation.mutate(d.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <div className="space-y-2 pt-1 border-t border-white/5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-white/45 text-[10px] uppercase tracking-wide">File type</Label>
              <Select
                value={uploadKind}
                onValueChange={(v) => setUploadKind(v as VenueDocKind)}
              >
                <SelectTrigger className="h-8 bg-white/5 border-white/10 text-white text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#16161f] border-white/10 text-white">
                  <SelectItem value="drawing">Drawing (PDF, CAD export, etc.)</SelectItem>
                  <SelectItem value="image">Image (PNG, JPG, …)</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/45 text-[10px] uppercase tracking-wide">Label</Label>
              <Input
                value={uploadLabel}
                onChange={(e) => setUploadLabel(e.target.value)}
                placeholder="Shown in the list (optional)"
                className="h-8 bg-white/5 border-white/10 text-white text-xs placeholder:text-white/25"
              />
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.svg,application/pdf"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
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
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-white/15 bg-white/5 text-white/85 hover:bg-white/10 gap-1.5"
            onClick={() => fileRef.current?.click()}
          >
            <FileUp className="h-3.5 w-3.5" />
            Upload file
          </Button>
        </div>
      ) : null}
    </div>
  );
}
