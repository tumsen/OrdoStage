import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Venue, Person } from "../../../../backend/src/types";

interface ScheduleFiltersProps {
  venues: Venue[];
  people: Person[];
  venueId: string;
  personId: string;
  onVenueChange: (id: string) => void;
  onPersonChange: (id: string) => void;
}

export function ScheduleFilters({
  venues,
  people,
  venueId,
  personId,
  onVenueChange,
  onPersonChange,
}: ScheduleFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs text-white/40 uppercase tracking-wide">Filter:</span>

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
  );
}
