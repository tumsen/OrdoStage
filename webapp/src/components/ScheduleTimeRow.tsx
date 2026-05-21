import {
  eventScheduleDateInputClassName,
  eventScheduleDateWeekdayClassName,
} from "@/components/DateInputWithWeekday";
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

export const scheduleDateInputClass = eventScheduleDateInputClassName;

export const scheduleDateWeekdayClass = eventScheduleDateWeekdayClassName;

export const scheduleFieldLabelClass =
  "text-white/60 text-xs uppercase tracking-wide block mb-1.5";

/** Job editor inputs: full ring visible (no offset clipping in scroll rows). */
export const jobEditorFieldFocusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:ring-blue-500/80 focus-visible:border-blue-500/60";
