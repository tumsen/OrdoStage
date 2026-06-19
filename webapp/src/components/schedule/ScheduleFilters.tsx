import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { Venue, Person } from "../../../../backend/src/types";

export type ScheduleViewMode = "year" | "yeardisc" | "month" | "week" | "day" | "next7" | "venueocc";

export interface VisibilityFilters {
  event: boolean;
  tour: boolean;
  rehearsal: boolean;
  maintenance: boolean;
  private: boolean;
  venue_booking: boolean;
  other: boolean;
}

const VIEW_MODE_SELECT_CLASS = "w-40 shrink-0 bg-white/5 border-white/10 text-white text-sm h-8";

export function ScheduleViewModeSelect({
  viewMode,
  onViewModeChange,
  className = "",
}: {
  viewMode: ScheduleViewMode;
  onViewModeChange: (mode: ScheduleViewMode) => void;
  className?: string;
}) {
  return (
    <Select value={viewMode} onValueChange={(value) => onViewModeChange(value as ScheduleViewMode)}>
      <SelectTrigger className={`${VIEW_MODE_SELECT_CLASS} ${className}`.trim()}>
        <SelectValue placeholder="View mode" />
      </SelectTrigger>
      <SelectContent className="bg-[#16161f] border-white/10 text-white">
        <SelectItem value="year">Year calendar</SelectItem>
        <SelectItem value="yeardisc">Year disc</SelectItem>
        <SelectItem value="month">Month</SelectItem>
        <SelectItem value="week">Week</SelectItem>
        <SelectItem value="day">Day</SelectItem>
        <SelectItem value="next7">Next 7 days</SelectItem>
        <SelectItem value="venueocc">Venue occupation</SelectItem>
      </SelectContent>
    </Select>
  );
}

interface ScheduleFiltersProps {
  venues: Venue[];
  people: Person[];
  venueId: string;
  personId: string;
  viewMode: ScheduleViewMode;
  visibility: VisibilityFilters;
  onVenueChange: (id: string) => void;
  onPersonChange: (id: string) => void;
  onViewModeChange: (mode: ScheduleViewMode) => void;
  onVisibilityChange: (key: keyof VisibilityFilters, value: boolean) => void;
  /** Hide venue/person filters (year disc uses ring config). */
  hideEntityFilters?: boolean;
  /** Hide Show: checkboxes (year disc uses ring config). */
  hideVisibility?: boolean;
  /** View mode select is rendered separately for fixed toolbar placement. */
  hideViewMode?: boolean;
}

const VISIBILITY_ITEMS = [
  ["event", "Events"],
  ["tour", "Tours"],
  ["rehearsal", "Rehearsals"],
  ["maintenance", "Maintenance"],
  ["private", "Private"],
  ["venue_booking", "Venue bookings"],
  ["other", "Other bookings"],
] as Array<[keyof VisibilityFilters, string]>;

export function ScheduleFilters({
  venues,
  people,
  venueId,
  personId,
  viewMode,
  visibility,
  onVenueChange,
  onPersonChange,
  onViewModeChange,
  onVisibilityChange,
  hideEntityFilters = false,
  hideVisibility = false,
  hideViewMode = false,
}: ScheduleFiltersProps) {
  if (hideEntityFilters && hideVisibility && hideViewMode) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      {!hideViewMode || !hideEntityFilters ? (
        <div className="flex flex-wrap items-center gap-3">
          {!hideViewMode ? (
            <ScheduleViewModeSelect viewMode={viewMode} onViewModeChange={onViewModeChange} />
          ) : null}

          {!hideEntityFilters ? (
            <>
              <Select value={venueId} onValueChange={onVenueChange}>
                <SelectTrigger className="w-full sm:w-44 bg-white/5 border-white/10 text-white text-sm h-8">
                  <SelectValue placeholder="All venues" />
                </SelectTrigger>
                <SelectContent className="bg-[#16161f] border-white/10 text-white">
                  <SelectItem value="all">All venues</SelectItem>
                  {venues.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={personId} onValueChange={onPersonChange}>
                <SelectTrigger className="w-full sm:w-44 bg-white/5 border-white/10 text-white text-sm h-8">
                  <SelectValue placeholder="All people" />
                </SelectTrigger>
                <SelectContent className="bg-[#16161f] border-white/10 text-white">
                  <SelectItem value="all">All people</SelectItem>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : null}
        </div>
      ) : null}

      {hideVisibility ? null : (
        <div className="flex flex-wrap items-center gap-4">
          {VISIBILITY_ITEMS.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-xs text-white/70">
              <Checkbox
                checked={visibility[key]}
                onCheckedChange={(checked) => onVisibilityChange(key, Boolean(checked))}
              />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
