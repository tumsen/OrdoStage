import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { Loader2, BedDouble, Truck, Coffee, CheckCircle2, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type ShowMyNote = { id: string; note: string | null; needsHotel: boolean } | null;

type PersonalShow = {
  id: string;
  tourId: string;
  date: string;
  type: string;
  fromLocation: string | null;
  toLocation: string | null;
  showTime: string | null;
  getInTime: string | null;
  rehearsalTime: string | null;
  soundcheckTime: string | null;
  doorsTime: string | null;
  venueName:    string | null;
  venueStreet:  string | null;
  venueNumber:  string | null;
  venueZip:     string | null;
  venueCity:    string | null;
  venueState:   string | null;
  venueCountry: string | null;
  hotelName:    string | null;
  hotelStreet:  string | null;
  hotelNumber:  string | null;
  hotelZip:     string | null;
  hotelCity:    string | null;
  hotelState:   string | null;
  hotelCountry: string | null;
  hotelCheckIn: string | null;
  hotelCheckOut: string | null;
  travelInfo: string | null;
  notes: string | null;
  travelTimeMinutes: number | null;
  myNote: ShowMyNote;
};

type PersonalTourData = {
  person: { id: string; name: string; role: string | null; email: string | null; phone: string | null };
  tour: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    tourManagerName: string | null;
    tourManagerPhone: string | null;
    tourManagerEmail: string | null;
    shows: PersonalShow[];
  };
};

// ── Show Note Card ──────────────────────────────────────────────────────────

