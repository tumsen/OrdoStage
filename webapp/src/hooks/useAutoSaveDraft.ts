import { useCallback, useEffect } from "react";
import type { FocusEvent } from "react";
import { autoSaveBlurCapture, useAutoSave, type UseAutoSaveOptions } from "@/hooks/useAutoSave";

/** useAutoSave + optional debounced save when `watchDeps` change. */
export function useAutoSaveDraft(
  options: UseAutoSaveOptions & {
    watchDeps?: readonly unknown[];
    /** When true, schedule save whenever watchDeps change (legacy). Default false. */
    saveOnDepsChange?: boolean;
    /** Debounced save when focus leaves an input inside the container. Default true. */
    saveOnBlur?: boolean;
  }
) {
  const { watchDeps, saveOnDepsChange = false, saveOnBlur = true, ...autoSaveOptions } = options;
  const autoSave = useAutoSave(autoSaveOptions);

  useEffect(() => {
    if (saveOnDepsChange !== true) return;
    if (autoSaveOptions.enabled === false) return;
    autoSave.schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- explicit watch list from caller
  }, watchDeps ?? []);

  const onBlurCapture = useCallback(
    (e: FocusEvent<HTMLElement>) => {
      if (!saveOnBlur) return;
      autoSaveBlurCapture(autoSave.schedule, autoSaveOptions.enabled !== false)(e);
    },
    [autoSave, autoSaveOptions.enabled, saveOnBlur]
  );

  return { ...autoSave, onBlurCapture };
}

/** Flush pending auto-save when a dialog closes. */
export function dialogCloseWithAutoSave(
  open: boolean,
  onOpenChange: (open: boolean) => void,
  autoSave: { flush: () => Promise<void> }
) {
  return (next: boolean) => {
    if (!next && open) {
      void autoSave.flush().finally(() => onOpenChange(false));
      return;
    }
    onOpenChange(next);
  };
}
