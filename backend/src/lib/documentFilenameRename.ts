const MAX_FILENAME_LEN = 200;

/** Strip characters unsafe in paths / downloads (aligned with client ZIP naming). */
const BAD_FILENAME_CHARS = /[/\\?%*:|"<>]/g;

/**
 * When the user edits the display name of a stored file, derive the stored `filename`
 * field: keep a sensible extension from the previous upload unless the new name already
 * includes one.
 */
export function filenameFromDisplayRename(displayName: string, previousFilename: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return previousFilename;

  let cleaned = trimmed.replace(BAD_FILENAME_CHARS, "_").trim();
  if (!cleaned) return previousFilename;

  const lastDot = cleaned.lastIndexOf(".");
  const looksLikeExtension = lastDot > 0 && lastDot < cleaned.length - 1;
  if (looksLikeExtension) {
    return cleaned.slice(0, MAX_FILENAME_LEN);
  }

  const prevDot = previousFilename.lastIndexOf(".");
  const prevExt =
    prevDot > 0 && prevDot < previousFilename.length - 1 ? previousFilename.slice(prevDot) : "";
  const withExt = prevExt ? `${cleaned}${prevExt}` : cleaned;
  return withExt.slice(0, MAX_FILENAME_LEN);
}
