const MAX_FILENAME_LEN = 200;

/** Remove control chars and quotes that break HTTP header values. */
export function sanitizeContentDispositionFilename(filename: string): string {
  const trimmed = filename.replace(/[\r\n\\"]/g, "_").trim();
  if (!trimmed) return "download";
  return trimmed.slice(0, MAX_FILENAME_LEN);
}

/**
 * Build a Content-Disposition header safe for non-ASCII filenames (e.g. "æ").
 * Uses an ASCII `filename` fallback plus RFC 5987 `filename*=UTF-8''…`.
 */
export function contentDispositionHeader(
  disposition: "inline" | "attachment",
  filename: string
): string {
  const safe = sanitizeContentDispositionFilename(filename);
  const ascii = safe.replace(/[^\x20-\x7E]/g, "_") || "download";
  const encoded = encodeURIComponent(safe);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
