import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Download, File, FileText, Film } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const boxBase =
  "shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/35 flex items-center justify-center";

const hoverCardContentClass =
  "w-auto max-w-[min(92vw,26rem)] border-white/10 bg-[#14141a] p-3 text-white shadow-xl";

export function triggerBlobDownload(blob: Blob, filename: string) {
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

/** Same-origin `/api/...` downloads use `api.raw` so cookies + base URL match the app. */
async function fetchDocumentBlob(downloadUrl: string): Promise<Blob> {
  let pathForRaw: string | null = null;
  try {
    const u = new URL(downloadUrl, typeof window !== "undefined" ? window.location.href : "http://localhost");
    if (u.pathname.startsWith("/api/")) {
      pathForRaw = `${u.pathname}${u.search}`;
    }
  } catch {
    /* ignore */
  }

  if (pathForRaw) {
    const res = await api.raw(pathForRaw);
    if (!res.ok) throw new Error(String(res.status));
    return res.blob();
  }

  const res = await fetch(downloadUrl, { credentials: "include" });
  if (!res.ok) throw new Error(String(res.status));
  return res.blob();
}

function isImageMime(m: string) {
  return m.startsWith("image/");
}

function isVideoMime(m: string) {
  return m.startsWith("video/");
}

function isVideoFilename(fn: string) {
  return /\.(mp4|webm|mov|m4v|ogg|ogv)$/i.test(fn);
}

function isPdfMime(m: string, fn: string) {
  return m.includes("pdf") || fn.toLowerCase().endsWith(".pdf");
}

/** Fetch PDF once (when enabled) as a blob URL so preview works with cookie auth. */
function useAuthenticatedPdfObjectUrl(downloadUrl: string, enabled: boolean) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled || !downloadUrl) return;
    let cancelled = false;
    let created: string | null = null;
    setLoading(true);
    setFailed(false);
    setObjectUrl(null);

    void (async () => {
      try {
        const blob = await fetchDocumentBlob(downloadUrl);
        if (cancelled) return;
        const pdfBlob =
          blob.type.includes("pdf") || blob.type === "application/octet-stream" || !blob.type
            ? new Blob([blob], { type: "application/pdf" })
            : blob;
        created = URL.createObjectURL(pdfBlob);
        setObjectUrl(created);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [downloadUrl, enabled]);

  return { objectUrl, loading, failed };
}

function PdfIframePreview({ src, title }: { src: string; title: string }) {
  return (
    <iframe
      title={title}
      src={src}
      className="h-[min(70vh,22rem)] w-[min(92vw,28rem)] max-w-full rounded-md border-0 bg-white"
    />
  );
}

function Placeholder({ mimeType, filename }: { mimeType: string; filename: string }) {
  if (isPdfMime(mimeType, filename)) {
    return <FileText className="h-5 w-5 text-red-300/75" aria-hidden />;
  }
  if (isVideoMime(mimeType) || isVideoFilename(filename)) {
    return <Film className="h-5 w-5 text-white/45" aria-hidden />;
  }
  return <File className="h-5 w-5 text-white/40" aria-hidden />;
}

function LargePreviewIcon({ mimeType, filename }: { mimeType: string; filename: string }) {
  if (isPdfMime(mimeType, filename)) {
    return <FileText className="h-12 w-12 shrink-0 text-white/35" aria-hidden />;
  }
  if (isVideoMime(mimeType) || isVideoFilename(filename)) {
    return <Film className="h-12 w-12 shrink-0 text-white/35" aria-hidden />;
  }
  return <File className="h-12 w-12 shrink-0 text-white/35" aria-hidden />;
}

function LargePreviewFallback({
  mimeType,
  filename,
  primaryLabel,
  previewUnavailable,
}: {
  mimeType: string;
  filename: string;
  primaryLabel: string;
  previewUnavailable?: boolean;
}) {
  return (
    <div className="flex min-h-[9rem] flex-col items-center justify-center gap-2 px-6 py-8">
      <LargePreviewIcon mimeType={mimeType} filename={filename} />
      <span className="max-w-[18rem] text-center text-xs leading-snug text-white/65">{primaryLabel}</span>
      {previewUnavailable ? (
        <span className="text-center text-[10px] text-white/40">Preview unavailable — use Download.</span>
      ) : null}
    </div>
  );
}

type DocumentListThumbnailProps = {
  downloadUrl: string;
  mimeType: string;
  filename: string;
  /** Venue `kind === "image"` — try `<img>` even if MIME is missing or generic. */
  preferImage?: boolean;
  sizeClassName?: string;
  /** Shown on the tile (e.g. venue file label) and as the main line in the hover card. */
  name?: string;
  /** Skip hover preview (rare escape hatch). */
  disableHoverPreview?: boolean;
  className?: string;
};

/** Small preview for a remote document with hover enlargement + download (same pattern as venue booking strip). */
export function DocumentListThumbnail({
  downloadUrl,
  mimeType,
  filename,
  preferImage = false,
  sizeClassName = "h-11 w-11",
  name,
  disableHoverPreview = false,
  className,
}: DocumentListThumbnailProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  const [previewImgErr, setPreviewImgErr] = useState(false);
  const [previewVideoErr, setPreviewVideoErr] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [pdfRequested, setPdfRequested] = useState(false);

  const tryImage = !loadFailed && (preferImage || isImageMime(mimeType));
  const tryVideo =
    !loadFailed && !tryImage && (isVideoMime(mimeType) || (isVideoFilename(filename) && Boolean(downloadUrl)));
  const tryPdf = !tryImage && !tryVideo && isPdfMime(mimeType, filename);

  useEffect(() => {
    setLoadFailed(false);
    setPdfRequested(false);
  }, [downloadUrl, mimeType, filename, preferImage]);

  useEffect(() => {
    setPreviewImgErr(false);
    setPreviewVideoErr(false);
  }, [downloadUrl, mimeType, filename, preferImage]);

  useEffect(() => {
    if (hoverOpen && tryPdf) setPdfRequested(true);
  }, [hoverOpen, tryPdf]);

  const pdfPreview = useAuthenticatedPdfObjectUrl(downloadUrl, pdfRequested && tryPdf);

  const primaryLabel = (name?.trim() || filename).trim() || "Document";

  const handleDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const blob = await fetchDocumentBlob(downloadUrl);
        triggerBlobDownload(blob, filename || primaryLabel || "download");
      } catch {
        toast.error("Download failed");
      }
    },
    [downloadUrl, filename, primaryLabel],
  );

  const box = cn(boxBase, sizeClassName, className);
  const triggerTitle = `${primaryLabel} — hover for preview`;

  const triggerInner = (
    <>
      {tryImage ? (
        <img
          src={downloadUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setLoadFailed(true)}
        />
      ) : tryVideo ? (
        <video
          src={downloadUrl}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
          onError={() => setLoadFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-1.5">
          <Placeholder mimeType={mimeType} filename={filename} />
          {name?.trim() ? (
            <span className="line-clamp-2 text-center text-[9px] leading-tight text-white/55">{name.trim()}</span>
          ) : null}
        </div>
      )}
      {tryImage ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-1 bg-gradient-to-t from-black/80 to-transparent px-1 pb-1 pt-3 text-[9px] text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
          {primaryLabel}
        </div>
      ) : null}
    </>
  );

  const previewBlock = (
    <div className="overflow-hidden rounded-md border border-white/10 bg-black/50">
      {tryImage && !previewImgErr ? (
        <img
          src={downloadUrl}
          alt=""
          className="max-h-[min(70vh,22rem)] w-full max-w-full object-contain"
          loading="eager"
          onError={() => setPreviewImgErr(true)}
        />
      ) : tryVideo && !previewVideoErr ? (
        <video
          src={downloadUrl}
          className="max-h-[min(70vh,22rem)] w-full max-w-full object-contain"
          controls
          playsInline
          preload="metadata"
          onError={() => setPreviewVideoErr(true)}
        />
      ) : tryPdf ? (
        pdfPreview.loading || (!pdfPreview.objectUrl && !pdfPreview.failed) ? (
          <div className="flex min-h-[9rem] items-center justify-center px-6 py-8 text-xs text-white/50">
            Loading preview…
          </div>
        ) : pdfPreview.objectUrl ? (
          <PdfIframePreview src={pdfPreview.objectUrl} title={`Preview ${primaryLabel}`} />
        ) : (
          <LargePreviewFallback
            mimeType={mimeType}
            filename={filename}
            primaryLabel={primaryLabel}
            previewUnavailable
          />
        )
      ) : (
        <LargePreviewFallback
          mimeType={mimeType}
          filename={filename}
          primaryLabel={primaryLabel}
          previewUnavailable={(tryImage && previewImgErr) || (tryVideo && previewVideoErr)}
        />
      )}
    </div>
  );

  if (disableHoverPreview) {
    return <div className={cn("group relative", box)}>{triggerInner}</div>;
  }

  return (
    <HoverCard open={hoverOpen} onOpenChange={setHoverOpen} openDelay={100} closeDelay={280}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          title={triggerTitle}
          aria-label={`Preview ${primaryLabel}`}
          className={cn(
            "group relative flex shrink-0 flex-col overflow-hidden rounded-md border border-white/10 bg-white/[0.04] text-left hover:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/45",
            sizeClassName,
            className,
          )}
        >
          {triggerInner}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="center"
        sideOffset={8}
        className={cn(hoverCardContentClass, tryPdf && "max-w-[min(92vw,32rem)]")}
      >
        {previewBlock}
        <div className="mt-2 space-y-1">
          <p className="line-clamp-2 text-[11px] font-medium text-white/90">{primaryLabel}</p>
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

type LocalFileThumbnailProps = {
  file: File;
  sizeClassName?: string;
  className?: string;
};

/** Preview for a `File` before upload (object URL for image/video/pdf; icon fallback otherwise) with hover enlargement. */
export function LocalFileThumbnail({ file, sizeClassName = "h-11 w-11", className }: LocalFileThumbnailProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  const isPdf = isPdfMime(file.type, file.name);

  useEffect(() => {
    if (file.type.startsWith("image/") || file.type.startsWith("video/") || isPdf) {
      const u = URL.createObjectURL(
        isPdf && !file.type.includes("pdf")
          ? new Blob([file], { type: "application/pdf" })
          : file
      );
      setObjectUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    setObjectUrl(null);
  }, [file, isPdf]);

  const isImg = Boolean(objectUrl && file.type.startsWith("image/"));
  const isVid = Boolean(objectUrl && file.type.startsWith("video/"));
  const showPdf = Boolean(objectUrl && isPdf);

  const triggerInner = (
    <>
      {isImg ? (
        <img src={objectUrl!} alt="" className="h-full w-full object-cover" />
      ) : isVid ? (
        <video src={objectUrl!} className="h-full w-full object-cover" muted playsInline preload="metadata" />
      ) : (
        <Placeholder mimeType={file.type} filename={file.name} />
      )}
      {isImg ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-1 bg-gradient-to-t from-black/80 to-transparent px-1 pb-1 pt-3 text-[9px] text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
          {file.name}
        </div>
      ) : null}
    </>
  );

  const previewBlock = (
    <div className="overflow-hidden rounded-md border border-white/10 bg-black/50">
      {isImg ? (
        <img src={objectUrl!} alt="" className="max-h-[min(70vh,22rem)] w-full max-w-full object-contain" />
      ) : isVid ? (
        <video
          src={objectUrl!}
          className="max-h-[min(70vh,22rem)] w-full max-w-full object-contain"
          controls
          playsInline
          preload="metadata"
        />
      ) : showPdf ? (
        <PdfIframePreview src={objectUrl!} title={`Preview ${file.name}`} />
      ) : (
        <LargePreviewFallback mimeType={file.type} filename={file.name} primaryLabel={file.name} />
      )}
    </div>
  );

  return (
    <HoverCard openDelay={100} closeDelay={280}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          title={`${file.name} — hover for preview`}
          aria-label={`Preview ${file.name}`}
          className={cn(
            "group relative flex shrink-0 flex-col overflow-hidden rounded-md border border-white/10 bg-white/[0.04] text-left hover:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/45",
            sizeClassName,
            className,
          )}
        >
          {triggerInner}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="center"
        sideOffset={8}
        className={cn(hoverCardContentClass, showPdf && "max-w-[min(92vw,32rem)]")}
      >
        {previewBlock}
        <div className="mt-2 space-y-1">
          <p className="line-clamp-2 text-[11px] font-medium text-white/90">{file.name}</p>
          <p className="truncate text-[10px] text-white/40">{file.type || "Unknown type"}</p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

type RemoteImageHoverPreviewProps = {
  src: string;
  alt: string;
  /** Classes on the outer trigger (shape, size, border). */
  triggerClassName?: string;
  /** Classes on the `<img>` inside the trigger (default img trigger only). */
  triggerImgClassName?: string;
  title?: string;
  /** Custom trigger; hover card still shows full `src` (e.g. cropped avatar). */
  trigger?: ReactNode;
  openDelay?: number;
};

function RemoteImagePreviewTrigger({
  src,
  alt,
  triggerClassName,
  triggerImgClassName,
  title,
}: RemoteImageHoverPreviewProps) {
  return (
    <span
      title={title ?? alt}
      className={cn(
        "relative block shrink-0 overflow-hidden border border-white/10 bg-white/[0.04]",
        triggerClassName,
      )}
    >
      <img
        src={src}
        alt={alt}
        className={cn("block h-full w-full max-h-full max-w-full object-cover", triggerImgClassName)}
      />
    </span>
  );
}

/** Larger image on hover (profile photos, logos) — disabled on mobile to avoid a full-screen preview on tap. */
function RemoteImageHoverCard({
  src,
  alt,
  openDelay,
  children,
}: {
  src: string;
  alt: string;
  openDelay?: number;
  children: ReactNode;
}) {
  return (
    <HoverCard openDelay={openDelay ?? 100} closeDelay={280}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="top" align="center" sideOffset={8} className={hoverCardContentClass}>
        <div className="overflow-hidden rounded-md border border-white/10 bg-black/50">
          <img
            src={src}
            alt=""
            className="max-h-[min(70vh,22rem)] w-full max-w-full object-contain"
            loading="eager"
          />
        </div>
        {alt ? (
          <p className="mt-2 line-clamp-2 text-[11px] font-medium text-white/90">{alt}</p>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}

export function RemoteImageHoverPreview({
  src,
  alt,
  triggerClassName = "",
  triggerImgClassName,
  title,
  trigger,
  openDelay,
}: RemoteImageHoverPreviewProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    if (trigger) {
      return (
        <span title={title ?? alt} className={cn("inline-block shrink-0", triggerClassName)}>
          {trigger}
        </span>
      );
    }
    return (
      <RemoteImagePreviewTrigger
        src={src}
        alt={alt}
        triggerClassName={triggerClassName}
        triggerImgClassName={triggerImgClassName ?? "h-full w-full object-cover"}
        title={title}
      />
    );
  }

  if (trigger) {
    return (
      <RemoteImageHoverCard src={src} alt={alt} openDelay={openDelay}>
        <div
          title={title ?? `${alt} — hover to enlarge`}
          className={cn("inline-block shrink-0 cursor-default", triggerClassName)}
        >
          {trigger}
        </div>
      </RemoteImageHoverCard>
    );
  }

  return (
    <RemoteImageHoverCard src={src} alt={alt} openDelay={openDelay}>
      <button
        type="button"
        title={title ?? `${alt} — hover to enlarge`}
        aria-label={title ?? `Enlarge ${alt}`}
        className={cn(
          "group relative block shrink-0 overflow-hidden border border-white/10 bg-white/[0.04] p-0 text-left hover:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/45",
          triggerClassName
        )}
      >
        <img
          src={src}
          alt={alt}
          className={triggerImgClassName ?? "block h-full w-full max-h-full max-w-full object-cover"}
        />
      </button>
    </RemoteImageHoverCard>
  );
}