function ShowNoteCard({
  show,
  personalToken,
}: {
  show: PersonalShow;
  personalToken: string;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState(show.myNote?.note ?? "");
  const [needsHotel, setNeedsHotel] = useState(show.myNote?.needsHotel ?? false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setNote(show.myNote?.note ?? "");
    setNeedsHotel(show.myNote?.needsHotel ?? false);
  }, [show.myNote]);

  const saveMutation = useMutation({
    mutationFn: async ({ note, needsHotel }: { note?: string; needsHotel?: boolean }) => {
      const baseUrl = import.meta.env.VITE_BACKEND_URL || "";
      const resp = await fetch(`${baseUrl}/api/public/person/${personalToken}/notes/${show.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, needsHotel }),
      });
      if (!resp.ok) throw new Error("Save failed");
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["personal-tour", personalToken] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  function handleHotelToggle() {
    const newVal = !needsHotel;
    setNeedsHotel(newVal);
    saveMutation.mutate({ note: note || undefined, needsHotel: newVal });
  }

  function handleSaveNote() {
    saveMutation.mutate({ note: note || undefined, needsHotel });
  }

  const dateObj = new Date(show.date);
  const dateLabel = dateObj.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });

  const typeIcon =
    show.type === "travel" ? <Truck size={14} className="text-blue-500" /> :
    show.type === "day_off" ? <Coffee size={14} className="text-green-500" /> :
    null;

  const venueLabel =
    show.type === "travel"
      ? [show.fromLocation, show.toLocation].filter(Boolean).join(" → ")
      : show.venueName || show.venueCity || "";

  const hasSchedule = show.getInTime || show.rehearsalTime || show.soundcheckTime || show.showTime;

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden",
      show.type === "travel" ? "border-blue-200 bg-blue-50" :
      show.type === "day_off" ? "border-green-200 bg-green-50" :
      "border-gray-200 bg-white"
    )}>
      {/* Header */}
      <div className="px-4 py-3 flex items-start gap-3">
        <div className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
          show.type === "travel" ? "bg-blue-100" :
          show.type === "day_off" ? "bg-green-100" :
          "bg-gray-100"
        )}>
          {typeIcon !== null ? typeIcon : <span className="text-xs font-bold text-gray-400">{dateObj.getDate()}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            {show.type === "travel" ? "Travel Day" : show.type === "day_off" ? "Day Off" : "Show Day"}
          </div>
          <div className="text-sm font-semibold text-gray-900 mt-0.5">{dateLabel}</div>
          {venueLabel ? <div className="text-xs text-gray-500 mt-0.5">{venueLabel}</div> : null}
        </div>
      </div>

      {/* Show schedule */}
      {hasSchedule ? (
        <div className="px-4 pb-2 flex flex-wrap gap-3">
          {show.getInTime ? (
            <div><span className="text-xs text-gray-400">Get-in </span><span className="text-xs font-semibold text-gray-700">{show.getInTime}</span></div>
          ) : null}
          {show.rehearsalTime ? (
            <div><span className="text-xs text-gray-400">Rehearsal </span><span className="text-xs font-semibold text-gray-700">{show.rehearsalTime}</span></div>
          ) : null}
          {show.soundcheckTime ? (
            <div><span className="text-xs text-gray-400">Soundcheck </span><span className="text-xs font-semibold text-gray-700">{show.soundcheckTime}</span></div>
          ) : null}
          {show.showTime ? (
            <div><span className="text-xs text-gray-400">Show </span><span className="text-xs font-semibold text-gray-900">{show.showTime}</span></div>
          ) : null}
        </div>
      ) : null}

      {/* Hotel */}
      {show.hotelName ? (
        <div className="px-4 pb-2 text-xs text-gray-500">
          Hotel: <span className="font-medium text-gray-700">{show.hotelName}</span>
          {show.hotelCheckIn ? ` · Check-in: ${show.hotelCheckIn}` : ""}
          {show.hotelCheckOut ? ` · Check-out: ${show.hotelCheckOut}` : ""}
        </div>
      ) : null}

      {/* Personal inputs */}
      <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50/50">
        {/* Hotel needed toggle */}
        <button
          onClick={handleHotelToggle}
          disabled={saveMutation.isPending}
          className={cn(
            "w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
            needsHotel
              ? "bg-indigo-50 border-indigo-300 text-indigo-700"
              : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
          )}
        >
          <BedDouble size={16} className={needsHotel ? "text-indigo-500" : "text-gray-400"} />
          <span className="text-sm font-medium flex-1">
            {needsHotel ? "Hotel booked — I need accommodation" : "I need hotel accommodation"}
          </span>
          {needsHotel ? <CheckCircle2 size={16} className="text-indigo-500" /> : null}
        </button>

        {/* Notes */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <StickyNote size={12} className="text-gray-400" />
            <span className="text-xs text-gray-400 font-medium">My notes for this day</span>
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={handleSaveNote}
            placeholder="Add any notes, questions, or special requests..."
            className="text-sm resize-none bg-white border-gray-200 focus:border-indigo-300 text-gray-800 placeholder:text-gray-300 min-h-[70px]"
            rows={3}
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-gray-300">Auto-saves when you click away</span>
            <div className="flex items-center gap-2">
              {saved ? <span className="text-[11px] text-green-500 font-medium">Saved</span> : null}
              <Button
                size="sm"
                onClick={handleSaveNote}
                disabled={saveMutation.isPending}
                className="h-6 px-3 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {saveMutation.isPending ? <Loader2 size={10} className="animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PersonalTourView() {
  const { personalToken } = useParams<{ personalToken: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["personal-tour", personalToken],
    queryFn: async () => {
      const baseUrl = import.meta.env.VITE_BACKEND_URL || "";
      const resp = await fetch(`${baseUrl}/api/public/person/${personalToken}`);
      if (!resp.ok) throw new Error("Not found");
      const json = await resp.json();
      return json.data as PersonalTourData;
    },
    enabled: !!personalToken,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center px-6">
          <p className="text-gray-600 text-lg font-semibold">Link not found</p>
          <p className="text-gray-400 text-sm mt-1">This personal link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  const sortedShows = [...data.tour.shows].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="w-full px-4 py-4">
          <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">{data.tour.name}</div>
          <h1 className="text-lg font-bold text-gray-900 mt-0.5">{data.person.name}</h1>
          {data.person.role ? <p className="text-xs text-gray-400">{data.person.role}</p> : null}
        </div>
      </div>

      {/* Intro */}
      <div className="w-full px-4 py-5">
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 mb-5">
          <p className="text-xs text-indigo-600 leading-relaxed">
            This is your personal tour view. Check the hotel box for each day you need accommodation, and add any notes. Everything saves automatically.
          </p>
        </div>

        {/* Tour manager contact */}
        {(data.tour.tourManagerName || data.tour.tourManagerEmail || data.tour.tourManagerPhone) ? (
          <div className="mb-5 flex flex-wrap gap-3 text-xs text-gray-500">
            {data.tour.tourManagerName ? <span className="font-medium text-gray-700">{data.tour.tourManagerName}</span> : null}
            {data.tour.tourManagerPhone ? (
              <a href={`tel:${data.tour.tourManagerPhone}`} className="text-blue-600">{data.tour.tourManagerPhone}</a>
            ) : null}
            {data.tour.tourManagerEmail ? (
              <a href={`mailto:${data.tour.tourManagerEmail}`} className="text-blue-600">{data.tour.tourManagerEmail}</a>
            ) : null}
          </div>
        ) : null}

        {/* Shows */}
        <div className="space-y-4">
          {sortedShows.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No shows scheduled yet.</div>
          ) : (
            sortedShows.map((show) => (
              <ShowNoteCard key={show.id} show={show} personalToken={personalToken!} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
