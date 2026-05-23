import { Loader2, Check, AlertCircle } from "lucide-react";
import type { AutoSaveStatus } from "@/hooks/useAutoSave";
import { cn } from "@/lib/utils";

export function AutoSaveStatus({
  status,
  error,
  className,
}: {
  status: AutoSaveStatus;
  error?: string | null;
  className?: string;
}) {
  if (status === "idle" && !error) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-xs tabular-nums",
        status === "error" ? "text-red-400/90" : "text-white/40",
        className
      )}
      aria-live="polite"
    >
      {status === "pending" ? <span className="text-white/35">Unsaved changes…</span> : null}
      {status === "saving" ? (
        <>
          <Loader2 size={12} className="animate-spin shrink-0" />
          <span>Saving…</span>
        </>
      ) : null}
      {status === "saved" ? (
        <>
          <Check size={12} className="text-emerald-400/80 shrink-0" />
          <span className="text-emerald-400/80">Saved</span>
        </>
      ) : null}
      {status === "error" || error ? (
        <>
          <AlertCircle size={12} className="shrink-0" />
          <span>{error ?? "Could not save"}</span>
        </>
      ) : null}
    </div>
  );
}
