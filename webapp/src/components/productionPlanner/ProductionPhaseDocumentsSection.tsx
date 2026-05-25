import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/dateUtils";
import type { ProductionPhaseDocument } from "@/lib/types";
import { DocumentListThumbnail } from "@/components/DocumentListThumbnail";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { toast } from "@/hooks/use-toast";

const DOC_TYPES = ["brief", "drawing", "schedule", "contract", "other"] as const;

export function ProductionPhaseDocumentsSection({
  phaseId,
  canEdit,
}: {
  phaseId: string;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["production-phase-documents", phaseId];
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState<string>("other");
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);

  const { data: documents = [], isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      api.get<ProductionPhaseDocument[]>(`/api/productions/phases/${phaseId}/documents`),
    enabled: !!phaseId,
  });

  const backendBase = import.meta.env.VITE_BACKEND_URL || "";

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      const form = new FormData();
      form.append("file", file);
      form.append("name", docName || file.name);
      form.append("type", docType);
      const res = await api.raw(`/api/productions/phases/${phaseId}/documents`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setUploadOpen(false);
      setFile(null);
      setDocName("");
      setDocType("other");
      toast({ title: "Document uploaded" });
    },
    onError: (e) =>
      toast({
        title: e instanceof Error ? e.message : "Upload failed",
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => api.delete(`/api/productions/phase-documents/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setDeleteDocId(null);
      toast({ title: "Document removed" });
    },
    onError: () => toast({ title: "Could not delete", variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-white/45">Documents</p>
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 border-white/10 text-white/80"
            onClick={() => setUploadOpen(true)}
          >
            <Upload className="h-3.5 w-3.5" />
            Upload
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <p className="text-sm text-white/35">Loading documents…</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-white/35 py-4 text-center rounded-lg border border-dashed border-white/10">
          No documents for this task yet.
        </p>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2.5"
            >
              <DocumentListThumbnail
                downloadUrl={`${backendBase}/api/productions/phase-documents/${doc.id}/download`}
                mimeType={doc.mimeType}
                filename={doc.filename}
                preferImage={doc.mimeType.startsWith("image/")}
                name={doc.name}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white/90">{doc.name}</div>
                <div className="mt-0.5 text-xs capitalize text-white/40">
                  {doc.type} · {formatDate(doc.createdAt)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a
                  href={`${backendBase}/api/productions/phase-documents/${doc.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/25 hover:text-white"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </a>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/25 hover:text-red-400"
                    onClick={() => setDeleteDocId(doc.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="bg-[#16161f] border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs">File</Label>
              <Input
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !docName) setDocName(f.name.replace(/\.[^.]+$/, ""));
                }}
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs">Name</Label>
              <Input
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                className="bg-white/5 border-white/10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/60 text-xs">Type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#16161f] border-white/10">
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="border-white/10"
              onClick={() => setUploadOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-red-900 hover:bg-red-800"
              disabled={!file || uploadMutation.isPending}
              onClick={() => uploadMutation.mutate()}
            >
              {uploadMutation.isPending ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteDocId} onOpenChange={() => setDeleteDocId(null)}>
        <AlertDialogContent className="bg-[#16161f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60">
              This file will be removed from the task permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-transparent text-white hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-900 hover:bg-red-800"
              onClick={() => deleteDocId && deleteMutation.mutate(deleteDocId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
