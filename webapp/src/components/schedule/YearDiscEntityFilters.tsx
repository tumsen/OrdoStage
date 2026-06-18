import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EventDetail, TourDetail, Venue } from "../../../../backend/src/types";

const triggerClass =
  "h-8 w-[min(9rem,28vw)] shrink-0 border-white/10 bg-white/5 text-xs text-white [&>span]:truncate";

export function YearDiscEntityFilters({
  venues,
  events,
  tours,
  venueId,
  eventId,
  tourId,
  onVenueChange,
  onEventChange,
  onTourChange,
}: {
  venues: Venue[];
  events: EventDetail[];
  tours: TourDetail[];
  venueId: string;
  eventId: string;
  tourId: string;
  onVenueChange: (id: string) => void;
  onEventChange: (id: string) => void;
  onTourChange: (id: string) => void;
}) {
  const sortedEvents = [...events].sort((a, b) => a.title.localeCompare(b.title));
  const sortedTours = [...tours].sort((a, b) => a.name.localeCompare(b.name));
  const sortedVenues = [...venues].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <span className="mx-0.5 h-4 w-px shrink-0 bg-white/10" aria-hidden="true" />
      <Select value={venueId} onValueChange={onVenueChange}>
        <SelectTrigger className={triggerClass}>
          <SelectValue placeholder="All venues" />
        </SelectTrigger>
        <SelectContent className="max-h-60 bg-[#16161f] border-white/10 text-white">
          <SelectItem value="all" className="text-xs">
            All venues
          </SelectItem>
          {sortedVenues.map((venue) => (
            <SelectItem key={venue.id} value={venue.id} className="text-xs">
              {venue.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={eventId} onValueChange={onEventChange}>
        <SelectTrigger className={triggerClass}>
          <SelectValue placeholder="All events" />
        </SelectTrigger>
        <SelectContent className="max-h-60 bg-[#16161f] border-white/10 text-white">
          <SelectItem value="all" className="text-xs">
            All events
          </SelectItem>
          {sortedEvents.map((event) => (
            <SelectItem key={event.id} value={event.id} className="text-xs">
              {event.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={tourId} onValueChange={onTourChange}>
        <SelectTrigger className={triggerClass}>
          <SelectValue placeholder="All tours" />
        </SelectTrigger>
        <SelectContent className="max-h-60 bg-[#16161f] border-white/10 text-white">
          <SelectItem value="all" className="text-xs">
            All tours
          </SelectItem>
          {sortedTours.map((tour) => (
            <SelectItem key={tour.id} value={tour.id} className="text-xs">
              {tour.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
