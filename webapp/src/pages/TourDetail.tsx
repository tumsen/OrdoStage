import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Edit2,
  Plus,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  FileDown,
  Loader2,
  Users,
  CalendarDays,
  MapPin,
  Navigation,
  Mail,
  Copy,
  Check,
  Truck,
  Coffee,
  Globe,
  ExternalLink,
  FileText,
  Printer,
  Send,
  Link2,
  CheckCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import type { TourDetail, TourShow, TourPerson, TourShowPerson, TourPersonNote, Person, CreateTourShow, UpdateTour } from "../../../backend/src/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { downloadTourPDF } from "@/components/TourSchedulePDF";
import { downloadVenueTechRider, printVenueTechRider, uploadVenueTechRiderForSharing } from "@/lib/downloadVenueTechRider";
import { TourCalendarView } from "@/components/TourCalendarView";

// ── Google Maps helpers ───────────────────────────────────────────────────────

function mapsUrl(address: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}

function mapsDirectionsUrl(from: string, to: string): string {
  return `https://www.google.com/maps/dir/${encodeURIComponent(from)}/${encodeURIComponent(to)}`;
}

// Computes latest ETD: nextGetInTime minus travelTimeMinutes
function computeLatestETD(travelTimeMinutes: number, nextGetInTime: string): string | null {
  const match = nextGetInTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  let total = parseInt(match[1]) * 60 + parseInt(match[2]) - travelTimeMinutes;
  if (total < 0) total += 24 * 60; // wrap around
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function formatTravelTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ── Status badge ─────────────────────────────────────────────────────────────

function TourStatusBadge({ status }: { status: TourDetail["status"] }) {
  if (status === "active") {
    return (
      <Badge className="bg-green-900/40 text-green-300 border-green-700/40 hover:bg-green-900/40">
        Active
      </Badge>
    );
  }
  if (status === "completed") {
    return (
      <Badge className="bg-blue-900/40 text-blue-300 border-blue-700/40 hover:bg-blue-900/40">
        Completed
      </Badge>
    );
  }
  return (
    <Badge className="bg-white/5 text-white/40 border-white/10 hover:bg-white/5">
      Draft
    </Badge>
  );
}

// ── Info row helper ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="bg-white/[0.02] border border-white/8 rounded-lg px-4 py-3">
      <div className="text-xs text-white/35 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm text-white/80">{value}</div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs text-white/40 uppercase tracking-widest mt-5 mb-3 pb-2 border-b border-white/[0.06]">
      {children}
    </div>
  );
}

// ── Edit Tour Dialog ──────────────────────────────────────────────────────────

interface EditTourDialogProps {
  tour: TourDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EditTourDialog({ tour, open, onOpenChange }: EditTourDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(tour.name);
  const [description, setDescription] = useState(tour.description ?? "");
  const [status, setStatus] = useState<TourDetail["status"]>(tour.status);
  const [tourManagerName, setTourManagerName] = useState(tour.tourManagerName ?? "");
  const [tourManagerPhone, setTourManagerPhone] = useState(tour.tourManagerPhone ?? "");
  const [tourManagerEmail, setTourManagerEmail] = useState(tour.tourManagerEmail ?? "");
  const [notes, setNotes] = useState(tour.notes ?? "");
  const [showDuration, setShowDuration] = useState(tour.showDuration ?? "");
  const [handsNeeded, setHandsNeeded] = useState(tour.handsNeeded != null ? String(tour.handsNeeded) : "");
  const [stageRequirements, setStageRequirements] = useState(tour.stageRequirements ?? "");
  const [soundRequirements, setSoundRequirements] = useState(tour.soundRequirements ?? "");
  const [lightingRequirements, setLightingRequirements] = useState(tour.lightingRequirements ?? "");
  const [riderNotes, setRiderNotes] = useState(tour.riderNotes ?? "");

  const updateMutation = useMutation({
    mutationFn: (data: UpdateTour) => api.put<TourDetail>(`/api/tours/${tour.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tour", tour.id] });
      queryClient.invalidateQueries({ queryKey: ["tours"] });
      onOpenChange(false);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const payload: UpdateTour = {
      name: name.trim(),
      status,
      description: description.trim() || undefined,
      tourManagerName: tourManagerName.trim() || undefined,
      tourManagerPhone: tourManagerPhone.trim() || undefined,
      tourManagerEmail: tourManagerEmail.trim() || undefined,
      notes: notes.trim() || undefined,
      showDuration: showDuration.trim() || undefined,
      handsNeeded: handsNeeded ? parseInt(handsNeeded, 10) : undefined,
      stageRequirements: stageRequirements.trim() || undefined,
      soundRequirements: soundRequirements.trim() || undefined,
      lightingRequirements: lightingRequirements.trim() || undefined,
      riderNotes: riderNotes.trim() || undefined,
    };
    updateMutation.mutate(payload);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#16161f] border-white/10 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Tour</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-white/60 text-xs uppercase tracking-wide">
              Tour Name <span className="text-red-400">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-white/5 border-white/10 text-white focus:border-white/30"
              required
            />
          </div>
          <div className="space-y-2">
            <Label className="text-white/60 text-xs uppercase tracking-wide">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-white/5 border-white/10 text-white focus:border-white/30 resize-none"
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-white/60 text-xs uppercase tracking-wide">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white">
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="pt-2 border-t border-white/10">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-3">Tour Manager</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 col-span-2">
                <Label className="text-white/60 text-xs uppercase tracking-wide">Name</Label>
                <Input
                  value={tourManagerName}
                  onChange={(e) => setTourManagerName(e.target.value)}
                  placeholder="Tour manager name"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/60 text-xs uppercase tracking-wide">Phone</Label>
                <Input
                  value={tourManagerPhone}
                  onChange={(e) => setTourManagerPhone(e.target.value)}
                  className="bg-white/5 border-white/10 text-white focus:border-white/30"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/60 text-xs uppercase tracking-wide">Email</Label>
                <Input
                  value={tourManagerEmail}
                  onChange={(e) => setTourManagerEmail(e.target.value)}
                  type="email"
                  className="bg-white/5 border-white/10 text-white focus:border-white/30"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-white/60 text-xs uppercase tracking-wide">Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-white/5 border-white/10 text-white focus:border-white/30 resize-none"
              rows={3}
            />
          </div>

          <div className="pt-2 border-t border-white/10">
            <p className="text-xs text-white/40 uppercase tracking-wide mb-3">Technical Rider</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-white/60 text-xs uppercase tracking-wide">Show Duration</Label>
                  <Input
                    value={showDuration}
                    onChange={(e) => setShowDuration(e.target.value)}
                    placeholder="e.g. 1h 45min"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/60 text-xs uppercase tracking-wide">Hands Needed</Label>
                  <Input
                    type="number"
                    value={handsNeeded}
                    onChange={(e) => setHandsNeeded(e.target.value)}
                    placeholder="e.g. 4"
                    min="0"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-white/60 text-xs uppercase tracking-wide">Stage Requirements</Label>
                <Textarea
                  value={stageRequirements}
                  onChange={(e) => setStageRequirements(e.target.value)}
                  placeholder="Stage dimensions, setup requirements..."
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-none"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/60 text-xs uppercase tracking-wide">Sound Requirements</Label>
                <Textarea
                  value={soundRequirements}
                  onChange={(e) => setSoundRequirements(e.target.value)}
                  placeholder="PA system, microphones, monitors..."
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-none"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/60 text-xs uppercase tracking-wide">Lighting Requirements</Label>
                <Textarea
                  value={lightingRequirements}
                  onChange={(e) => setLightingRequirements(e.target.value)}
                  placeholder="Lighting rig, follow spots..."
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-none"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/60 text-xs uppercase tracking-wide">Additional Rider Notes</Label>
                <Textarea
                  value={riderNotes}
                  onChange={(e) => setRiderNotes(e.target.value)}
                  placeholder="Any other technical requirements..."
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-none"
                  rows={2}
                />
              </div>
            </div>
          </div>

          {updateMutation.isError ? (
            <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              {updateMutation.error instanceof Error
                ? updateMutation.error.message
                : "Failed to save changes."}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-white/10 text-white/60 hover:text-white bg-transparent"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || updateMutation.isPending}
              className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Show Form Dialog ──────────────────────────────────────────────────────────

interface ShowFormDialogProps {
  tourId: string;
  show?: TourShow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const emptyShowForm = {
  type: "show" as "show" | "travel" | "day_off",
  fromLocation: "",
  toLocation: "",
  date: "",
  showTime: "",
  venueCity: "",
  venueName: "",
  venueAddress: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  getInTime: "",
  rehearsalTime: "",
  soundcheckTime: "",
  doorsTime: "",
  hotelName: "",
  hotelAddress: "",
  hotelPhone: "",
  hotelCheckIn: "",
  hotelCheckOut: "",
  travelInfo: "",
  cateringInfo: "",
  notes: "",
  travelTimeMinutes: "",
  distanceKm: "",
};

type ShowFormState = typeof emptyShowForm;

function showToForm(show: TourShow): ShowFormState {
  return {
    type: (show.type ?? "show") as "show" | "travel" | "day_off",
    fromLocation: show.fromLocation ?? "",
    toLocation: show.toLocation ?? "",
    date: show.date,
    showTime: show.showTime ?? "",
    venueCity: show.venueCity ?? "",
    venueName: show.venueName ?? "",
    venueAddress: show.venueAddress ?? "",
    contactName: show.contactName ?? "",
    contactPhone: show.contactPhone ?? "",
    contactEmail: show.contactEmail ?? "",
    getInTime: show.getInTime ?? "",
    rehearsalTime: show.rehearsalTime ?? "",
    soundcheckTime: show.soundcheckTime ?? "",
    doorsTime: show.doorsTime ?? "",
    hotelName: show.hotelName ?? "",
    hotelAddress: show.hotelAddress ?? "",
    hotelPhone: show.hotelPhone ?? "",
    hotelCheckIn: show.hotelCheckIn ?? "",
    hotelCheckOut: show.hotelCheckOut ?? "",
    travelInfo: show.travelInfo ?? "",
    cateringInfo: show.cateringInfo ?? "",
    notes: show.notes ?? "",
    travelTimeMinutes: show.travelTimeMinutes != null ? String(show.travelTimeMinutes) : "",
    distanceKm: show.distanceKm != null ? String(show.distanceKm) : "",
  };
}

function formToPayload(form: ShowFormState): CreateTourShow {
  const payload: CreateTourShow = { date: form.date };
  payload.type = form.type;
  if (form.fromLocation) payload.fromLocation = form.fromLocation;
  if (form.toLocation) payload.toLocation = form.toLocation;
  if (form.showTime) payload.showTime = form.showTime;
  if (form.venueCity) payload.venueCity = form.venueCity;
  if (form.venueName) payload.venueName = form.venueName;
  if (form.venueAddress) payload.venueAddress = form.venueAddress;
  if (form.contactName) payload.contactName = form.contactName;
  if (form.contactPhone) payload.contactPhone = form.contactPhone;
  if (form.contactEmail) payload.contactEmail = form.contactEmail;
  if (form.getInTime) payload.getInTime = form.getInTime;
  if (form.rehearsalTime) payload.rehearsalTime = form.rehearsalTime;
  if (form.soundcheckTime) payload.soundcheckTime = form.soundcheckTime;
  if (form.doorsTime) payload.doorsTime = form.doorsTime;
  if (form.hotelName) payload.hotelName = form.hotelName;
  if (form.hotelAddress) payload.hotelAddress = form.hotelAddress;
  if (form.hotelPhone) payload.hotelPhone = form.hotelPhone;
  if (form.hotelCheckIn) payload.hotelCheckIn = form.hotelCheckIn;
  if (form.hotelCheckOut) payload.hotelCheckOut = form.hotelCheckOut;
  if (form.travelInfo) payload.travelInfo = form.travelInfo;
  if (form.cateringInfo) payload.cateringInfo = form.cateringInfo;
  if (form.notes) payload.notes = form.notes;
  if (form.travelTimeMinutes) payload.travelTimeMinutes = parseInt(form.travelTimeMinutes, 10);
  if (form.distanceKm) payload.distanceKm = parseFloat(form.distanceKm);
  return payload;
}

function ShowFormDialog({ tourId, show, open, onOpenChange }: ShowFormDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!show;
  const [form, setForm] = useState<ShowFormState>(show ? showToForm(show) : emptyShowForm);

  function setField(key: keyof ShowFormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const createMutation = useMutation({
    mutationFn: (data: CreateTourShow) =>
      api.post<TourShow>(`/api/tours/${tourId}/shows`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tour", tourId] });
      onOpenChange(false);
      setForm(emptyShowForm);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: CreateTourShow) =>
      api.put<TourShow>(`/api/tours/${tourId}/shows/${show?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tour", tourId] });
      onOpenChange(false);
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;
  const isError = createMutation.isError || updateMutation.isError;
  const mutError = createMutation.error || updateMutation.error;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.date) return;
    const payload = formToPayload(form);
    if (isEdit) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  }

  const fieldCls = "bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 h-9";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#16161f] border-white/10 text-white max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Day" : "Add Day"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          {/* Type selector */}
          <div className="space-y-2">
            <Label className="text-white/60 text-xs uppercase tracking-wide">Day Type</Label>
            <div className="flex gap-2">
              {(["show", "travel", "day_off"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setField("type", t)}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-colors",
                    form.type === t
                      ? t === "show"
                        ? "bg-red-900/40 border-red-700/50 text-red-300"
                        : t === "travel"
                        ? "bg-blue-900/40 border-blue-700/50 text-blue-300"
                        : "bg-green-900/40 border-green-700/50 text-green-300"
                      : "bg-white/[0.03] border-white/10 text-white/40 hover:text-white/60"
                  )}
                >
                  {t === "show" ? "Show" : t === "travel" ? "Travel Day" : "Day Off"}
                </button>
              ))}
            </div>
          </div>

