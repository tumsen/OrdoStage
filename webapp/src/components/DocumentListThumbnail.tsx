import { useEffect, useState } from "react";
import { File, FileText, Film } from "lucide-react";

const boxBase =
  "shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/35 flex items-center justify-center";

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

function Placeholder({ mimeType, filename }: { mimeType: string; filename: string }) {
  if (isPdfMime(mimeType, filename)) {
    return <FileText className="h-5 w-5 text-red-300/75" aria-hidden />;
  }
  if (isVideoMime(mimeType) || isVideoFilename(filename)) {
    return <Film className="h-5 w-5 text-white/45" aria-hidden />;
  }
  return <File className="h-5 w-5 text-white/40" aria-hidden />;
}

type DocumentListThumbnailProps = {
  downloadUrl: string;
  mimeType: string;
  filename: string;
  /** Venue `kind === "image"` — try `<img>` even if MIME is missing or generic. */
  preferImage?: boolean;
  sizeClassName?: string;
};

/** Small preview for a remote document (authenticated URL, same origin or cookie-backed). */
export function DocumentListThumbnail({
  downloadUrl,
  mimeType,
  filename,
  preferImage = false,
  sizeClassName = "h-11 w-11",
}: DocumentListThumbnailProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  const tryImage = !loadFailed && (preferImage || isImageMime(mimeType));
  const tryVideo =
    !loadFailed && !tryImage && (isVideoMime(mimeType) || (isVideoFilename(filename) && Boolean(downloadUrl)));

  useEffect(() => {
    setLoadFailed(false);
  }, [downloadUrl, mimeType, filename, preferImage]);

  const box = `${boxBase} ${sizeClassName}`;

  if (tryImage) {
    return (
      <div className={box}>
        <img
          src={downloadUrl}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setLoadFailed(true)}
        />
      </div>
    );
  }

  if (tryVideo) {
    return (
      <div className={box}>
        <video
          src={downloadUrl}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
          onError={() => setLoadFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className={box}>
      <Placeholder mimeType={mimeType} filename={filename} />
    </div>
  );
}

type LocalFileThumbnailProps = {
  file: File;
  sizeClassName?: string;
};

/** Preview for a `File` before upload (object URL for image/video; icon fallback otherwise). */
export function LocalFileThumbnail({ file, sizeClassName = "h-11 w-11" }: LocalFileThumbnailProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
      const u = URL.createObjectURL(file);
      setObjectUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    setObjectUrl(null);
  }, [file]);

  const box = `${boxBase} ${sizeClassName}`;

  if (objectUrl && file.type.startsWith("image/")) {
    return (
      <div className={box}>
        <img src={objectUrl} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }

  if (objectUrl && file.type.startsWith("video/")) {
    return (
      <div className={box}>
        <video src={objectUrl} className="h-full w-full object-cover" muted playsInline preload="metadata" />
      </div>
    );
  }

  return (
    <div className={box}>
      <Placeholder mimeType={file.type} filename={file.name} />
    </div>
  );
}
