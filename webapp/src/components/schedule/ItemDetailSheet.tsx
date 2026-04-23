import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MapPin, Clock, Users, Tag, UserCircle } from "lucide-react";
import type { CalendarItem } from "./scheduleUtils";
import { formatTime, itemColor } from "./scheduleUtils";
import { cn } from "@/lib/utils";
import type { EventDetail, InternalBookingDetail } from "../../../../backend/src/types";

interface ItemDetailSheetProps {
  item: CalendarItem | null;
  onClose: () => void;
}

function isEventDetail(raw: EventDetail | InternalBookingDetail): raw is EventDetail {
  return "status" in raw;
}

const BOOKING_TYPE_LABELS: Record<string, string> = {
  rehearsal: "Rehearsal",
  maintenance: "Maintenance",
  private: "Private",
  other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-yellow-900/40 text-yellow-300 border border-yellow-700/40",
  confirmed: "bg-green-900/40 text-green-300 border border-green-700/40",
  cancelled: "bg-red-900/40 text-red-300 border border-red-700/40",
};

function formatAddress(parts: {
  street?: string | null;
  number?: string | null;
  zip?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}): string | null {
  const line1 = [parts.street, parts.number].filter(Boolean).join(" ").trim();
  const line2 = [parts.zip, parts.city].filter(Boolean).join(" ").trim();
  const tail = [parts.state, parts.country].filter(Boolean).join(", ").trim();
  const full = [line1, line2, tail].filter(Boolean).join(", ").trim();
  return full || null;
}

export function ItemDetailSheet({ item, onClose }: ItemDetailSheetProps) {
  const raw = item?.raw;

  return (
    <Sheet open={item !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="bg-[#0d0d14] border-white/10 text-white w-full sm:max-w-md">
        {item && raw ? (
          <>
            <SheetHeader className="pb-4 border-b border-white/10 space-y-3">
              {/* Kind pill */}
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-[11px] px-2 py-0.5 rounded font-semibold uppercase tracking-wider",
                    itemColor(item)
                  )}
                >
                  {item.kind === "event"
                    ? "Event"
                    : BOOKING_TYPE_LABELS[item.type ?? "other"]}
                </span>
                {isEventDetail(raw) ? (
                  <span className={cn("text-[11px] px-2 py-0.5 rounded font-medium", STATUS_COLORS[raw.status])}>
                    {raw.status}
                  </span>
                ) : null}
              </div>
              <SheetTitle className="text-white text-lg font-semibold leading-snug">
                {item.title}
              </SheetTitle>
            </SheetHeader>

            <div className="mt-5 space-y-4">
              {/* Description */}
              {raw.description ? (
                <p className="text-sm text-white/60 leading-relaxed">{raw.description}</p>
              ) : null}

              {/* Time */}
              <div className="flex items-start gap-2.5">
                <Clock size={14} className="text-white/30 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-white/70">
                  <div>{formatTime(item.startDate)}</div>
                  {item.endDate ? (
                    <div className="text-white/40">&rarr; {formatTime(item.endDate)}</div>
                  ) : null}
                </div>
              </div>

              {/* Booked by (internal bookings only) */}
              {!isEventDetail(raw) && raw.createdBy ? (
                <div className="flex items-start gap-2.5">
                  <UserCircle size={14} className="text-white/30 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-[11px] text-white/35 uppercase tracking-wide">Booked by</div>
                    <div className="text-sm text-white/80 font-medium">{raw.createdBy.name}</div>
                    <div className="text-xs text-white/40">{raw.createdBy.email}</div>
                  </div>
                </div>
              ) : null}

              {/* Venue */}
              {raw.venue ? (
                <div className="flex items-start gap-2.5">
                  <MapPin size={14} className="text-white/30 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-sm text-white/70 font-medium">{raw.venue.name}</div>
                    {formatAddress({
                      street: raw.venue.addressStreet,
                      number: raw.venue.addressNumber,
                      zip: raw.venue.addressZip,
                      city: raw.venue.addressCity,
                      state: raw.venue.addressState,
                      country: raw.venue.addressCountry,
                    }) ? (
                      <div className="text-xs text-white/40 mt-0.5">
                        {formatAddress({
                          street: raw.venue.addressStreet,
                          number: raw.venue.addressNumber,
                          zip: raw.venue.addressZip,
                          city: raw.venue.addressCity,
                          state: raw.venue.addressState,
                          country: raw.venue.addressCountry,
                        })}
                      </div>
                    ) : null}
                    {raw.venue.capacity ? (
                      <div className="text-xs text-white/30 mt-0.5">Capacity: {raw.venue.capacity}</div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* Tags (events only) */}
              {isEventDetail(raw) && raw.tags ? (
                <div className="flex items-start gap-2.5">
                  <Tag size={14} className="text-white/30 mt-0.5 flex-shrink-0" />
                  <div className="flex flex-wrap gap-1">
                    {raw.tags.split(",").map((tag) => (
                      <span key={tag} className="text-[11px] px-2 py-0.5 bg-white/5 border border-white/10 rounded text-white/50">
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* People */}
              {raw.people && raw.people.length > 0 ? (
                <div className="flex items-start gap-2.5">
                  <Users size={14} className="text-white/30 mt-0.5 flex-shrink-0" />
                  <div className="flex flex-col gap-1.5">
                    {raw.people.map((p) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-purple-700/50 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] text-purple-200 font-semibold">
                            {p.person.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <span className="text-sm text-white/70">{p.person.name}</span>
                          {p.role ? (
                            <span className="text-xs text-white/30 ml-1.5">{p.role}</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
