import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type { PersonDocument } from "../../../backend/src/types";
import { formatDateForDateInput, getPersonDocumentExpiryInfo } from "@/lib/personDocumentExpiry";
import { confirmDeleteAction } from "@/lib/deleteConfirm";

const backendBase = () => import.meta.env.VITE_BACKEND_URL || "";

export type PersonDocumentSavePatch = {
  name: string;
  doesNotExpire: boolean;
  /** YYYY-MM-DD or `null` when no date (ignored when `doesNotExpire` is true). */
  expiresAt: string | null;
};

type Props = {
  doc: PersonDocument;
  canEdit: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  onSave: (id: string, body: PersonDocumentSavePatch) => Promise<unknown>;
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
  const [doesNotExpire, setDoesNotExpire] = useState(Boolean(doc.doesNotExpire));

  // Only reset when switching to another document — not on every doc refetch, or a stale
  // `doc` briefly overwrites a just-saved name before the list cache updates.
  useEffect(() => {
    setName(doc.name);
    setExpires(formatDateForDateInput(doc.expiresAt ?? null));
    setDoesNotExpire(Boolean(doc.doesNotExpire));
  }, [doc.id]);

  const docDne = doc.doesNotExpire === true;
  const docDate = formatDateForDateInput(doc.expiresAt ?? null) || null;

  const expiry = getPersonDocumentExpiryInfo(doc.expiresAt, docDne);
  const localExp = doesNotExpire ? null : (expires.trim() || null);
  const docExp = docDne ? null : docDate;
  const dirty =
    name.trim() !== doc.name || doesNotExpire !== docDne || localExp !== docExp;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-2 py-2 text-xs border-b border-white/5 last:border-0 w-full min-w-0">
      <div className="min-w-0 flex-1 w-full space-y-1.5">
        {canEdit ? (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 w-full min-w-0 bg-white/5 border-white/10 text-white"
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
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3 text-white/50">
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-white/55">
                <Checkbox
                  checked={doesNotExpire}
                  onCheckedChange={(v) => {
                    const on = v === true;
                    setDoesNotExpire(on);
                    if (on) setExpires("");
                  }}
                  className="border-white/30 data-[state=checked]:bg-violet-600"
                />
                <span>Does not expire</span>
              </label>
              <div className="flex items-center gap-1.5 min-h-[1.5rem]">
                <span className="text-[10px] uppercase tracking-wide">Expires</span>
                <input
                  type="date"
                  value={expires}
                  disabled={doesNotExpire}
                  onChange={(e) => setExpires(e.target.value)}
                  className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-white text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          )}
          {!canEdit && doc.doesNotExpire ? (
            <span className="text-white/40">· No expiry ( ∞ )</span>
          ) : !canEdit && doc.expiresAt ? (
            <span className="text-white/40">· Expires {formatDateForDateInput(doc.expiresAt) || "—"}</span>
          ) : null}
          {expiry.kind === "forever" && (
            <Badge className="border border-violet-500/50 bg-violet-800/40 text-violet-100 tabular-nums" title="Does not expire">
              <span>∞</span>
            </Badge>
          )}
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
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const n = name.trim();
              if (!n || isSaving) return;
              // Full snapshot (not a diff) so the server + cache always get a consistent state.
              await onSave(doc.id, {
                name: n,
                doesNotExpire,
                expiresAt: doesNotExpire ? null : (expires.trim() || null),
              });
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
