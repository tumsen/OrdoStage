import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { Venue, Person } from "../../../../backend/src/types";

export type ScheduleViewMode = "year" | "yeardisc" | "month" | "week" | "day" | "next7";

export interface VisibilityFilters {
  event: boolean;
  rehearsal: boolean;
  maintenance: boolean;
  private: boolean;
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
}: ScheduleFiltersProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-white/40 uppercase tracking-wide">Filter:</span>

        <Select value={viewMode} onValueChange={(value) => onViewModeChange(value as ScheduleViewMode)}>
          <SelectTrigger className="w-44 bg-white/5 border-white/10 text-white text-sm h-8">
            <SelectValue placeholder="View mode" />
          </SelectTrigger>
          <SelectContent className="bg-[#16161f] border-white/10 text-white">
            <SelectItem value="year">Year calendar</SelectItem>
            <SelectItem value="yeardisc">Year disc</SelectItem>
            <SelectItem value="month">Month</SelectItem>
            <SelectItem value="week">Week</SelectItem>
            <SelectItem value="day">Day</SelectItem>
            <SelectItem value="next7">Next 7 days</SelectItem>
          </SelectContent>
        </Select>

        <Select value={venueId} onValueChange={onVenueChange}>
          <SelectTrigger className="w-44 bg-white/5 border-white/10 text-white text-sm h-8">
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
          <SelectTrigger className="w-44 bg-white/5 border-white/10 text-white text-sm h-8">
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
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <span className="text-xs text-white/40 uppercase tracking-wide">Show:</span>
        {(
          [
            ["event", "Events"],
            ["rehearsal", "Rehearsals"],
            ["maintenance", "Maintenance"],
            ["private", "Private"],
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
    </div>
  );
}
