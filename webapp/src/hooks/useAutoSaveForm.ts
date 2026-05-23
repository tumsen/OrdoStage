import { useCallback, useEffect, useMemo } from "react";
import type { FocusEvent } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import { autoSaveBlurCapture, useAutoSave, type AutoSaveStatus } from "@/hooks/useAutoSave";
import { stableStringify } from "@/lib/stableJson";

export interface UseAutoSaveFormOptions<T extends FieldValues> {
  form: UseFormReturn<T>;
  enabled?: boolean;
  debounceMs?: number;
  resetKey?: string | number | null;
  /** Extra draft state outside react-hook-form (contacts, custom fields, etc.). */
  extraSnapshot?: () => unknown;
  validate?: (values: T) => boolean | Promise<boolean>;
  save: (values: T) => void | Promise<void>;
  saveOnUnmount?: boolean;
  /** Debounced save on every form value change. Default false — use blur instead. */
  saveOnChange?: boolean;
  /** Debounced save when focus leaves a field inside the form. Default true. */
  saveOnBlur?: boolean;
}

export function useAutoSaveForm<T extends FieldValues>({
  form,
  enabled = true,
  debounceMs = 600,
  resetKey,
  extraSnapshot,
  validate,
  save,
  saveOnUnmount = true,
  saveOnChange = false,
  saveOnBlur = true,
}: UseAutoSaveFormOptions<T>): {
  status: AutoSaveStatus;
  error: string | null;
  schedule: () => void;
  flush: () => Promise<void>;
  markSaved: () => void;
  /** Attach to the form root (or wrapping div). */
  onBlurCapture: (e: FocusEvent<HTMLElement>) => void;
} {
  const getSnapshot = useCallback(
    () => ({
      values: form.getValues(),
      extra: extraSnapshot?.() ?? null,
    }),
    [form, extraSnapshot]
  );

  const { status, error, schedule, flush, markSaved } = useAutoSave({
    enabled,
    debounceMs,
    resetKey,
    saveOnUnmount,
    getSnapshot,
    save: async () => {
      const values = form.getValues();
      if (validate) {
        const ok = await validate(values);
        if (!ok) throw new Error("Fix validation errors before saving.");
      }
      await save(values);
    },
  });

  useEffect(() => {
    if (!enabled || !saveOnChange) return;
    const sub = form.watch(() => schedule());
    return () => sub.unsubscribe();
  }, [enabled, saveOnChange, form, schedule]);

  const extraFingerprint = useMemo(
    () => (extraSnapshot ? stableStringify(extraSnapshot()) : ""),
    [extraSnapshot]
  );

  useEffect(() => {
    if (!enabled || !saveOnChange || !extraSnapshot) return;
    schedule();
  }, [enabled, saveOnChange, extraFingerprint, extraSnapshot, schedule]);

  const onBlurCapture = useCallback(
    (e: FocusEvent<HTMLElement>) => {
      if (!saveOnBlur) return;
      autoSaveBlurCapture(schedule, enabled)(e);
    },
    [enabled, saveOnBlur, schedule]
  );

  return {
    status,
    error,
    schedule,
    flush,
    markSaved: () => markSaved(getSnapshot()),
    onBlurCapture,
  };
}
