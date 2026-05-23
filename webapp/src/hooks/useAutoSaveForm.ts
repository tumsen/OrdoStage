import { useCallback, useEffect, useMemo } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import { useAutoSave, type AutoSaveStatus } from "@/hooks/useAutoSave";
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
}: UseAutoSaveFormOptions<T>): {
  status: AutoSaveStatus;
  error: string | null;
  flush: () => Promise<void>;
  markSaved: () => void;
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
    if (!enabled) return;
    const sub = form.watch(() => schedule());
    return () => sub.unsubscribe();
  }, [enabled, form, schedule]);

  const extraFingerprint = useMemo(
    () => (extraSnapshot ? stableStringify(extraSnapshot()) : ""),
    [extraSnapshot]
  );

  useEffect(() => {
    if (!enabled || !extraSnapshot) return;
    schedule();
  }, [enabled, extraFingerprint, extraSnapshot, schedule]);

  return {
    status,
    error,
    flush,
    markSaved: () => markSaved(getSnapshot()),
  };
}
