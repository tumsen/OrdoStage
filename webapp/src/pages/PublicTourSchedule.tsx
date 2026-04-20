import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useState } from "react";
import { api } from "@/lib/api";
import type { TourDetail, TourShow } from "../../../backend/src/types";
import { Loader2, FileDown, Truck, Coffee, MapPin, Phone, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadTourPDF } from "@/components/TourSchedulePDF";

export default function PublicTourSchedule() {
  const { token } = useParams<{ token: string }>();
  const [pdfLoading, setPdfLoading] = useState(false);

  const { data: tour, isLoading, error } = useQuery({
    queryKey: ["public-tour", token],
    queryFn: () => api.get<TourDetail>(`/api/public/tours/${token}`),
    enabled: !!token,
  });

  async function handlePDF() {
    if (!tour) return;
    setPdfLoading(true);
    try { await downloadTourPDF(tour); } finally { setPdfLoading(false); }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  if (error || !tour) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg">Tour schedule not found.</p>
          <p className="text-gray-400 text-sm mt-2">This link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  const sortedShows = [...tour.shows].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{tour.name}</h1>
              {tour.description ? (
                <p className="text-gray-500 mt-1">{tour.description}</p>
              ) : null}
              <div className="flex items-center gap-3 mt-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  tour.status === "active" ? "bg-green-100 text-green-700" :
                  tour.status === "completed" ? "bg-blue-100 text-blue-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {tour.status === "active" ? "Active" : tour.status === "completed" ? "Completed" : "Draft"}
                </span>
                {sortedShows.length > 0 ? (
                  <span className="text-sm text-gray-500">
                    {new Date(sortedShows[0].date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {" – "}
                    {new Date(sortedShows[sortedShows.length - 1].date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                ) : null}
              </div>
            </div>
            <Button
              onClick={handlePDF}
              disabled={pdfLoading}
              className="bg-gray-900 hover:bg-gray-800 text-white gap-2 flex-shrink-0"
            >
              {pdfLoading ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
              {pdfLoading ? "Generating..." : "Download PDF"}
            </Button>
          </div>

          {/* Tour Manager */}
          {(tour.tourManagerName || tour.tourManagerPhone || tour.tourManagerEmail) ? (
            <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-4">
              <span className="text-xs text-gray-400 uppercase tracking-wide self-center">Tour Manager</span>
              {tour.tourManagerName ? <span className="text-sm font-medium text-gray-700">{tour.tourManagerName}</span> : null}
              {tour.tourManagerPhone ? (
                <a href={`tel:${tour.tourManagerPhone}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                  <Phone size={12} />{tour.tourManagerPhone}
                </a>
              ) : null}
              {tour.tourManagerEmail ? (
                <a href={`mailto:${tour.tourManagerEmail}`} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                  <Mail size={12} />{tour.tourManagerEmail}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Cast & Crew */}
        {tour.people.length > 0 ? (
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
              Cast & Crew ({tour.people.length})
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {tour.people.map((tp, i) => (
                <div key={tp.id} className={`flex items-center gap-4 px-5 py-3 ${i < tour.people.length - 1 ? "border-b border-gray-100" : ""}`}>
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-medium text-gray-500">{tp.person.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm">{tp.person.name}</div>
                    <div className="text-xs text-gray-500">{tp.role ?? tp.person.role ?? ""}</div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {tp.person.phone ? (
                      <a href={`tel:${tp.person.phone}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                        <Phone size={11} />{tp.person.phone}
                      </a>
                    ) : null}
                    {tp.person.email ? (
                      <a href={`mailto:${tp.person.email}`} className="text-xs text-blue-600 hover:underline hidden sm:flex items-center gap-1">
                        <Mail size={11} />{tp.person.email}
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Schedule */}
        {sortedShows.length > 0 ? (
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
              Schedule ({sortedShows.length} days)
            </h2>
            <div className="space-y-3">
              {sortedShows.map((show, i) => (
                <PublicShowCard key={show.id} show={show} dayNumber={i + 1} />
              ))}
            </div>
          </section>
        ) : null}

        {/* Footer */}
        <div className="text-center py-6 border-t border-gray-200">
          <p className="text-xs text-gray-400">Confidential — For cast and crew only</p>
        </div>
      </div>
    </div>
  );
}

function PublicShowCard({ show, dayNumber }: { show: TourShow; dayNumber: number }) {
  const [expanded, setExpanded] = useState(false);

  const isTravel = show.type === "travel";
  const isDayOff = show.type === "day_off";

  const formattedDate = new Date(show.date).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

  return (
    <div className={`bg-white border rounded-xl overflow-hidden ${
      isTravel ? "border-blue-200" : isDayOff ? "border-green-200" : "border-gray-200"
    }`}>
      {/* Header */}
      <div className={`px-5 py-3 flex items-center gap-3 ${
        isTravel ? "bg-blue-50" : isDayOff ? "bg-green-50" : "bg-gray-50"
      }`}>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isTravel ? "bg-blue-100" : isDayOff ? "bg-green-100" : "bg-gray-200"
        }`}>
          {isTravel ? <Truck size={14} className="text-blue-600" /> :
           isDayOff ? <Coffee size={14} className="text-green-600" /> :
           <span className="text-xs font-bold text-gray-500">{dayNumber}</span>}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {isTravel ? <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Travel Day</span> :
             isDayOff ? <span className="text-xs font-semibold text-green-600 uppercase tracking-wide">Day Off</span> : null}
            <span className="text-sm font-medium text-gray-900">{formattedDate}</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {isTravel && (show.fromLocation || show.toLocation) ?
              [show.fromLocation, show.toLocation].filter(Boolean).join(" → ") :
              [show.venueCity, show.venueName].filter(Boolean).join(", ")}
          </div>
        </div>
        {show.showTime ? (
          <span className="text-sm font-bold text-gray-700 flex-shrink-0">{show.showTime}</span>
        ) : null}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-400 hover:text-gray-600 p-1"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d={expanded ? "M2 8L6 4L10 8" : "M2 4L6 8L10 4"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Expanded */}
      {expanded ? (
        <div className="px-5 py-4 space-y-4 border-t border-gray-100">
          {(show.venueStreet || show.venueCity || show.venueCountry) ? (() => {
            const va = [
              show.venueStreet && show.venueNumber ? `${show.venueStreet} ${show.venueNumber}` : show.venueStreet,
              show.venueZip && show.venueCity ? `${show.venueZip} ${show.venueCity}` : show.venueCity,
              show.venueCountry,
            ].filter(Boolean).join(", ");
            return (
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Address</div>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(va)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                >
                  <MapPin size={12} />{va}
                </a>
              </div>
            );
          })() : null}

          {(show.getInTime || show.rehearsalTime || show.soundcheckTime || show.doorsTime || show.showTime) ? (
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">Schedule</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([
                  ["Get-in", show.getInTime],
                  ["Rehearsal", show.rehearsalTime],
                  ["Soundcheck", show.soundcheckTime],
                  ["Doors", show.doorsTime],
                  ["Show", show.showTime],
                ] as [string, string | null][]).filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} className="bg-gray-50 rounded-lg px-3 py-2">
                    <div className="text-xs text-gray-400">{label}</div>
                    <div className="text-sm font-medium text-gray-800">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {(show.contactName || show.contactPhone || show.contactEmail) ? (
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">Venue Contact</div>
              <div className="flex flex-wrap gap-3 text-sm">
                {show.contactName ? <span className="font-medium text-gray-700">{show.contactName}</span> : null}
                {show.contactPhone ? (
                  <a href={`tel:${show.contactPhone}`} className="text-blue-600 hover:underline">{show.contactPhone}</a>
                ) : null}
                {show.contactEmail ? (
                  <a href={`mailto:${show.contactEmail}`} className="text-blue-600 hover:underline">{show.contactEmail}</a>
                ) : null}
              </div>
            </div>
          ) : null}

          {(show.hotelName || show.hotelStreet || show.hotelCity) ? (
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">Hotel</div>
              <div className="text-sm">
                {show.hotelName ? <div className="font-medium text-gray-700">{show.hotelName}</div> : null}
                {(show.hotelStreet || show.hotelCity) ? (() => {
                  const ha = [
                    show.hotelStreet && show.hotelNumber ? `${show.hotelStreet} ${show.hotelNumber}` : show.hotelStreet,
                    show.hotelZip && show.hotelCity ? `${show.hotelZip} ${show.hotelCity}` : show.hotelCity,
                    show.hotelCountry,
                  ].filter(Boolean).join(", ");
                  return (
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(ha)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline flex items-center gap-1 mt-0.5"
                    >
                      <MapPin size={11} />{ha}
                    </a>
                  );
                })() : null}
                {(show.hotelCheckIn || show.hotelCheckOut) ? (
                  <div className="text-gray-500 mt-1 text-xs">
                    {show.hotelCheckIn ? `Check-in: ${show.hotelCheckIn}` : ""}
                    {show.hotelCheckIn && show.hotelCheckOut ? " · " : ""}
                    {show.hotelCheckOut ? `Check-out: ${show.hotelCheckOut}` : ""}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {show.travelInfo ? (
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Travel Info</div>
              <p className="text-sm text-gray-600 leading-relaxed">{show.travelInfo}</p>
            </div>
          ) : null}

          {show.notes ? (
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Notes</div>
              <p className="text-sm text-gray-600 leading-relaxed">{show.notes}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
