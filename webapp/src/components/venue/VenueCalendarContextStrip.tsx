import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import JSZip from "jszip";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import type { Venue, VenueDocument } from "@/lib/types";
import { appleMapsUrl, formatAddress, googleMapsUrl } from "@/components/AddressFields";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function documentDownloadPath(docId: string): string {
  return `/api/venues/documents/${docId}/download`;
}

function documentDownloadUrl(docId: string): string {
  const base = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/+$/, "");
  return `${base}${documentDownloadPath(docId)}`;
}

function sanitizeForPath(raw: string, maxLen = 120): string {
  const trimmed = raw.trim().slice(0, maxLen) || "files";
  const cleaned = trimmed.replace(/[/\\?%*:|"<>]/g, "_").replace(/\s+/g, " ").trim();
  return cleaned || "files";
}

function sanitizeEntryFilename(name: string): string {
  const base = name.trim().replace(/[/\\]/g, "_") || "file";
  return base.slice(0, 200);
}

function uniqueFileName(base: string, used: Set<string>): string {
  let n = base;
  let i = 1;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  while (used.has(n)) {
    i += 1;
    n = ext ? `${stem} (${i})${ext}` : `${base} (${i})`;
  }
  used.add(n);
  return n;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const a = document.createElement("a");
  const href = URL.createObjectURL(blob);
  a.href = href;
  a.download = filename;
  a.rel = "noreferrer";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(href);
}

function isImageDoc(d: VenueDocument): boolean {
  return d.kind === "image" || (d.mimeType?.startsWith("image/") ?? false);
}

function LabeledRows({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
}) {
  const filtered = rows.filter((r) => r.value.trim().length > 0);
  if (filtered.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wide text-white/40">{title}</div>
      <dl className="grid w-full min-w-0 grid-cols-[minmax(4.5rem,auto)_1fr] gap-x-2 gap-y-1 text-[11px] leading-snug">
        {filtered.map(({ label, value }) => (
          <div key={label} className="contents">
            <dt className="text-white/40">{label}</dt>
            <dd className="break-words text-white/75">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function DocThumb({ doc }: { doc: VenueDocument }) {
  const [imgErr, setImgErr] = useState(false);
  const [previewErr, setPreviewErr] = useState(false);
  const url = documentDownloadUrl(doc.id);
  const tryImg = isImageDoc(doc) && !imgErr;

  const handleDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const res = await api.raw(documentDownloadPath(doc.id));
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        triggerBlobDownload(blob, doc.filename || doc.name || "download");
      } catch {
        toast.error("Download failed");
      }
    },
    [doc.filename, doc.id, doc.name],
  );

  return (
    <HoverCard openDelay={100} closeDelay={280}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          title={`${doc.name} (${doc.filename}) — hover for preview`}
          aria-label={`Preview ${doc.name}`}
          className="group relative flex h-[4.75rem] w-[4.75rem] shrink-0 flex-col overflow-hidden rounded-md border border-white/10 bg-white/[0.04] text-left hover:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/45"
        >
          {tryImg ? (
            <img
              src={url}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              onError={() => setImgErr(true)}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-1.5">
              <FileText className="h-5 w-5 shrink-0 text-white/45" aria-hidden />
              <span className="line-clamp-2 text-center text-[9px] leading-tight text-white/55">{doc.name}</span>
            </div>
          )}
          {tryImg ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-1 bg-gradient-to-t from-black/80 to-transparent px-1 pb-1 pt-3 text-[9px] text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
              {doc.name}
            </div>
          ) : null}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="center"
        sideOffset={8}
        className="w-auto max-w-[min(92vw,26rem)] border-white/10 bg-[#14141a] p-3 text-white shadow-xl"
      >
        <div className="overflow-hidden rounded-md border border-white/10 bg-black/50">
          {tryImg && !previewErr ? (
            <img
              src={url}
              alt=""
              className="max-h-[min(70vh,22rem)] w-full max-w-full object-contain"
              loading="eager"
              onError={() => setPreviewErr(true)}
            />
          ) : (
            <div className="flex min-h-[9rem] flex-col items-center justify-center gap-2 px-6 py-8">
              <FileText className="h-12 w-12 text-white/35" aria-hidden />
              <span className="max-w-[18rem] text-center text-xs leading-snug text-white/65">{doc.name}</span>
              {tryImg && previewErr ? (
                <span className="text-center text-[10px] text-white/40">Preview unavailable — use Download.</span>
              ) : null}
            </div>
          )}
        </div>
        <div className="mt-2 space-y-1">
          <p className="line-clamp-2 text-[11px] font-medium text-white/90">{doc.name}</p>
          <p className="truncate text-[10px] text-white/40">{doc.filename}</p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-1.5 w-full gap-2 bg-white/10 text-white hover:bg-white/15"
            onClick={handleDownload}
          >
            <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Download
          </Button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

/** Venue address + specs and a horizontal strip of document thumbnails (under booking calendars). */
export function VenueCalendarContextStrip({
  venueId,
  venue,
  showEditLink = false,
  archiveFolderName,
  flatTop = false,
  className,
}: {
  venueId: string;
  venue: Venue | null | undefined;
  showEditLink?: boolean;
  /** Root folder inside the ZIP and the `.zip` basename (e.g. event title on event page, venue name on venue page). */
  archiveFolderName?: string;
  /** When true, no top border/radius so the card can sit flush under a calendar panel. */
  flatTop?: boolean;
  className?: string;
}) {
  const [zipping, setZipping] = useState(false);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["venues", venueId, "documents"],
    queryFn: () => api.get<VenueDocument[]>(`/api/venues/${venueId}/documents`),
    enabled: Boolean(venueId),
  });

  const folderBase = useMemo(
    () =>
      sanitizeForPath(
        archiveFolderName?.trim() || venue?.name?.trim() || "venue-documents",
      ),
    [archiveFolderName, venue?.name],
  );

  const handleDownloadAll = useCallback(async () => {
    const list = docs ?? [];
    if (list.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      const root = zip.folder(folderBase);
      if (!root) throw new Error("Could not create archive folder");
      const used = new Set<string>();
      let ok = 0;
      for (const d of list) {
        const res = await api.raw(documentDownloadPath(d.id));
        if (!res.ok) continue;
        const blob = await res.blob();
        const fname = uniqueFileName(sanitizeEntryFilename(d.filename || d.name || "file"), used);
        root.file(fname, blob);
        ok += 1;
      }
      if (ok === 0) {
        toast.error("Could not download venue files. Check your connection or sign in again.");
        return;
      }
      const out = await zip.generateAsync({ type: "blob" });
      triggerBlobDownload(out, `${folderBase}.zip`);
      if (ok < list.length) {
        toast.message(`Packed ${ok} of ${list.length} files (some were skipped).`);
      } else {
        toast.success("ZIP download started.");
      }
    } catch {
      toast.error("Could not build the ZIP archive.");
    } finally {
      setZipping(false);
    }
  }, [docs, folderBase]);

  if (!venueId) return null;

  const addrParts = venue
    ? {
        street: venue.addressStreet,
        number: venue.addressNumber,
        zip: venue.addressZip,
        city: venue.addressCity,
        state: venue.addressState,
        country: venue.addressCountry,
      }
    : null;
  const addr = addrParts ? formatAddress(addrParts) : "";
  const hasAddr = Boolean(
    venue?.addressStreet?.trim() ||
      venue?.addressCity?.trim() ||
      venue?.addressCountry?.trim()
  );

  const hasContact = Boolean(
    venue &&
      (venue.contactPersonName?.trim() ||
        venue.contactPersonRole?.trim() ||
        venue.contactPersonPhone?.trim() ||
        venue.contactPersonEmail?.trim()),
  );

  const docList = docs ?? [];
  const showDownloadAll = !isLoading && docList.length > 0;

  const hasStageInfo = Boolean(
    venue &&
      (venue.capacity != null ||
        venue.width?.trim() ||
        venue.length?.trim() ||
        venue.height?.trim()),
  );

  return (
    <div
      className={cn(
        "w-full min-w-0 space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3",
        flatTop && "rounded-t-none border-t-0",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide text-white/45">Venue info</div>
          {venue ? (
            <>
              <div className="mt-1 text-sm font-medium text-white/90">{venue.name}</div>
              {venue.documentCount != null ? (
                <p className="mt-0.5 text-[11px] text-white/40">
                  {venue.documentCount} file{venue.documentCount === 1 ? "" : "s"} on record
                </p>
              ) : null}
            </>
          ) : (
            <Skeleton className="mt-2 h-5 w-48 max-w-full bg-white/5" />
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5 text-[11px]">
          {venue && hasAddr && addrParts ? (
            <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
              <a
                href={googleMapsUrl(addrParts)}
                target="_blank"
                rel="noreferrer"
                className="text-blue-300 hover:text-blue-200"
              >
                Google Maps
              </a>
              <a
                href={appleMapsUrl(addrParts)}
                target="_blank"
                rel="noreferrer"
                className="text-blue-300 hover:text-blue-200"
              >
                Apple Maps
              </a>
            </div>
          ) : null}
          {showEditLink ? (
            <Link
              to={`/venues/${venueId}/edit`}
              className="text-white/45 underline-offset-2 hover:text-white/75 hover:underline"
            >
              Edit venue &amp; files
            </Link>
          ) : null}
        </div>
      </div>

      {venue ? (
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
          <div className="min-w-0 space-y-2">
            {hasAddr ? (
              <>
                <LabeledRows
                  title="Address"
                  rows={[
                    { label: "Street", value: venue.addressStreet ?? "" },
                    { label: "No.", value: venue.addressNumber ?? "" },
                    { label: "ZIP", value: venue.addressZip ?? "" },
                    { label: "City", value: venue.addressCity ?? "" },
                    { label: "State", value: venue.addressState ?? "" },
                    { label: "Country", value: venue.addressCountry ?? "" },
                  ]}
                />
                <p className="text-[11px] leading-snug text-white/45">{addr}</p>
              </>
            ) : (
              <p className="text-xs text-white/35">No address on file</p>
            )}
          </div>

          {hasStageInfo ? (
            <div className="min-w-0">
              <LabeledRows
                title="Stage & capacity"
                rows={[
                  ...(venue.capacity != null
                    ? [{ label: "Capacity", value: venue.capacity.toLocaleString() }]
                    : []),
                  ...(venue.width?.trim() ? [{ label: "Width", value: venue.width.trim() }] : []),
                  ...(venue.length?.trim() ? [{ label: "Depth", value: venue.length.trim() }] : []),
                  ...(venue.height?.trim() ? [{ label: "Height", value: venue.height.trim() }] : []),
                ]}
              />
            </div>
          ) : null}

          {hasContact ? (
            <div className="min-w-0 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-white/40">Contact</div>
              <dl className="grid w-full min-w-0 grid-cols-[minmax(4.5rem,auto)_1fr] gap-x-2 gap-y-1 text-[11px] leading-snug">
                {venue.contactPersonName?.trim() ? (
                  <div className="contents">
                    <dt className="text-white/40">Name</dt>
                    <dd className="break-words text-white/75">{venue.contactPersonName.trim()}</dd>
                  </div>
                ) : null}
                {venue.contactPersonRole?.trim() ? (
                  <div className="contents">
                    <dt className="text-white/40">Role</dt>
                    <dd className="break-words text-white/75">{venue.contactPersonRole.trim()}</dd>
                  </div>
                ) : null}
                {venue.contactPersonPhone?.trim() ? (
                  <div className="contents">
                    <dt className="text-white/40">Phone</dt>
                    <dd className="break-words text-white/75">
                      <a href={`tel:${venue.contactPersonPhone.trim()}`} className="text-blue-300 hover:text-blue-200">
                        {venue.contactPersonPhone.trim()}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {venue.contactPersonEmail?.trim() ? (
                  <div className="contents">
                    <dt className="text-white/40">Email</dt>
                    <dd className="break-all text-white/75">
                      <a
                        href={`mailto:${venue.contactPersonEmail.trim()}`}
                        className="text-blue-300 hover:text-blue-200"
                      >
                        {venue.contactPersonEmail.trim()}
                      </a>
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}

          {(venue.customFields ?? []).length > 0 ? (
            <div className="min-w-0 space-y-1.5 md:col-span-2 xl:col-span-1">
              <div className="text-[10px] uppercase tracking-wide text-white/40">Custom fields</div>
              <ul className="list-inside list-disc space-y-0.5 text-[11px] leading-snug text-white/70">
                {(venue.customFields ?? []).map((f, i) => (
                  <li key={`${i}-${f.key}`}>
                    <span className="text-white/50">{f.key}:</span> {f.value}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {venue.notes?.trim() ? (
            <div className="col-span-full min-w-0 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-white/40">Notes</div>
              <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-white/65">{venue.notes}</p>
            </div>
          ) : null}
        </div>
      ) : (
        <Skeleton className="h-24 w-full max-w-lg bg-white/5" />
      )}

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-wide text-white/45">Drawings &amp; photos</div>
          {showDownloadAll ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={zipping}
              className="h-7 border-white/15 bg-white/[0.04] text-[11px] text-white/80 hover:bg-white/10 hover:text-white"
              onClick={() => void handleDownloadAll()}
            >
              {zipping ? "Preparing ZIP…" : "Download all"}
            </Button>
          ) : null}
        </div>
        {isLoading ? (
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[4.75rem] w-[4.75rem] shrink-0 rounded-md bg-white/5" />
            ))}
          </div>
        ) : docList.length === 0 ? (
          <p className="text-[11px] text-white/35">
            No venue files yet.
            {showEditLink ? " Upload from venue edit." : ""}
          </p>
        ) : (
          <div className="-mx-0.5 flex gap-2 overflow-x-auto px-0.5 pb-0.5">
            {docList.map((d) => (
              <DocThumb key={d.id} doc={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
