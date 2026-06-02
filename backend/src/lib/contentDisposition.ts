const MAX_FILENAME_LEN = 200;

/** Characters unsafe in stored filenames / paths (Danish letters are allowed). */
export const UNSAFE_FILENAME_CHARS = /[/\\?%*:|"<>|\r\n]/g;

/**
 * Normalize an uploaded or stored filename: keep æ, ø, å, etc.; strip path separators only.
 */
export function sanitizeStoredFilename(filename: string): string {
  const trimmed = filename.replace(UNSAFE_FILENAME_CHARS, "_").trim();
  if (!trimmed) return "download";
  return trimmed.slice(0, MAX_FILENAME_LEN);
}

/** Remove control chars and quotes that break HTTP header values. */
export function sanitizeContentDispositionFilename(filename: string): string {
  return sanitizeStoredFilename(filename);
}

/** ASCII fallback for legacy clients (æ→ae, ø→oe, å→aa). */
export function filenameToAsciiFallback(filename: string): string {
  const danish: Record<string, string> = {
    æ: "ae",
    ø: "oe",
    å: "aa",
    Æ: "Ae",
    Ø: "Oe",
    Å: "Aa",
  };
  let out = "";
  for (const ch of filename) {
    const mapped = danish[ch];
    if (mapped) out += mapped;
    else if (ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) <= 0x7e) out += ch;
    else out += "_";
  }
  const trimmed = out.trim();
  return trimmed || "download";
}

/**
 * Build a Content-Disposition header that supports international filenames (RFC 5987).
 * Modern browsers use `filename*` (UTF-8); legacy clients get a Danish-aware ASCII fallback.
 */
export function contentDispositionHeader(
  disposition: "inline" | "attachment",
  filename: string
): string {
  const safe = sanitizeContentDispositionFilename(filename);
  const ascii = filenameToAsciiFallback(safe);
  const encoded = encodeURIComponent(safe);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
