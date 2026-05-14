import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { api } from "@/lib/api";
import type { Venue, VenueDocument } from "@/lib/types";
import { appleMapsUrl, formatAddress, googleMapsUrl } from "@/components/AddressFields";
import { Skeleton } from "@/components/ui/skeleton";

function documentDownloadUrl(docId: string): string {
  const base = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/+$/, "");
  return `${base}/api/venues/documents/${docId}/download`;
}

function isImageDoc(d: VenueDocument): boolean {
  return d.kind === "image" || (d.mimeType?.startsWith("image/") ?? false);
}

function DocThumb({ doc }: { doc: VenueDocument }) {
  const [imgErr, setImgErr] = useState(false);
  const url = documentDownloadUrl(doc.id);
  const tryImg = isImageDoc(doc) && !imgErr;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={`${doc.name} (${doc.filename})`}
      className="group relative shrink-0 flex h-[4.75rem] w-[4.75rem] flex-col overflow-hidden rounded-md border border-white/10 bg-white/[0.04] hover:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/45"
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
    </a>
  );
}

/** Venue address + specs and a horizontal strip of document thumbnails (under booking calendars). */
export function VenueCalendarContextStrip({
  venueId,
  venue,
  showEditLink = false,
}: {
  venueId: string;
  venue: Venue | null | undefined;
  showEditLink?: boolean;
}) {
  const { data: docs, isLoading } = useQuery({
    queryKey: ["venues", venueId, "documents"],
    queryFn: () => api.get<VenueDocument[]>(`/api/venues/${venueId}/documents`),
    enabled: Boolean(venueId),
  });

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

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-white/45">Venue info</div>
          {venue ? (
            <>
              <div className="text-sm font-medium text-white/90">{venue.name}</div>
              {hasAddr ? (
                <p className="text-xs leading-snug text-white/55">{addr}</p>
              ) : (
                <p className="text-xs text-white/35">No address on file</p>
              )}
              {venue.capacity != null || venue.width || venue.length || venue.height ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/45">
                  {venue.capacity != null ? (
                    <span>Capacity {venue.capacity.toLocaleString()}</span>
                  ) : null}
                  {venue.width || venue.length || venue.height ? (
                    <span>
                      Stage W {venue.width ?? "—"} · L {venue.length ?? "—"} · H {venue.height ?? "—"}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {venue.notes?.trim() ? (
                <p className="line-clamp-3 text-[11px] leading-snug text-white/50" title={venue.notes}>
                  {venue.notes}
                </p>
              ) : null}
            </>
          ) : (
            <Skeleton className="h-16 w-full max-w-lg bg-white/5" />
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

      <div>
        <div className="mb-2 text-[10px] uppercase tracking-wide text-white/45">Drawings &amp; photos</div>
        {isLoading ? (
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[4.75rem] w-[4.75rem] shrink-0 rounded-md bg-white/5" />
            ))}
          </div>
        ) : (docs ?? []).length === 0 ? (
          <p className="text-[11px] text-white/35">
            No venue files yet.
            {showEditLink ? " Upload from venue edit." : ""}
          </p>
        ) : (
          <div className="-mx-0.5 flex gap-2 overflow-x-auto px-0.5 pb-0.5">
            {(docs ?? []).map((d) => (
              <DocThumb key={d.id} doc={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
