import { cn } from "@/lib/utils";

/**
 * Keeps Date | Start | End | Duration fields on one horizontal line (scroll on narrow screens).
 */
export function ScheduleTimeRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-nowrap items-end gap-2 sm:gap-3 min-w-0 overflow-x-auto pb-0.5",
        className
      )}
    >
      {children}
    </div>
  );
}

export const scheduleDateInputClass =
  "w-[10.5rem] min-w-[10.5rem] shrink-0 bg-white/5 border-white/10 text-white [color-scheme:dark]";

export const scheduleFieldLabelClass =
  "text-white/60 text-xs uppercase tracking-wide block mb-1.5";
