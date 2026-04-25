import { useState, useEffect, useImperativeHandle, forwardRef } from "react";
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

export type PersonDocumentListRowHandle = {
  /** Persists the row when there are unsaved changes (e.g. before the parent form saves). */
  saveIfDirty: () => Promise<void>;
};

function buildSaveBody(
  name: string,
  doesNotExpire: boolean,
  expires: string
): PersonDocumentSavePatch {
  return {
    name: name.trim(),
    doesNotExpire,
    expiresAt: doesNotExpire ? null : expires.trim() || null,
  };
}

export const PersonDocumentListRow = forwardRef<PersonDocumentListRowHandle, Props>(function PersonDocumentListRow(
  {
  doc,
  canEdit,
  isSaving,
  isDeleting,
  onSave,
  onDelete,
}: Props,
  ref
) {
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

  useImperativeHandle(
    ref,
    () => ({
      async saveIfDirty() {
        if (!canEdit) return;
        if (!name.trim() || isSaving) return;
        if (!dirty) return;
        await onSave(doc.id, buildSaveBody(name, doesNotExpire, expires));
      },
    }),
    [canEdit, dirty, name, doesNotExpire, expires, isSaving, doc.id, onSave]
  );

  return (
    <div className="flex items-center gap-2 px-2 py-2 text-xs border-b border-white/5 last:border-0 w-full min-w-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {canEdit ? (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-7 w-[14rem] min-w-[10rem] bg-white/5 border-white/10 text-white"
            placeholder="Document name"
            aria-label="Document name"
          />
        ) : (
          <div className="text-white/80 truncate min-w-[10rem] max-w-[16rem]" title={doc.name}>
            {doc.name}
          </div>
        )}
        <span className="text-white/35 truncate min-w-[10rem]" title={`${doc.type} · ${doc.filename}`}>
          {doc.type} · {doc.filename}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
        {expiry.kind === "forever" && (
          <Badge className="border border-violet-500/50 bg-violet-800/40 text-violet-100 tabular-nums whitespace-nowrap" title="Does not expire">
            <span>∞</span>
          </Badge>
        )}
        {expiry.kind === "ok" && (
          <Badge className="border border-emerald-500/50 bg-emerald-600/30 text-emerald-100 whitespace-nowrap">
            {expiry.daysLeft === 0
              ? "Last day"
              : `${expiry.daysLeft} day${expiry.daysLeft === 1 ? "" : "s"} left`}
          </Badge>
        )}
        {expiry.kind === "expired" && (
          <Badge className="border border-red-500/50 bg-red-800/50 text-red-100 whitespace-nowrap">Expired</Badge>
        )}
        {canEdit ? (
          <>
            <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-white/55 whitespace-nowrap">
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
            <input
              type="date"
              value={expires}
              disabled={doesNotExpire}
              onChange={(e) => setExpires(e.target.value)}
              className="h-7 rounded border border-white/10 bg-white/5 px-1.5 py-0 text-white text-[11px] disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </>
        ) : doc.doesNotExpire ? (
          <span className="text-white/40 whitespace-nowrap">No expiry (∞)</span>
        ) : doc.expiresAt ? (
          <span className="text-white/40 whitespace-nowrap">
            Expires {formatDateForDateInput(doc.expiresAt) || "—"}
          </span>
        ) : null}
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
              await onSave(doc.id, buildSaveBody(n, doesNotExpire, expires));
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
});
