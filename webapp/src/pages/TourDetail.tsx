import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
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
} from "lucide-react";
import { api } from "@/lib/api";
import type { TourDetail, TourShow, TourPerson, Person, CreateTourShow, UpdateTour } from "../../../backend/src/types";
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
};

type ShowFormState = typeof emptyShowForm;

function showToForm(show: TourShow): ShowFormState {
  return {
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
  };
}

function formToPayload(form: ShowFormState): CreateTourShow {
  const payload: CreateTourShow = { date: form.date };
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
          <DialogTitle>{isEdit ? "Edit Show" : "Add Show"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 py-2">
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
            <div className="space-y-2">
              <Label className="text-white/60 text-xs uppercase tracking-wide">Show Time</Label>
              <Input
                value={form.showTime}
                onChange={(e) => setField("showTime", e.target.value)}
                placeholder="e.g. 20:00"
                className={fieldCls}
              />
            </div>
          </div>

          {/* Venue */}
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

          {/* Schedule times */}
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

          {/* Venue contact */}
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
              {isPending ? "Saving..." : isEdit ? "Save Changes" : "Add Show"}
            </Button>
          </DialogFooter>
        </form>
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
}: {
  show: TourShow;
  dayNumber: number;
  tourId: string;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
      <div className="bg-white/[0.03] border border-white/8 rounded-xl overflow-hidden">
        {/* Card header - always visible */}
        <div className="flex items-start gap-3 px-4 py-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/5 border border-white/8 flex items-center justify-center">
            <span className="text-xs font-bold text-white/50">{dayNumber}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-white/90">{formatShowDate(show.date)}</span>
              {show.venueCity ? (
                <span className="text-xs text-white/40">{show.venueCity}</span>
              ) : null}
              {show.venueName ? (
                <span className="text-xs text-white/55 font-medium">{show.venueName}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
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
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
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
            {show.venueAddress ? (
              <div>
                <div className="text-xs text-white/35 uppercase tracking-wide mb-1">Venue Address</div>
                <div className="text-sm text-white/70">{show.venueAddress}</div>
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
                <div className="flex flex-wrap gap-4">
                  {show.contactName ? (
                    <span className="text-sm text-white/70">{show.contactName}</span>
                  ) : null}
                  {show.contactPhone ? (
                    <span className="text-sm text-white/50">{show.contactPhone}</span>
                  ) : null}
                  {show.contactEmail ? (
                    <span className="text-sm text-white/50">{show.contactEmail}</span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {hasHotel ? (
              <div>
                <div className="text-xs text-white/35 uppercase tracking-wide mb-2">Hotel</div>
                <div className="flex flex-wrap gap-4">
                  {show.hotelName ? (
                    <span className="text-sm font-medium text-white/70">{show.hotelName}</span>
                  ) : null}
                  {show.hotelAddress ? (
                    <span className="text-sm text-white/50">{show.hotelAddress}</span>
                  ) : null}
                  {show.hotelPhone ? (
                    <span className="text-sm text-white/50">{show.hotelPhone}</span>
                  ) : null}
                  {show.hotelCheckIn ? (
                    <span className="text-sm text-white/40">Check-in: {show.hotelCheckIn}</span>
                  ) : null}
                  {show.hotelCheckOut ? (
                    <span className="text-sm text-white/40">Check-out: {show.hotelCheckOut}</span>
                  ) : null}
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
    </>
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
          <Plus size={13} /> Add Show
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
            <Plus size={12} /> Add First Show
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedShows.map((show, i) => (
            <ShowCard key={show.id} show={show} dayNumber={i + 1} tourId={tour.id} />
          ))}
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

// ── People Tab ────────────────────────────────────────────────────────────────

function PeopleTab({ tour }: { tour: TourDetail }) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [role, setRole] = useState("");

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
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-[#16161f] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Add Person to Tour</DialogTitle>
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
    <div className="p-6 max-w-3xl mx-auto space-y-6">
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
            </TabsList>
          </div>

          <div className="p-6">
            <TabsContent value="shows" className="mt-0">
              <ShowsTab tour={tour} />
            </TabsContent>
            <TabsContent value="people" className="mt-0">
              <PeopleTab tour={tour} />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <EditTourDialog tour={tour} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
