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
}

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
}: ScheduleFiltersProps) {
  const viewModeSelect = (
    <Select value={viewMode} onValueChange={(value) => onViewModeChange(value as ScheduleViewMode)}>
      <SelectTrigger className="w-full sm:w-40 bg-white/5 border-white/10 text-white text-sm h-8">
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

  if (hideEntityFilters && hideVisibility) {
    return viewModeSelect;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {viewModeSelect}

        {hideEntityFilters ? null : (
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
        )}
      </div>

      {hideVisibility ? null : (
        <div className="flex flex-wrap items-center gap-4">
          {(
            [
              ["event", "Events"],
              ["tour", "Tours"],
              ["rehearsal", "Rehearsals"],
              ["maintenance", "Maintenance"],
              ["private", "Private"],
              ["venue_booking", "Venue bookings"],
              ["other", "Other bookings"],
            ] as Array<[keyof VisibilityFilters, string]>
          ).map(([key, label]) => (
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
