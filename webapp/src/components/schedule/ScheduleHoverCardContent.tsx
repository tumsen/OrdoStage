import type { ReactNode } from "react";

import { HoverCardContent } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

export function ScheduleHoverCardContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <HoverCardContent
      side="top"
      align="center"
      sideOffset={0}
      avoidCollisions={false}
      className={cn(
        "pointer-events-auto fixed inset-0 z-[10050] h-auto w-auto max-h-none border-0 bg-transparent p-0 shadow-none outline-none",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className,
      )}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="pointer-events-none fixed inset-0 bg-black/55" aria-hidden />
      <div className="pointer-events-auto fixed left-1/2 top-1/2 flex h-[min(90vh,56rem)] w-[min(56rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#14141c] p-5 text-white shadow-2xl">
        {children}
      </div>
    </HoverCardContent>
  );
}
