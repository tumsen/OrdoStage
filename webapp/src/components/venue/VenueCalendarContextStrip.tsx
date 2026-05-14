import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import JSZip from "jszip";
import { toast } from "sonner";

import { DocumentListThumbnail, triggerBlobDownload } from "@/components/DocumentListThumbnail";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { formatVenueCapacityDisplay, formatVenueDimensionMetersDisplay } from "@/lib/venueDisplay";
import type { Venue, VenueDocument } from "@/lib/types";
import { appleMapsUrl, formatAddress, googleMapsUrl } from "@/components/AddressFields";
import { Button } from "@/components/ui/button";
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

/** Venue address + specs and a horizontal strip of document thumbnails (under booking calendars). */
export function VenueCalendarContextStrip({
  venueId,
  venue,
  showEditLink = false,
  archiveFolderName,
  className,
}: {
  venueId: string;
  venue: Venue | null | undefined;
  showEditLink?: boolean;
  /** Root folder inside the ZIP and the `.zip` basename (e.g. event title on event page, venue name on venue page). */
  archiveFolderName?: string;
  className?: string;
}) {
  const [zipping, setZipping] = useState(false);
  const { locale, t } = useI18n();

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

  const stageInfoRows = useMemo(() => {
    if (!venue) return [];
    const rows: Array<{ label: string; value: string }> = [];
    if (venue.capacity != null) {
      rows.push({
        label: t("venueInfo.capacityMetricLabel"),
        value: formatVenueCapacityDisplay(venue.capacity, locale, t),
      });
    }
    if (venue.width?.trim()) {
      rows.push({
        label: t("venueInfo.widthLabel"),
        value: formatVenueDimensionMetersDisplay(venue.width.trim()),
      });
    }
    if (venue.length?.trim()) {
      rows.push({
        label: t("venueInfo.depthLabel"),
        value: formatVenueDimensionMetersDisplay(venue.length.trim()),
      });
    }
    if (venue.height?.trim()) {
      rows.push({
        label: t("venueInfo.heightLabel"),
        value: formatVenueDimensionMetersDisplay(venue.height.trim()),
      });
    }
    return rows;
  }, [venue, locale, t]);

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
      (venue.contactCompanyName?.trim() ||
        venue.contactCompanyVat?.trim() ||
        venue.contactPersonName?.trim() ||
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
      className={cn("w-full min-w-0 space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3", className)}
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
              <LabeledRows title={t("venueInfo.stageCapacityTitle")} rows={stageInfoRows} />
            </div>
          ) : null}

          {hasContact ? (
            <div className="min-w-0 space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-white/40">Contact</div>
              <dl className="grid w-full min-w-0 grid-cols-[minmax(4.5rem,auto)_1fr] gap-x-2 gap-y-1 text-[11px] leading-snug">
                {venue.contactCompanyName?.trim() ? (
                  <div className="contents">
                    <dt className="text-white/40">Company</dt>
                    <dd className="break-words text-white/75">{venue.contactCompanyName.trim()}</dd>
                  </div>
                ) : null}
                {venue.contactCompanyVat?.trim() ? (
                  <div className="contents">
                    <dt className="text-white/40">VAT</dt>
                    <dd className="break-words text-white/75 tabular-nums">{venue.contactCompanyVat.trim()}</dd>
                  </div>
                ) : null}
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
              <DocumentListThumbnail
                key={d.id}
                downloadUrl={documentDownloadUrl(d.id)}
                mimeType={d.mimeType ?? ""}
                filename={d.filename || d.name || "download"}
                preferImage={isImageDoc(d)}
                name={d.name}
                sizeClassName="h-[4.75rem] w-[4.75rem]"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
