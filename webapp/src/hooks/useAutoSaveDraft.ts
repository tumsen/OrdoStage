import { useEffect } from "react";
import { useAutoSave, type UseAutoSaveOptions } from "@/hooks/useAutoSave";

/** useAutoSave + schedule whenever `watchDeps` change (local state / draft forms). */
export function useAutoSaveDraft(
  options: UseAutoSaveOptions & { watchDeps: readonly unknown[] }
) {
  const { watchDeps, ...autoSaveOptions } = options;
  const autoSave = useAutoSave(autoSaveOptions);

  useEffect(() => {
    if (autoSaveOptions.enabled === false) return;
    autoSave.schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- explicit watch list from caller
  }, watchDeps);

  return autoSave;
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
