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
