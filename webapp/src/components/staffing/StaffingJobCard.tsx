import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";

import { JobPersonSlotsRow } from "@/components/event/JobPeopleFields";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { api } from "@/lib/api";
import { overlappingPersonIdsForJob, wouldPersonOverlapOnJob } from "@/lib/eventJobConflicts";
import {
  isStaffingRequirementFilled,
  staffingRequirementBorderClass,
} from "@/lib/eventShowStaffing";
import {
  buildStaffingShowContext,
  slotPersonIdsFromRequirement,
  type StaffingRequirementRow,
} from "@/lib/staffingPageContext";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Person } from "@/lib/types";

function hours(minutes: number): string {
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}

export function StaffingJobCard({
  req,
  allRequirements,
  roster,
  defaultOpen = false,
}: {
  req: StaffingRequirementRow;
  allRequirements: StaffingRequirementRow[];
  roster: Person[];
  defaultOpen?: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const slots = slotPersonIdsFromRequirement(req);
  const filled = slots.filter(Boolean).length;
  const needed = Math.max(1, req.peopleNeeded);

  const show = useMemo(
    () => buildStaffingShowContext(allRequirements, req.showId),
    [allRequirements, req.showId]
  );

  const overlapBusy = useMemo(
    () => overlappingPersonIdsForJob(show, req.id),
    [show, req.id]
  );

  const updateSlots = useMutation({
    mutationFn: (slotPersonIds: (string | null)[]) =>
      api.patch(`/api/staffing/jobs/${req.id}`, { slotPersonIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staffing"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["time-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["event", req.eventId] });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not update staffing",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const setSlot = (slotIndex: number, personId: string | null) => {
    if (personId && wouldPersonOverlapOnJob(show, req.id, personId)) {
      toast({
        title: "Overlapping assignment",
        description: "This person is already assigned to another job at the same time on this show.",
        variant: "destructive",
      });
      return;
    }
    const next = [...slots];
    next[slotIndex] = personId;
    updateSlots.mutate(next);
  };

  const eventJobUrl = `/events/${req.eventId}?tab=shows&show=${encodeURIComponent(req.showId)}&job=${encodeURIComponent(req.id)}`;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "rounded-lg border bg-white/[0.03] transition-colors",
          staffingRequirementBorderClass(req)
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-start gap-2 p-3 text-left hover:bg-white/[0.04] rounded-lg"
          >
            {open ? (
              <ChevronDown className="h-4 w-4 text-white/50 shrink-0 mt-0.5" />
            ) : (
              <ChevronRight className="h-4 w-4 text-white/50 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-white">{req.title}</p>
                {req.departmentName ? (
                  <span
                    className="rounded px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/55"
                    style={
                      req.departmentColor
                        ? { backgroundColor: `${req.departmentColor}22`, color: req.departmentColor }
                        : undefined
                    }
                  >
                    {req.departmentName}
                  </span>
                ) : null}
                {req.hasConflict ? (
                  <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-200">
                    <AlertTriangle className="h-3 w-3" />
                    Conflict
                  </span>
                ) : isStaffingRequirementFilled(req) ? (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                    <CheckCircle2 className="h-3 w-3" />
                    Staffing OK
                  </span>
                ) : (
                  <span className="rounded bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-200">
                    Needs people · {filled}/{needed}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-white/45">
                {req.eventTitle} · {format(parseISO(req.startsAt), "EEE d MMM HH:mm")}–
                {format(parseISO(req.endsAt), "HH:mm")} · {req.venueName}
              </p>
              <p className="mt-0.5 text-xs text-white/40">
                Planned {hours(req.durationMinutes)} · {needed} needed
                {!open ? " · expand to assign" : null}
              </p>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-white/[0.06] px-3 pb-3 pt-2 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-white/40">Assign people for this job</p>
              <Link
                to={eventJobUrl}
                className="inline-flex items-center gap-1 text-[11px] text-white/55 hover:text-white"
                onClick={(e) => e.stopPropagation()}
              >
                Open in event
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <JobPersonSlotsRow
              peopleNeeded={needed}
              slotPersonIds={slots}
              roster={roster}
              overlapBusy={overlapBusy}
              disabled={updateSlots.isPending}
              onSlotChange={setSlot}
              className="mt-0 pt-4 border-t-0"
            />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