          {/* Core */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-white/60 text-xs uppercase tracking-wide">
                Date <span className="text-red-400">*</span>
              </Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setField("date", e.target.value)}
                className={fieldCls + " [color-scheme:dark]"}
                required
              />
            </div>
            {form.type === "show" ? (
              <div className="space-y-2">
                <Label className="text-white/60 text-xs uppercase tracking-wide">Show Time</Label>
                <Input
                  value={form.showTime}
                  onChange={(e) => setField("showTime", e.target.value)}
                  placeholder="e.g. 20:00"
                  className={fieldCls}
                />
              </div>
            ) : null}
          </div>

          {/* Travel route */}
          {form.type === "travel" ? (
            <div>
              <SectionHeader>Route</SectionHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-white/60 text-xs uppercase tracking-wide">From</Label>
                  <Input
                    value={form.fromLocation}
                    onChange={(e) => setField("fromLocation", e.target.value)}
                    placeholder="Departing city / location"
                    className={fieldCls}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/60 text-xs uppercase tracking-wide">To</Label>
                  <Input
                    value={form.toLocation}
                    onChange={(e) => setField("toLocation", e.target.value)}
                    placeholder="Arriving city / location"
                    className={fieldCls}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {/* Day off location */}
          {form.type === "day_off" ? (
            <div>
              <SectionHeader>Location</SectionHeader>
              <div className="space-y-2">
                <Label className="text-white/60 text-xs uppercase tracking-wide">City / Location</Label>
                <Input
                  value={form.venueCity}
                  onChange={(e) => setField("venueCity", e.target.value)}
                  placeholder="Where are you that day?"
                  className={fieldCls}
                />
              </div>
            </div>
          ) : null}

          {/* Venue (show only) */}
          {form.type === "show" ? (
            <div>
              <SectionHeader>Venue</SectionHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-white/60 text-xs uppercase tracking-wide">City</Label>
                    <Input
                      value={form.venueCity}
                      onChange={(e) => setField("venueCity", e.target.value)}
                      placeholder="e.g. Manchester"
                      className={fieldCls}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-white/60 text-xs uppercase tracking-wide">Venue Name</Label>
                    <Input
                      value={form.venueName}
                      onChange={(e) => setField("venueName", e.target.value)}
                      placeholder="e.g. The Lowry"
                      className={fieldCls}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-white/60 text-xs uppercase tracking-wide">Venue Address</Label>
                  <Input
                    value={form.venueAddress}
                    onChange={(e) => setField("venueAddress", e.target.value)}
                    placeholder="Full address"
                    className={fieldCls}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {/* Schedule times (show only) */}
          {form.type === "show" ? (
            <div>
              <SectionHeader>Schedule</SectionHeader>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {(
                  [
                    ["Get-in Time", "getInTime"],
                    ["Rehearsal Time", "rehearsalTime"],
                    ["Soundcheck Time", "soundcheckTime"],
                    ["Doors Time", "doorsTime"],
                  ] as [string, keyof ShowFormState][]
                ).map(([label, key]) => (
                  <div key={key} className="space-y-2">
                    <Label className="text-white/60 text-xs uppercase tracking-wide">{label}</Label>
                    <Input
                      value={form[key] as string}
                      onChange={(e) => setField(key, e.target.value)}
                      placeholder="e.g. 14:00"
                      className={fieldCls}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Venue contact (show only) */}
          {form.type === "show" ? (
            <div>
              <SectionHeader>Venue Contact</SectionHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label className="text-white/60 text-xs uppercase tracking-wide">Contact Name</Label>
                  <Input
                    value={form.contactName}
                    onChange={(e) => setField("contactName", e.target.value)}
                    placeholder="Name"
                    className={fieldCls}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/60 text-xs uppercase tracking-wide">Phone</Label>
                  <Input
                    value={form.contactPhone}
                    onChange={(e) => setField("contactPhone", e.target.value)}
                    placeholder="+44..."
                    className={fieldCls}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/60 text-xs uppercase tracking-wide">Email</Label>
                  <Input
                    value={form.contactEmail}
                    onChange={(e) => setField("contactEmail", e.target.value)}
                    placeholder="email@..."
                    type="email"
                    className={fieldCls}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {/* Hotel */}
          <div>
            <SectionHeader>Hotel</SectionHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label className="text-white/60 text-xs uppercase tracking-wide">Hotel Name</Label>
                  <Input
                    value={form.hotelName}
                    onChange={(e) => setField("hotelName", e.target.value)}
                    placeholder="Hotel name"
                    className={fieldCls}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/60 text-xs uppercase tracking-wide">Phone</Label>
                  <Input
                    value={form.hotelPhone}
                    onChange={(e) => setField("hotelPhone", e.target.value)}
                    placeholder="+44..."
                    className={fieldCls}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-white/60 text-xs uppercase tracking-wide">Address</Label>
                <Input
                  value={form.hotelAddress}
                  onChange={(e) => setField("hotelAddress", e.target.value)}
                  placeholder="Hotel address"
                  className={fieldCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-white/60 text-xs uppercase tracking-wide">Check-in</Label>
                  <Input
                    value={form.hotelCheckIn}
                    onChange={(e) => setField("hotelCheckIn", e.target.value)}
                    placeholder="e.g. 15:00"
                    className={fieldCls}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/60 text-xs uppercase tracking-wide">Check-out</Label>
                  <Input
                    value={form.hotelCheckOut}
                    onChange={(e) => setField("hotelCheckOut", e.target.value)}
                    placeholder="e.g. 11:00"
                    className={fieldCls}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Logistics */}
          <div>
            <SectionHeader>Logistics</SectionHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-white/60 text-xs uppercase tracking-wide">Travel Time to Next (min)</Label>
                  <Input
                    type="number"
                    value={form.travelTimeMinutes}
                    onChange={(e) => setField("travelTimeMinutes", e.target.value)}
                    placeholder="e.g. 120"
                    min="0"
                    className={fieldCls}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/60 text-xs uppercase tracking-wide">Distance to Next (km)</Label>
                  <Input
                    type="number"
                    value={form.distanceKm}
                    onChange={(e) => setField("distanceKm", e.target.value)}
                    placeholder="e.g. 85"
                    min="0"
                    step="0.1"
                    className={fieldCls}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-white/60 text-xs uppercase tracking-wide">Travel Info</Label>
                <Textarea
                  value={form.travelInfo}
                  onChange={(e) => setField("travelInfo", e.target.value)}
                  placeholder="Travel arrangements, transport details..."
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-none"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/60 text-xs uppercase tracking-wide">Catering Info</Label>
                <Textarea
                  value={form.cateringInfo}
                  onChange={(e) => setField("cateringInfo", e.target.value)}
                  placeholder="Catering arrangements, meal times..."
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-none"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/60 text-xs uppercase tracking-wide">Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                  placeholder="Additional notes for this show..."
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-none"
                  rows={2}
                />
              </div>
            </div>
          </div>

          {isError ? (
            <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              {mutError instanceof Error ? mutError.message : "Failed to save show."}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-white/10 text-white/60 hover:text-white bg-transparent"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!form.date || isPending}
              className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
            >
              {isPending ? "Saving..." : isEdit ? "Save Changes" : "Add Day"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Send Tech Rider Dialog ────────────────────────────────────────────────────

interface SendTechRiderDialogProps {
  tour: TourDetail;
  show: TourShow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function buildTechRiderText(tour: TourDetail, show: TourShow, pdfUrl?: string | null): string {
  const date = new Date(show.date).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  const venue = [show.venueName, show.venueCity].filter(Boolean).join(", ");

  const lines: string[] = [];

  lines.push(`TECH RIDER`);
  lines.push(`==========`);
  lines.push(``);
  lines.push(`Tour: ${tour.name}`);
  if (venue) lines.push(`Venue: ${venue}`);
  if (show.venueAddress) lines.push(`Address: ${show.venueAddress}`);
  lines.push(`Date: ${date}`);
  lines.push(``);

  // Schedule
  const scheduleParts: string[] = [];
  if (show.getInTime) scheduleParts.push(`Get-in: ${show.getInTime}`);
  if (show.rehearsalTime) scheduleParts.push(`Rehearsal: ${show.rehearsalTime}`);
  if (show.soundcheckTime) scheduleParts.push(`Soundcheck: ${show.soundcheckTime}`);
  if (show.doorsTime) scheduleParts.push(`Doors: ${show.doorsTime}`);
  if (show.showTime) scheduleParts.push(`Show: ${show.showTime}`);
  if (tour.showDuration) scheduleParts.push(`Duration: ${tour.showDuration}`);
  if (scheduleParts.length > 0) {
    lines.push(`SCHEDULE`);
    lines.push(`--------`);
    scheduleParts.forEach(s => lines.push(s));
    lines.push(``);
  }

  // Crew
  if (tour.handsNeeded) {
    lines.push(`CREW REQUIRED`);
    lines.push(`-------------`);
    lines.push(`Hands needed at venue: ${tour.handsNeeded}`);
    lines.push(``);
  }

  // Technical requirements
  const hasReqs = tour.stageRequirements || tour.soundRequirements || tour.lightingRequirements;
  if (hasReqs) {
    lines.push(`TECHNICAL REQUIREMENTS`);
    lines.push(`----------------------`);
    if (tour.stageRequirements) {
      lines.push(`Stage Setup:`);
      lines.push(tour.stageRequirements);
      lines.push(``);
    }
    if (tour.soundRequirements) {
      lines.push(`Sound System:`);
      lines.push(tour.soundRequirements);
      lines.push(``);
    }
    if (tour.lightingRequirements) {
      lines.push(`Lighting:`);
      lines.push(tour.lightingRequirements);
      lines.push(``);
    }
  }

  // Additional notes
  const additionalNotes = [tour.riderNotes, show.notes].filter(Boolean).join("\n\n");
  if (additionalNotes) {
    lines.push(`ADDITIONAL NOTES`);
    lines.push(`----------------`);
    lines.push(additionalNotes);
    lines.push(``);
  }

  // PDF link
  if (pdfUrl) {
    lines.push(`TECH RIDER PDF`);
    lines.push(`--------------`);
    lines.push(`Download the complete tech rider (PDF):`);
    lines.push(pdfUrl);
    lines.push(``);
  }

  // Footer
  lines.push(`---`);
  if (tour.tourManagerName || tour.tourManagerPhone || tour.tourManagerEmail) {
    lines.push(`Questions? Contact our Tour Manager:`);
    if (tour.tourManagerName) lines.push(tour.tourManagerName);
    const contact = [tour.tourManagerPhone, tour.tourManagerEmail].filter(Boolean).join(" | ");
    if (contact) lines.push(contact);
  }

  return lines.join("\n");
}

function SendTechRiderDialog({ tour, show, open, onOpenChange }: SendTechRiderDialogProps) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfUploading, setPdfUploading] = useState(false);

  const subject = `Tech Rider — ${tour.name} — ${new Date(show.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}${show.venueName ? ` — ${show.venueName}` : ""}`;
  const emailText = buildTechRiderText(tour, show, pdfUrl);

  // Auto-generate shareable PDF link when dialog opens
  useEffect(() => {
    if (!open) return;
    setPdfUrl(null);
    setPdfUploading(true);
    uploadVenueTechRiderForSharing(tour, show)
      .then(url => setPdfUrl(url))
      .catch(() => { /* silently ignore — email sends without link */ })
      .finally(() => setPdfUploading(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCopy() {
    await navigator.clipboard.writeText(emailText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleOpenEmailApp() {
    const mailtoUrl = `mailto:${show.contactEmail || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailText)}`;
    window.open(mailtoUrl, "_blank");
    // Mark as sent
    try {
      const baseUrl = import.meta.env.VITE_BACKEND_URL || "";
      await fetch(`${baseUrl}/api/tours/${tour.id}/shows/${show.id}/tech-rider-sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sentTo: show.contactEmail }),
      });
      queryClient.invalidateQueries({ queryKey: ["tour", tour.id] });
    } catch {
      // non-critical, ignore
    }
  }

  const recipientDisplay = [show.contactName, show.contactEmail].filter(Boolean).join(" — ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#16161f] border-white/10 text-white max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail size={16} className="text-white/50" />
            Send Tech Rider
          </DialogTitle>
        </DialogHeader>

        {/* Recipient */}
        <div className="flex items-center gap-2 bg-white/[0.03] border border-white/8 rounded-lg px-4 py-3 flex-shrink-0">
          <span className="text-xs text-white/40 uppercase tracking-wide w-12 flex-shrink-0">To</span>
          <span className="text-sm text-white/80">{recipientDisplay || "No contact email set"}</span>
        </div>

        {/* Subject */}
        <div className="flex items-center gap-2 bg-white/[0.03] border border-white/8 rounded-lg px-4 py-3 flex-shrink-0">
          <span className="text-xs text-white/40 uppercase tracking-wide w-12 flex-shrink-0">Subject</span>
          <span className="text-sm text-white/70 truncate">{subject}</span>
        </div>

        {/* PDF status */}
        <div className="flex items-center gap-2 flex-shrink-0 px-1">
          {pdfUploading ? (
            <>
              <Loader2 size={12} className="animate-spin text-white/30" />
              <span className="text-xs text-white/40">Generating PDF download link…</span>
            </>
          ) : pdfUrl ? (
            <>
              <FileDown size={12} className="text-green-400/70" />
              <span className="text-xs text-green-400/70">PDF download link included in email</span>
            </>
          ) : (
            <span className="text-xs text-white/25">PDF link unavailable — text only</span>
          )}
        </div>

        {/* Email preview */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="bg-white/[0.02] border border-white/8 rounded-lg p-4">
            <pre className="text-xs text-white/60 leading-relaxed whitespace-pre-wrap font-mono">
              {emailText}
            </pre>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/10 text-white/60 hover:text-white bg-transparent"
          >
            Close
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleCopy}
            className="border-white/10 text-white/70 hover:text-white bg-transparent gap-2"
          >
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            {copied ? "Copied!" : "Copy Text"}
          </Button>
          <Button
            type="button"
            onClick={handleOpenEmailApp}
            disabled={!show.contactEmail}
            className="bg-red-900 hover:bg-red-800 text-white border-red-700/50 gap-2"
          >
            <Mail size={14} />
            Open in Email App
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Shows Tab ─────────────────────────────────────────────────────────────────

function formatShowDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ShowCard({
  show,
  dayNumber,
  tourId,
  tour,
}: {
  show: TourShow;
  dayNumber: number;
  tourId: string;
  tour: TourDetail;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [riderOpen, setRiderOpen] = useState(false);
  const [venuePdfLoading, setVenuePdfLoading] = useState(false);
  const [venuePrintLoading, setVenuePrintLoading] = useState(false);
  const [venueSendLoading, setVenueSendLoading] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/tours/${tourId}/shows/${show.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tour", tourId] });
      setDeleteOpen(false);
    },
  });

  const hasTimes = show.getInTime || show.rehearsalTime || show.soundcheckTime || show.doorsTime;
  const hasHotel = show.hotelName || show.hotelAddress;
  const hasContact = show.contactName || show.contactPhone || show.contactEmail;
  const hasLogistics = show.travelInfo || show.cateringInfo || show.notes;

  return (
    <>
      <div className={cn(
        "border rounded-xl overflow-hidden",
        show.type === "travel"
          ? "bg-blue-950/20 border-blue-900/30"
          : show.type === "day_off"
          ? "bg-green-950/20 border-green-900/30"
          : "bg-white/[0.03] border-white/8"
      )}>
        {/* Card header - always visible */}
        <div className="flex items-start gap-3 px-4 py-4">
          <div className={cn(
            "flex-shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center",
            show.type === "travel"
              ? "bg-blue-900/30 border-blue-700/30"
              : show.type === "day_off"
              ? "bg-green-900/30 border-green-700/30"
              : "bg-white/5 border-white/8"
          )}>
            {show.type === "travel" ? (
              <Truck size={14} className="text-blue-400/70" />
            ) : show.type === "day_off" ? (
              <Coffee size={14} className="text-green-400/70" />
            ) : (
              <span className="text-xs font-bold text-white/50">{dayNumber}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {show.type === "travel" ? (
                <span className="text-xs font-semibold text-blue-400/80 uppercase tracking-wide">Travel Day</span>
              ) : show.type === "day_off" ? (
                <span className="text-xs font-semibold text-green-400/80 uppercase tracking-wide">Day Off</span>
              ) : null}
              <span className="text-sm font-medium text-white/90">{formatShowDate(show.date)}</span>
              {show.type === "travel" && (show.fromLocation || show.toLocation) ? (
                <span className="text-xs text-white/50">
                  {[show.fromLocation, show.toLocation].filter(Boolean).join(" → ")}
                </span>
              ) : show.type !== "travel" && (show.venueCity || show.venueName) ? (
                <>
                  {show.venueCity ? <span className="text-xs text-white/40">{show.venueCity}</span> : null}
                  {show.venueName ? <span className="text-xs text-white/55 font-medium">{show.venueName}</span> : null}
                </>
              ) : null}
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {show.type === "travel" ? (
                <>
                  {show.getInTime ? <span className="text-xs text-white/35">Departure: {show.getInTime}</span> : null}
                  {show.showTime ? <span className="text-xs text-white/35">Arrival: {show.showTime}</span> : null}
                  {show.travelTimeMinutes ? <span className="text-xs text-white/30">{formatTravelTime(show.travelTimeMinutes)}</span> : null}
                </>
              ) : show.type === "day_off" ? (
                <>
                  {show.hotelName ? <span className="text-xs text-white/30">Hotel: {show.hotelName}</span> : null}
                  {show.notes ? <span className="text-xs text-white/25 truncate max-w-[200px]">{show.notes}</span> : null}
                </>
              ) : (
                <>
                  {show.showTime ? (
                    <span className="text-xs text-white/40">
                      Show: <span className="text-white/60 font-medium">{show.showTime}</span>
                    </span>
                  ) : null}
                  {show.getInTime ? (
                    <span className="text-xs text-white/35">Get-in: {show.getInTime}</span>
                  ) : null}
                  {show.soundcheckTime ? (
                    <span className="text-xs text-white/35">Soundcheck: {show.soundcheckTime}</span>
                  ) : null}
                  {show.hotelName ? (
                    <span className="text-xs text-white/30">Hotel: {show.hotelName}</span>
                  ) : null}
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {show.type !== "travel" && show.type !== "day_off" ? (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-white/30 hover:text-white"
                  onClick={async () => {
                    setVenuePdfLoading(true);
                    try { await downloadVenueTechRider(tour, show); }
                    finally { setVenuePdfLoading(false); }
                  }}
                  disabled={venuePdfLoading}
                  title={show.techRiderOpenCount > 0 ? `Tech rider opened ${show.techRiderOpenCount}×` : show.techRiderSentAt ? "Tech rider sent" : "Download tech rider PDF"}
                >
                  {venuePdfLoading ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
                </Button>
                {show.techRiderOpenCount > 0 ? (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400" />
                ) : show.techRiderSentAt ? (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-400/70" />
                ) : null}
              </div>
            ) : null}
            {show.contactEmail ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white/30 hover:text-blue-400"
                onClick={() => setRiderOpen(true)}
                title="Send tech rider"
              >
                <Mail size={13} />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white/30 hover:text-white"
              onClick={() => setEditOpen(true)}
            >
              <Edit2 size={13} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white/30 hover:text-red-400"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 size={13} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white/30 hover:text-white"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </Button>
          </div>
        </div>

        {/* Expanded details */}
        {expanded ? (
          <div className="border-t border-white/[0.06] px-4 py-4 space-y-4">
            {show.type === "travel" && (show.fromLocation || show.toLocation) ? (
              <div>
                <div className="text-xs text-white/35 uppercase tracking-wide mb-2">Route</div>
                <div className="flex items-center gap-2 text-sm text-white/70">
                  {show.fromLocation ? <span>{show.fromLocation}</span> : null}
                  {show.fromLocation && show.toLocation ? <span className="text-white/30">→</span> : null}
                  {show.toLocation ? <span>{show.toLocation}</span> : null}
                </div>
              </div>
            ) : null}
            {show.type !== "travel" && show.venueAddress ? (
              <div>
                <div className="text-xs text-white/35 uppercase tracking-wide mb-1">Venue Address</div>
                <a
                  href={mapsUrl(show.venueAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2 flex items-center gap-1"
                >
                  <MapPin size={11} />
                  {show.venueAddress}
                </a>
              </div>
            ) : null}

            {hasTimes ? (
              <div>
                <div className="text-xs text-white/35 uppercase tracking-wide mb-2">Schedule</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {show.getInTime ? (
                    <div className="bg-white/[0.02] rounded-lg px-3 py-2">
                      <div className="text-xs text-white/30 mb-0.5">Get-in</div>
                      <div className="text-sm font-medium text-white/80">{show.getInTime}</div>
                    </div>
                  ) : null}
                  {show.rehearsalTime ? (
                    <div className="bg-white/[0.02] rounded-lg px-3 py-2">
                      <div className="text-xs text-white/30 mb-0.5">Rehearsal</div>
                      <div className="text-sm font-medium text-white/80">{show.rehearsalTime}</div>
                    </div>
                  ) : null}
                  {show.soundcheckTime ? (
                    <div className="bg-white/[0.02] rounded-lg px-3 py-2">
                      <div className="text-xs text-white/30 mb-0.5">Soundcheck</div>
                      <div className="text-sm font-medium text-white/80">{show.soundcheckTime}</div>
                    </div>
                  ) : null}
                  {show.doorsTime ? (
                    <div className="bg-white/[0.02] rounded-lg px-3 py-2">
                      <div className="text-xs text-white/30 mb-0.5">Doors</div>
                      <div className="text-sm font-medium text-white/80">{show.doorsTime}</div>
                    </div>
                  ) : null}
                  {show.showTime ? (
                    <div className="bg-white/[0.02] rounded-lg px-3 py-2">
                      <div className="text-xs text-white/30 mb-0.5">Show</div>
                      <div className="text-sm font-medium text-white/80">{show.showTime}</div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {hasContact ? (
              <div>
                <div className="text-xs text-white/35 uppercase tracking-wide mb-2">Venue Contact</div>
                <div className="flex flex-col gap-1">
                  {show.contactName ? (
                    <span className="text-sm font-medium text-white/75">{show.contactName}</span>
                  ) : null}
                  <div className="flex flex-wrap gap-3">
                    {show.contactPhone ? (
                      <a href={`tel:${show.contactPhone}`} className="text-sm text-blue-400 hover:text-blue-300">{show.contactPhone}</a>
                    ) : null}
                    {show.contactEmail ? (
                      <a href={`mailto:${show.contactEmail}`} className="text-sm text-blue-400 hover:text-blue-300">{show.contactEmail}</a>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {hasHotel ? (
              <div>
                <div className="text-xs text-white/35 uppercase tracking-wide mb-2">Hotel</div>
                <div className="flex flex-col gap-1">
                  {show.hotelName ? <span className="text-sm font-medium text-white/75">{show.hotelName}</span> : null}
                  {show.hotelAddress ? (
                    <a href={mapsUrl(show.hotelAddress)} target="_blank" rel="noopener noreferrer"
                       className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 flex items-center gap-1">
                      <MapPin size={10} />{show.hotelAddress}
                    </a>
                  ) : null}
                  <div className="flex flex-wrap gap-3">
                    {show.hotelPhone ? <span className="text-xs text-white/50">{show.hotelPhone}</span> : null}
                    {show.hotelCheckIn ? <span className="text-xs text-white/40">Check-in: {show.hotelCheckIn}</span> : null}
                    {show.hotelCheckOut ? <span className="text-xs text-white/40">Check-out: {show.hotelCheckOut}</span> : null}
                  </div>
                </div>
              </div>
            ) : null}

            {show.travelInfo ? (
              <div>
                <div className="text-xs text-white/35 uppercase tracking-wide mb-1">Travel Info</div>
                <div className="text-sm text-white/60 leading-relaxed">{show.travelInfo}</div>
              </div>
            ) : null}

            {show.cateringInfo ? (
              <div>
                <div className="text-xs text-white/35 uppercase tracking-wide mb-1">Catering</div>
                <div className="text-sm text-white/60 leading-relaxed">{show.cateringInfo}</div>
              </div>
            ) : null}

            {show.notes ? (
              <div>
                <div className="text-xs text-white/35 uppercase tracking-wide mb-1">Notes</div>
                <div className="text-sm text-white/60 leading-relaxed">{show.notes}</div>
              </div>
            ) : null}

            {!show.venueAddress && !hasTimes && !hasContact && !hasHotel && !hasLogistics ? (
              <div className="text-sm text-white/25 text-center py-2">No additional details.</div>
            ) : null}

            {/* Person responses (hotel + notes) */}
            {(() => {
              const showNotes = tour.personNotes.filter((n: TourPersonNote) => n.showId === show.id);
              if (showNotes.length === 0) return null;
              return (
                <div>
                  <div className="text-xs text-white/35 uppercase tracking-wide mb-2">Responses</div>
                  <div className="space-y-1.5">
                    {showNotes.map((n: TourPersonNote) => (
                      <div key={n.id} className="flex items-start gap-2.5 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-white/70">{n.person.name}</span>
                            {n.person.role ? <span className="text-[10px] text-white/30">{n.person.role}</span> : null}
                            {n.needsHotel ? (
                              <span className="text-[10px] bg-indigo-900/40 text-indigo-300 border border-indigo-700/30 rounded px-1.5 py-0.5">Hotel needed</span>
                            ) : null}
                          </div>
                          {n.note ? <p className="text-xs text-white/45 mt-1 leading-relaxed">{n.note}</p> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* People for this show */}
            <div className="pt-1">
              <ShowPeopleSection show={show} tour={tour} />
            </div>

            {/* Venue tech rider actions */}
            <div className="pt-3 border-t border-white/[0.06]">
              <div className="text-xs text-white/35 uppercase tracking-wide mb-2">
                Venue Tech Rider
                {tour.techRiderPdfName ? (
                  <span className="text-white/25 normal-case tracking-normal ml-2">
                    (cover + {tour.techRiderPdfName})
                  </span>
                ) : (
                  <span className="text-white/20 normal-case tracking-normal ml-2">(cover page only — upload static PDF to include light plans)</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {/* Download */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    setVenuePdfLoading(true);
                    try { await downloadVenueTechRider(tour, show); }
                    finally { setVenuePdfLoading(false); }
                  }}
                  disabled={venuePdfLoading || venuePrintLoading || venueSendLoading}
                  className="border-white/10 text-white/60 hover:text-white bg-transparent gap-1.5 h-8 text-xs"
                >
                  {venuePdfLoading ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
                  {venuePdfLoading ? "Generating..." : "Download"}
                </Button>

                {/* Print */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    setVenuePrintLoading(true);
                    try { await printVenueTechRider(tour, show); }
                    finally { setVenuePrintLoading(false); }
                  }}
                  disabled={venuePdfLoading || venuePrintLoading || venueSendLoading}
                  className="border-white/10 text-white/60 hover:text-white bg-transparent gap-1.5 h-8 text-xs"
                >
                  {venuePrintLoading ? <Loader2 size={12} className="animate-spin" /> : <Printer size={12} />}
                  {venuePrintLoading ? "Opening..." : "Print"}
                </Button>

                {/* Send to venue contact */}
                {show.contactEmail ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      setVenueSendLoading(true);
                      try {
                        const url = await uploadVenueTechRiderForSharing(tour, show);
                        const date = new Date(show.date).toLocaleDateString("en-GB", {
                          day: "numeric", month: "long", year: "numeric"
                        });
                        const venue = show.venueName || show.venueCity || "your venue";
                        const subject = encodeURIComponent(
                          `Tech Rider — ${tour.name} — ${date}`
                        );
                        const body = encodeURIComponent(
                          `Hi${show.contactName ? ` ${show.contactName}` : ""},\n\nPlease find the tech rider for ${tour.name} at ${venue} on ${date}:\n\n${url}\n\nThis includes our get-in schedule, crew requirements, and technical specifications.\n\nPlease don't hesitate to get in touch if you have any questions.\n\nBest regards,\n${tour.tourManagerName || ""}`
                        );
                        window.open(`mailto:${show.contactEmail}?subject=${subject}&body=${body}`, "_blank");
                        // Mark as sent
                        try {
                          const baseUrl = import.meta.env.VITE_BACKEND_URL || "";
                          await fetch(`${baseUrl}/api/tours/${tour.id}/shows/${show.id}/tech-rider-sent`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ sentTo: show.contactEmail }),
                          });
                          queryClient.invalidateQueries({ queryKey: ["tour", tour.id] });
                        } catch {
                          // non-critical, ignore
                        }
                      } finally {
                        setVenueSendLoading(false);
                      }
                    }}
                    disabled={venuePdfLoading || venuePrintLoading || venueSendLoading}
                    className="border-white/10 text-white/60 hover:text-white bg-transparent gap-1.5 h-8 text-xs"
                  >
                    {venueSendLoading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    {venueSendLoading ? "Uploading PDF..." : `Send to ${show.contactName || show.contactEmail}`}
                  </Button>
                ) : null}
              </div>
              {/* Delivery tracking panel */}
              {(show.techRiderSentAt || show.techRiderOpenCount > 0) ? (
                <div className="mt-3 rounded-lg border border-white/[0.07] overflow-hidden">
                  {/* Sent row */}
                  {show.techRiderSentAt ? (
                    <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white/[0.05] last:border-b-0">
                      <div className="w-5 h-5 rounded-full bg-blue-900/40 border border-blue-700/30 flex items-center justify-center flex-shrink-0">
                        <Send size={9} className="text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-white/60">Sent</div>
                        <div className="text-xs text-white/35 truncate">
                          {new Date(show.techRiderSentAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                          {" at "}
                          {new Date(show.techRiderSentAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                          {show.techRiderSentTo ? ` → ${show.techRiderSentTo}` : ""}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Download count row */}
                  <div className={cn(
                    "flex items-center gap-3 px-3 py-2.5",
                    show.techRiderOpenCount > 0 ? "bg-green-950/20" : "bg-white/[0.01]"
                  )}>
                    <div className={cn(
                      "w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0",
                      show.techRiderOpenCount > 0
                        ? "bg-green-900/40 border-green-700/30"
                        : "bg-white/5 border-white/10"
                    )}>
                      <CheckCheck size={9} className={show.techRiderOpenCount > 0 ? "text-green-400" : "text-white/20"} />
                    </div>
                    <div className="flex-1 min-w-0">
                      {show.techRiderOpenCount > 0 ? (
                        <>
                          <div className="text-xs font-medium text-green-400/80">
                            Downloaded {show.techRiderOpenCount} {show.techRiderOpenCount === 1 ? "time" : "times"}
                          </div>
                          <div className="text-xs text-green-400/40 space-y-0.5">
                            {show.techRiderOpenedAt ? (
                              <div>
                                First: {new Date(show.techRiderOpenedAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                                {" at "}
                                {new Date(show.techRiderOpenedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                              </div>
                            ) : null}
                            {show.techRiderLastOpenedAt && show.techRiderLastOpenedAt !== show.techRiderOpenedAt ? (
                              <div>
                                Last: {new Date(show.techRiderLastOpenedAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                                {" at "}
                                {new Date(show.techRiderLastOpenedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                              </div>
                            ) : null}
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-white/25">Not yet downloaded</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <ShowFormDialog
        tourId={tourId}
        show={show}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="bg-[#16161f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete show?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              The show on {formatShowDate(show.date)} will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {riderOpen ? (
        <SendTechRiderDialog
          tour={tour}
          show={show}
          open={riderOpen}
          onOpenChange={setRiderOpen}
        />
      ) : null}
    </>
  );
}

// ── Travel Connector ──────────────────────────────────────────────────────────

interface TravelConnectorProps {
  currentShow: TourShow;
  nextShow: TourShow;
}

function TravelConnector({ currentShow, nextShow }: TravelConnectorProps) {
  const nextVenueLabel = [nextShow.venueCity, nextShow.venueName].filter(Boolean).join(" · ");
  const nextAddress = nextShow.venueAddress || nextShow.venueName || nextShow.venueCity;
  const currentAddress = currentShow.venueAddress || currentShow.venueName || currentShow.venueCity;

  const etd = (currentShow.travelTimeMinutes && nextShow.getInTime)
    ? computeLatestETD(currentShow.travelTimeMinutes, nextShow.getInTime)
    : null;

  return (
    <div className="flex items-stretch gap-3 my-1 pl-4">
      {/* Vertical line */}
      <div className="flex flex-col items-center w-10 flex-shrink-0">
        <div className="w-px flex-1 bg-white/10" />
        <div className="w-1.5 h-1.5 rounded-full bg-white/20 my-1" />
        <div className="w-px flex-1 bg-white/10" />
      </div>

      {/* Travel info */}
      <div className="flex-1 py-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {nextVenueLabel ? (
          <span className="text-xs text-white/35 flex items-center gap-1">
            <Navigation size={10} className="text-white/25" />
            {nextVenueLabel}
          </span>
        ) : null}
        {currentShow.distanceKm ? (
          <span className="text-xs text-white/30">{currentShow.distanceKm} km</span>
        ) : null}
        {currentShow.travelTimeMinutes ? (
          <span className="text-xs text-white/30">{formatTravelTime(currentShow.travelTimeMinutes)}</span>
        ) : null}
        {etd ? (
          <span className="text-xs text-white/40">
            Latest ETD: <span className="font-medium text-amber-400/70">{etd}</span>
          </span>
        ) : null}
        {currentAddress && nextAddress ? (
          <a
            href={mapsDirectionsUrl(currentAddress, nextAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400/60 hover:text-blue-400 flex items-center gap-1 ml-auto"
          >
            <MapPin size={10} />
            Directions
          </a>
        ) : null}
      </div>
    </div>
  );
}

function ShowsTab({ tour }: { tour: TourDetail }) {
  const [addOpen, setAddOpen] = useState(false);
  const sortedShows = [...tour.shows].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/40">
          {sortedShows.length} {sortedShows.length === 1 ? "show" : "shows"}
        </span>
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          className="bg-white/5 hover:bg-white/10 text-white border border-white/10 gap-2 h-8"
        >
          <Plus size={13} /> Add Day
        </Button>
      </div>

      {sortedShows.length === 0 ? (
        <div className="py-12 text-center">
          <CalendarDays size={24} className="text-white/15 mx-auto mb-3" />
          <p className="text-white/30 text-sm">No shows added yet.</p>
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            variant="outline"
            className="mt-3 border-white/10 text-white/50 hover:text-white bg-transparent gap-2"
          >
            <Plus size={12} /> Add First Day
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedShows.map((show, i) => {
            const nextShow = sortedShows[i + 1];
            const isDifferentDate = nextShow && show.date.slice(0, 10) !== nextShow.date.slice(0, 10);
            return (
              <div key={show.id}>
                <ShowCard show={show} dayNumber={i + 1} tourId={tour.id} tour={tour} />
                {isDifferentDate ? (
                  <TravelConnector currentShow={show} nextShow={nextShow} />
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <ShowFormDialog
        tourId={tour.id}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
    </div>
  );
}

// ── Show People Section ────────────────────────────────────────────────────────

function ShowPeopleSection({ show, tour }: { show: TourShow; tour: TourDetail }) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [role, setRole] = useState("");

  const { data: allPeople } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<Person[]>("/api/people"),
  });

  const isOverridden = show.showPeople.length > 0;
  // Effective people: show-level if overridden, otherwise tour defaults
  const effectivePeople = isOverridden
    ? show.showPeople
    : tour.people;

  const addMutation = useMutation({
    mutationFn: ({ personId, role }: { personId: string; role?: string }) =>
      api.post<TourShowPerson>(`/api/tours/${tour.id}/shows/${show.id}/people`, {
        personId,
        role: role || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tour", tour.id] });
      setAddOpen(false);
      setSelectedPersonId("");
      setRole("");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (assignmentId: string) =>
      api.delete(`/api/tours/${tour.id}/shows/${show.id}/people/${assignmentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tour", tour.id] });
    },
  });

  // "Customize" = copy tour people into show-level people (one by one)
  const customizeMutation = useMutation({
    mutationFn: async () => {
      for (const tp of tour.people) {
        await api.post<TourShowPerson>(`/api/tours/${tour.id}/shows/${show.id}/people`, {
          personId: tp.personId,
          role: tp.role || undefined,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tour", tour.id] });
    },
  });

  // "Reset" = delete all show-level people
  const resetMutation = useMutation({
    mutationFn: async () => {
      for (const sp of show.showPeople) {
        await api.delete(`/api/tours/${tour.id}/shows/${show.id}/people/${sp.id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tour", tour.id] });
    },
  });

  // Available to add: all org people not already in the effective list
  const effectivePersonIds = new Set(
    isOverridden
      ? show.showPeople.map((sp) => sp.personId)
      : tour.people.map((tp) => tp.personId)
  );
  const available = (allPeople ?? []).filter((p) => !effectivePersonIds.has(p.id));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-white/35 uppercase tracking-wide flex items-center gap-2">
          People
          {!isOverridden ? (
            <span className="normal-case tracking-normal text-white/20 text-[10px]">tour defaults</span>
          ) : (
            <span className="normal-case tracking-normal text-amber-400/50 text-[10px]">custom roster</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isOverridden ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              className="h-6 px-2 text-[10px] text-white/25 hover:text-white/60"
            >
              Reset to defaults
            </Button>
          ) : tour.people.length > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => customizeMutation.mutate()}
              disabled={customizeMutation.isPending}
              className="h-6 px-2 text-[10px] text-white/25 hover:text-white/60"
            >
              {customizeMutation.isPending ? "Copying..." : "Customize"}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAddOpen(true)}
            className="h-6 px-2 text-[10px] text-white/25 hover:text-white/60 gap-1"
          >
            <Plus size={10} /> Add
          </Button>
        </div>
      </div>

      {effectivePeople.length === 0 ? (
        <div className="text-xs text-white/20 italic py-1">No people assigned to this tour yet.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {effectivePeople.map((p) => {
            const person = "person" in p ? p.person : null;
            const name = person?.name ?? "";
            const roleLabel = (p.role ?? person?.role) || null;
            return (
              <div
                key={p.id}
                className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.07] rounded-md px-2.5 py-1"
              >
                <div>
                  <span className="text-xs text-white/70">{name}</span>
                  {roleLabel ? (
                    <span className="text-[10px] text-white/35 ml-1.5">{roleLabel}</span>
                  ) : null}
                </div>
                {isOverridden ? (
                  <button
                    onClick={() => removeMutation.mutate(p.id)}
                    disabled={removeMutation.isPending}
                    className="text-white/20 hover:text-red-400 ml-1"
                  >
                    <X size={10} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-[#16161f] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Add Person to This Show</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-white/60 text-xs uppercase tracking-wide">Person</Label>
              <Select value={selectedPersonId} onValueChange={setSelectedPersonId}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Select a person..." />
                </SelectTrigger>
                <SelectContent className="bg-[#16161f] border-white/10 text-white">
                  {available.length === 0 ? (
                    <SelectItem value="__empty__" disabled>All people already added</SelectItem>
                  ) : (
                    available.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}{p.role ? ` — ${p.role}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-white/60 text-xs uppercase tracking-wide">Role (optional)</Label>
              <Input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Lead Actor, Stage Manager..."
                className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              className="border-white/10 text-white/60 hover:text-white bg-transparent"
            >
              Cancel
            </Button>
            <Button
              disabled={!selectedPersonId || addMutation.isPending}
              onClick={() => addMutation.mutate({ personId: selectedPersonId, role })}
              className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
            >
              {addMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── People Tab ────────────────────────────────────────────────────────────────

function PeopleTab({ tour }: { tour: TourDetail }) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [role, setRole] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: allPeople } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<Person[]>("/api/people"),
  });

  const assignMutation = useMutation({
    mutationFn: ({ personId, role }: { personId: string; role?: string }) =>
      api.post<TourPerson>(`/api/tours/${tour.id}/people`, { personId, role: role || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tour", tour.id] });
      setAddOpen(false);
      setSelectedPersonId("");
      setRole("");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (assignmentId: string) =>
      api.delete(`/api/tours/${tour.id}/people/${assignmentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tour", tour.id] });
    },
  });

  const assignedIds = new Set(tour.people.map((tp) => tp.personId));
  const available = (allPeople ?? []).filter((p) => !assignedIds.has(p.id));

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/30 mb-4">Default roster for all shows. Override individual shows below.</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/40">
          {tour.people.length} {tour.people.length === 1 ? "person" : "people"}
        </span>
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          className="bg-white/5 hover:bg-white/10 text-white border border-white/10 gap-2 h-8"
        >
          <Plus size={13} /> Add Person
        </Button>
      </div>

      {tour.people.length === 0 ? (
        <div className="py-12 text-center">
          <Users size={24} className="text-white/15 mx-auto mb-3" />
          <p className="text-white/30 text-sm">No people assigned yet.</p>
          <Button
            size="sm"
            onClick={() => setAddOpen(true)}
            variant="outline"
            className="mt-3 border-white/10 text-white/50 hover:text-white bg-transparent gap-2"
          >
            <Plus size={12} /> Add Person
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {tour.people.map((tp: TourPerson) => (
            <div
              key={tp.id}
              className="flex items-center justify-between bg-white/[0.03] border border-white/8 rounded-lg px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium text-white/90">{tp.person.name}</div>
                <div className="text-xs text-white/40 mt-0.5">
                  {tp.role ? tp.role : tp.person.role ? tp.person.role : "No role"}
                </div>
                {(tp.person.phone || tp.person.email) ? (
                  <div className="text-xs text-white/30 mt-0.5">
                    {[tp.person.phone, tp.person.email].filter(Boolean).join(" · ")}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    await navigator.clipboard.writeText(`${window.location.origin}/p/${tp.personalToken}`);
                    setCopiedId(tp.id);
                    setTimeout(() => setCopiedId(null), 2000);
                  }}
                  className="h-7 w-7 text-white/25 hover:text-blue-400"
                  title="Copy personal link"
                >
                  {copiedId === tp.id ? <Check size={13} className="text-green-400" /> : <Link2 size={13} />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeMutation.mutate(tp.id)}
                  className="h-7 w-7 text-white/25 hover:text-red-400"
                  disabled={removeMutation.isPending}
                >
                  <X size={13} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-[#16161f] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Add to Tour Roster</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-white/60 text-xs uppercase tracking-wide">Person</Label>
              <Select value={selectedPersonId} onValueChange={setSelectedPersonId}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Select a person..." />
                </SelectTrigger>
                <SelectContent className="bg-[#16161f] border-white/10 text-white">
                  {available.length === 0 ? (
                    <SelectItem value="__empty__" disabled>
                      All people already assigned
                    </SelectItem>
                  ) : (
                    available.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.role ? ` — ${p.role}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-white/60 text-xs uppercase tracking-wide">
                Role for this tour (optional)
              </Label>
              <Input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Lead Actor, Stage Manager..."
                className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              className="border-white/10 text-white/60 hover:text-white bg-transparent"
            >
              Cancel
            </Button>
            <Button
              disabled={!selectedPersonId || assignMutation.isPending}
              onClick={() => assignMutation.mutate({ personId: selectedPersonId, role })}
              className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
            >
              {assignMutation.isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Share Tour Section ────────────────────────────────────────────────────────

function ShareTourSection({ tour }: { tour: TourDetail }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}/t/${tour.shareToken}`;

  async function handleCopyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleEmailSchedule() {
    const subject = encodeURIComponent(`Tour Schedule: ${tour.name}`);
    const body = encodeURIComponent(
      `Hi,\n\nHere is the tour schedule for ${tour.name}:\n\n${shareUrl}\n\nBest regards`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
  }

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-center gap-2 bg-white/[0.03] border border-white/8 rounded-lg px-3 py-2">
        <Globe size={12} className="text-white/30 flex-shrink-0" />
        <span className="text-xs text-white/50 flex-1 truncate font-mono">{shareUrl}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCopyLink}
          className="h-6 px-2 text-xs text-white/40 hover:text-white gap-1"
        >
          {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleEmailSchedule}
          className="border-white/10 text-white/60 hover:text-white bg-transparent gap-2 h-8"
        >
          <Mail size={12} />
          Email Schedule Link
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-white/10 text-white/60 hover:text-white bg-transparent gap-2 h-8"
          onClick={() => window.open(shareUrl, "_blank")}
        >
          <ExternalLink size={12} />
          Preview
        </Button>
      </div>
    </div>
  );
}

// ── Tech Rider PDF Section ────────────────────────────────────────────────────

function TechRiderPDFSection({ tour }: { tour: TourDetail }) {
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const baseUrl = import.meta.env.VITE_BACKEND_URL || "";
      const resp = await fetch(`${baseUrl}/api/tours/${tour.id}/tech-rider`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!resp.ok) throw new Error("Upload failed");
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tour", tour.id] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      const baseUrl = import.meta.env.VITE_BACKEND_URL || "";
      await fetch(`${baseUrl}/api/tours/${tour.id}/tech-rider`, {
        method: "DELETE",
        credentials: "include",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tour", tour.id] });
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMutation.mutate(file);
    e.target.value = "";
  }

  return (
    <div className="mt-4 pt-3 border-t border-white/[0.06]">
      <div className="text-xs text-white/40 uppercase tracking-wide mb-2">
        Static Tech Rider PDF
      </div>
      {tour.techRiderPdfName ? (
        <div className="flex items-center gap-3 bg-white/[0.03] border border-white/8 rounded-lg px-4 py-3">
          <FileText size={14} className="text-white/40 flex-shrink-0" />
          <span className="text-sm text-white/70 flex-1 truncate">
            {tour.techRiderPdfName}
          </span>
          <label className="cursor-pointer">
            <span className="text-xs text-white/40 hover:text-white transition-colors">
              {uploadMutation.isPending ? "Uploading..." : "Replace"}
            </span>
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              className="hidden"
              disabled={uploadMutation.isPending}
            />
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeMutation.mutate()}
            disabled={removeMutation.isPending}
            className="h-6 px-2 text-white/30 hover:text-red-400"
          >
            <X size={11} />
          </Button>
        </div>
      ) : (
        <label className="cursor-pointer block">
          <div
            className={`border border-dashed border-white/15 rounded-lg px-4 py-3 flex items-center gap-3 hover:border-white/30 transition-colors ${
              uploadMutation.isPending ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            {uploadMutation.isPending ? (
              <Loader2 size={14} className="text-white/40 animate-spin" />
            ) : (
              <Plus size={14} className="text-white/40" />
            )}
            <span className="text-sm text-white/40">
              {uploadMutation.isPending
                ? "Uploading..."
                : "Upload static tech rider PDF (light plans, stage plot, etc.)"}
            </span>
          </div>
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="hidden"
            disabled={uploadMutation.isPending}
          />
        </label>
      )}
      <p className="text-xs text-white/25 mt-2">
        Automatically prepended to each venue's tech rider download.
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TourDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const { data: tour, isLoading, error } = useQuery({
    queryKey: ["tour", id],
    queryFn: () => api.get<TourDetail>(`/api/tours/${id}`),
    enabled: !!id,
  });

  async function handleDownloadPDF() {
    if (!tour) return;
    setPdfLoading(true);
    try {
      await downloadTourPDF(tour);
    } finally {
      setPdfLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48 bg-white/5" />
        <Skeleton className="h-40 w-full rounded-xl bg-white/5" />
        <Skeleton className="h-64 w-full rounded-xl bg-white/5" />
      </div>
    );
  }

  if (error || !tour) {
    return (
      <div className="p-6 text-center text-red-400">
        Failed to load tour.{" "}
        <button
          onClick={() => navigate("/tours")}
          className="underline text-white/50 hover:text-white"
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex gap-6 items-start">
        {/* Main content column */}
        <div className="flex-1 min-w-0 space-y-6">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/tours")}
        className="text-white/40 hover:text-white gap-2 -ml-2"
      >
        <ArrowLeft size={14} /> Back to Tours
      </Button>

      {/* Tour Info */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <h2 className="text-xl font-semibold text-white leading-tight">{tour.name}</h2>
            {tour.description ? (
              <p className="text-white/50 text-sm leading-relaxed">{tour.description}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <TourStatusBadge status={tour.status} />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditOpen(true)}
              className="h-8 w-8 text-white/40 hover:text-white"
            >
              <Edit2 size={14} />
            </Button>
          </div>
        </div>

        {(tour.tourManagerName || tour.tourManagerPhone || tour.tourManagerEmail) ? (
          <div>
            <div className="text-xs text-white/40 uppercase tracking-widest mb-3 pb-2 border-b border-white/[0.06]">
              Tour Manager
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <InfoRow label="Name" value={tour.tourManagerName} />
              <InfoRow label="Phone" value={tour.tourManagerPhone} />
              <InfoRow label="Email" value={tour.tourManagerEmail} />
            </div>
          </div>
        ) : null}

        {(tour.showDuration || tour.handsNeeded || tour.stageRequirements || tour.soundRequirements || tour.lightingRequirements || tour.riderNotes) ? (
          <div>
            <div className="text-xs text-white/40 uppercase tracking-widest mb-3 pb-2 border-b border-white/[0.06]">
              Technical Rider
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InfoRow label="Show Duration" value={tour.showDuration} />
              {tour.handsNeeded != null ? (
                <InfoRow label="Hands Needed" value={`${tour.handsNeeded} crew`} />
              ) : null}
              <InfoRow label="Stage Requirements" value={tour.stageRequirements} />
              <InfoRow label="Sound Requirements" value={tour.soundRequirements} />
              <InfoRow label="Lighting Requirements" value={tour.lightingRequirements} />
              {tour.riderNotes ? (
                <div className="sm:col-span-2">
                  <InfoRow label="Additional Notes" value={tour.riderNotes} />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <TechRiderPDFSection tour={tour} />

        {tour.notes ? (
          <div>
            <div className="text-xs text-white/40 uppercase tracking-widest mb-2 pb-2 border-b border-white/[0.06]">
              Notes
            </div>
            <p className="text-sm text-white/60 leading-relaxed">{tour.notes}</p>
          </div>
        ) : null}

        {/* PDF Download */}
        <div className="pt-2 border-t border-white/[0.06]">
          <Button
            onClick={handleDownloadPDF}
            disabled={pdfLoading}
            className="bg-white/5 hover:bg-white/10 text-white border border-white/10 gap-2"
          >
            {pdfLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <FileDown size={14} />
            )}
            {pdfLoading ? "Generating PDF..." : "Download Tour Schedule PDF"}
          </Button>
        </div>

        {/* Share */}
        <div className="pt-3 border-t border-white/[0.06]">
          <div className="text-xs text-white/40 uppercase tracking-widest mb-3">Share Tour Schedule</div>
          <ShareTourSection tour={tour} />
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        <Tabs defaultValue="shows">
          <div className="border-b border-white/10 px-6">
            <TabsList className="bg-transparent h-12 gap-1 p-0">
              <TabsTrigger
                value="shows"
                className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-red-500 text-white/40 rounded-none h-12 px-4"
              >
                Shows ({tour.shows.length})
              </TabsTrigger>
              <TabsTrigger
                value="people"
                className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-red-500 text-white/40 rounded-none h-12 px-4"
              >
                People ({tour.people.length})
              </TabsTrigger>
              <TabsTrigger
                value="calendar"
                className="data-[state=active]:bg-transparent data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-red-500 text-white/40 rounded-none h-12 px-4"
              >
                Calendar
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-6">
            <TabsContent value="shows" className="mt-0">
              <ShowsTab tour={tour} />
            </TabsContent>
            <TabsContent value="people" className="mt-0">
              <PeopleTab tour={tour} />
            </TabsContent>
            <TabsContent value="calendar" className="mt-0">
              <TourCalendarView tour={tour} />
            </TabsContent>
          </div>
        </Tabs>
      </div>

          <EditTourDialog tour={tour} open={editOpen} onOpenChange={setEditOpen} />
        </div>{/* end main content */}

        {/* Vertical calendar sidebar — hidden on mobile, sticky on desktop */}
        <div className="hidden lg:block w-52 flex-shrink-0">
          <div className="sticky top-6">
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
              <div className="text-[10px] text-white/25 uppercase tracking-widest mb-3 font-semibold">Schedule</div>
              <TourCalendarView tour={tour} />
            </div>
          </div>
        </div>
      </div>{/* end flex row */}
    </div>
  );
}
