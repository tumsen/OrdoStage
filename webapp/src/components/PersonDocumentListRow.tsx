import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PersonDocument } from "../../../backend/src/types";
import { formatDateForDateInput, getPersonDocumentExpiryInfo } from "@/lib/personDocumentExpiry";
import { confirmDeleteAction } from "@/lib/deleteConfirm";

const backendBase = () => import.meta.env.VITE_BACKEND_URL || "";

type Props = {
  doc: PersonDocument;
  canEdit: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  onSave: (id: string, body: { name: string; expiresAt: string | null }) => Promise<void>;
  onDelete: (id: string) => void;
};

export function PersonDocumentListRow({
  doc,
  canEdit,
  isSaving,
  isDeleting,
  onSave,
  onDelete,
}: Props) {
  const [name, setName] = useState(doc.name);
  const [expires, setExpires] = useState(() => formatDateForDateInput(doc.expiresAt ?? null));

  useEffect(() => {
    setName(doc.name);
    setExpires(formatDateForDateInput(doc.expiresAt ?? null));
  }, [doc.id, doc.name, doc.expiresAt]);

  const expiry = getPersonDocumentExpiryInfo(doc.expiresAt);
  const dirty =
    name.trim() !== doc.name ||
    (expires || null) !== (formatDateForDateInput(doc.expiresAt ?? null) || null);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-2 py-2 text-xs border-b border-white/5 last:border-0">
      <div className="min-w-0 flex-1 space-y-1.5">
        {canEdit ? (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 bg-white/5 border-white/10 text-white"
            placeholder="Document name"
            aria-label="Document name"
          />
        ) : (
          <div className="text-white/80 truncate" title={doc.name}>
            {doc.name}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-white/35">
          <span>
            {doc.type} · {doc.filename}
          </span>
          {canEdit && (
            <div className="flex items-center gap-1.5 text-white/50">
              <span className="text-[10px] uppercase tracking-wide">Expires</span>
              <input
                type="date"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
                className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-white text-[11px]"
              />
            </div>
          )}
          {!canEdit && doc.expiresAt ? (
            <span className="text-white/40">· Expires {formatDateForDateInput(doc.expiresAt) || "—"}</span>
          ) : null}
          {expiry.kind === "ok" && (
            <Badge
              className="border border-emerald-500/50 bg-emerald-600/30 text-emerald-100"
            >
              {expiry.daysLeft === 0
                ? "Last day"
                : `${expiry.daysLeft} day${expiry.daysLeft === 1 ? "" : "s"} left`}
            </Badge>
          )}
          {expiry.kind === "expired" && (
            <Badge className="border border-red-500/50 bg-red-800/50 text-red-100">Expired</Badge>
          )}
        </div>
      </div>
      <div className="flex items-center flex-wrap gap-2 shrink-0 sm:justify-end">
        {canEdit && (
          <Button
            type="button"
            size="sm"
            className="h-7 text-[11px] bg-white/10 hover:bg-white/15"
            disabled={!dirty || !name.trim() || isSaving}
            onClick={async () => {
              const expOut = expires.trim() || null;
              await onSave(doc.id, { name: name.trim(), expiresAt: expOut });
            }}
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        )}
        <a
          href={`${backendBase()}/api/people/documents/${doc.id}/download`}
          className="text-blue-300 hover:text-blue-200"
        >
          Download
        </a>
        {canEdit && (
          <button
            type="button"
            className="text-red-300 hover:text-red-200 disabled:opacity-40"
            disabled={isDeleting}
            onClick={() => {
              if (!confirmDeleteAction(`document "${doc.name}"`)) return;
              onDelete(doc.id);
            }}
          >
            {isDeleting ? "…" : "Delete"}
          </button>
        )}
      </div>
    </div>
  );
}
