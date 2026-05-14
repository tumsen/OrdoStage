import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Edit2, Trash2, CalendarDays } from "lucide-react";
import { api } from "@/lib/api";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import type { Venue } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { useI18n } from "@/lib/i18n";
import { formatVenueCapacityDisplay, formatVenueDimensionMetersDisplay } from "@/lib/venueDisplay";
import { AddressFields, appleMapsUrl, formatAddress, googleMapsUrl, type Address } from "@/components/AddressFields";
import { DocumentListThumbnail } from "@/components/DocumentListThumbnail";
import {
  VenueFormSchema,
  type VenueFormValues,
  DEFAULT_VENUE_FORM_VALUES,
  venueFormValuesToPayload,
  CustomFieldsEditor,
  StageSizeFields,
  VenueContactFields,
  textToCustomFields,
  customFieldsToText,
} from "@/components/venue/venueFormShared";

function dimCell(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "—";
  return formatVenueDimensionMetersDisplay(s);
}

const backendBase = () => import.meta.env.VITE_BACKEND_URL || "";

function venueDocThumbDownloadUrl(docId: string): string {
  return `${backendBase()}/api/venues/documents/${docId}/download`;
}

function isVenueThumbImage(kind: string, mimeType: string): boolean {
  return kind === "image" || mimeType.startsWith("image/");
}

function VenueRow({
  venue,
  onDelete,
  canWrite,
}: {
  venue: Venue;
  onDelete: (id: string) => void;
  canWrite: boolean;
}) {
  const { locale, t } = useI18n();
  return (
    <tr className="border-b border-white/5 group hover:bg-white/[0.02] transition-colors">
      <td className="px-5 py-3.5 text-sm font-medium">
        <Link to={`/venues/${venue.id}`} className="text-white/90 hover:text-white hover:underline">
          {venue.name}
        </Link>
      </td>
      <td className="px-5 py-3.5 text-sm text-white/50 hidden sm:table-cell">
        {venue.addressStreet || venue.addressCity || venue.addressCountry
          ? formatAddress({
              street: venue.addressStreet,
              number: venue.addressNumber,
              zip: venue.addressZip,
              city: venue.addressCity,
              state: venue.addressState,
              country: venue.addressCountry,
            })
          : "—"}
        {venue.addressStreet || venue.addressCity || venue.addressCountry ? (
          <div className="mt-1 flex gap-3 text-[11px]">
            <a
              href={googleMapsUrl({
                street: venue.addressStreet,
                number: venue.addressNumber,
                zip: venue.addressZip,
                city: venue.addressCity,
                state: venue.addressState,
                country: venue.addressCountry,
              })}
              target="_blank"
              rel="noreferrer"
              className="text-blue-300 hover:text-blue-200"
            >
              Google Maps
            </a>
            <a
              href={appleMapsUrl({
                street: venue.addressStreet,
                number: venue.addressNumber,
                zip: venue.addressZip,
                city: venue.addressCity,
                state: venue.addressState,
                country: venue.addressCountry,
              })}
              target="_blank"
              rel="noreferrer"
              className="text-blue-300 hover:text-blue-200"
            >
              Apple Maps
            </a>
          </div>
        ) : null}
      </td>
      <td className="px-4 py-3 hidden md:table-cell align-middle">
        <div className="flex flex-wrap items-center gap-1 max-w-[11rem]">
          {(venue.documentThumbnails ?? []).length === 0 ? (
            <span className="text-[11px] text-white/25">—</span>
          ) : (
            (venue.documentThumbnails ?? []).map((d) => (
              <DocumentListThumbnail
                key={d.id}
                downloadUrl={venueDocThumbDownloadUrl(d.id)}
                mimeType={d.mimeType}
                filename={d.filename}
                preferImage={isVenueThumbImage(d.kind, d.mimeType)}
                sizeClassName="h-9 w-9"
              />
            ))
          )}
        </div>
      </td>
      <td className="px-5 py-3.5 text-sm text-white/50 hidden md:table-cell">
        <div>
          {venue.capacity != null ? formatVenueCapacityDisplay(venue.capacity, locale, t) : "—"}
        </div>
        <div className="text-[11px] text-white/30">
          {t("venueInfo.widthShort")} {dimCell(venue.width)} · {t("venueInfo.depthShort")} {dimCell(venue.length)} ·{" "}
          {t("venueInfo.heightShort")} {dimCell(venue.height)}
        </div>
        {venue.documentCount != null && venue.documentCount > 0 ? (
          <div className="text-[11px] text-white/40 mt-0.5">
            {venue.documentCount} file{venue.documentCount === 1 ? "" : "s"}
          </div>
        ) : null}
        {(venue.customFields ?? []).length > 0 ? (
          <div className="text-[11px] text-white/30 truncate max-w-[14rem]">
            {(venue.customFields ?? []).map((f) => `${f.key}: ${f.value}`).join(" · ")}
          </div>
        ) : null}
      </td>
      <td className="px-4 py-3 text-sm text-white/45 hidden md:table-cell max-w-[14rem]">
        {venue.notes?.trim() ? (
          <p className="text-[12px] leading-snug text-white/55 line-clamp-4 whitespace-pre-wrap break-words" title={venue.notes}>
            {venue.notes}
          </p>
        ) : (
          <span className="text-[11px] text-white/25">—</span>
        )}
      </td>
      <td className="px-5 py-3.5">
        <div className="flex items-center justify-end gap-0.5">
          <Button asChild variant="ghost" size="icon" className="h-7 w-7 text-sky-400/85 hover:text-sky-300" title="Booking calendar">
            <Link to={`/venues/${venue.id}`}>
              <CalendarDays className="h-[15px] w-[15px]" />
            </Link>
          </Button>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canWrite ? (
              <Button asChild variant="ghost" size="icon" className="h-7 w-7 text-white/30 hover:text-white" title="Edit venue">
                <Link to={`/venues/${venue.id}/edit`}>
                  <Edit2 size={13} />
                </Link>
              </Button>
            ) : null}
            {canWrite ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white/30 hover:text-red-400"
                onClick={() => onDelete(venue.id)}
              >
                <Trash2 size={13} />
              </Button>
            ) : null}
          </div>
        </div>
      </td>
    </tr>
  );
}

function AddVenueForm({ onSuccess, canWrite }: { onSuccess: () => void; canWrite: boolean }) {
  const form = useForm<VenueFormValues>({
    resolver: zodResolver(VenueFormSchema),
    defaultValues: DEFAULT_VENUE_FORM_VALUES,
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useMutation({
    mutationFn: (data: VenueFormValues) => api.post<Venue>("/api/venues", venueFormValuesToPayload(data)),
      onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["venues"] });
      form.reset(DEFAULT_VENUE_FORM_VALUES);
      onSuccess();
    },
    onError: (error: Error) => {
      toast({ title: "Could not save venue", description: error.message, variant: "destructive" });
    },
  });

  return (
    <tr className="border-t border-white/10 bg-white/[0.02]">
      <td className="px-5 py-3">
        <Input
          {...form.register("name")}
          placeholder="Venue name *"
          className="bg-white/5 border-white/10 text-white h-8 text-sm placeholder:text-white/25 focus:border-white/30"
        />
        {form.formState.errors.name && (
          <p className="text-red-400 text-xs mt-1">{form.formState.errors.name.message}</p>
        )}
      </td>
      <td className="px-5 py-3 hidden sm:table-cell">
        <AddressFields
          value={{
            street:  form.watch("addressStreet")  ?? "",
            number:  form.watch("addressNumber")  ?? "",
            zip:     form.watch("addressZip")     ?? "",
            city:    form.watch("addressCity")    ?? "",
            state:   form.watch("addressState")   ?? "",
            country: form.watch("addressCountry") ?? "",
          }}
          onChange={(addr: Address) => {
            form.setValue("addressStreet",  addr.street);
            form.setValue("addressNumber",  addr.number);
            form.setValue("addressZip",     addr.zip);
            form.setValue("addressCity",    addr.city);
            form.setValue("addressState",   addr.state);
            form.setValue("addressCountry", addr.country);
          }}
        />
      </td>
      <td className="px-4 py-3 hidden md:table-cell align-top">
        <p className="text-[11px] text-white/30 leading-snug">After saving, upload files from Edit.</p>
      </td>
      <td className="px-5 py-3 hidden md:table-cell align-top">
        <div className="space-y-3 max-w-md">
          <StageSizeFields register={form.register} errors={form.formState.errors} />
          <VenueContactFields register={form.register} errors={form.formState.errors} />
          <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <Label className="text-white/50 text-xs uppercase tracking-wide">Custom fields</Label>
            <Textarea {...form.register("customFieldsText")} className="hidden" />
            <CustomFieldsEditor
              fields={textToCustomFields(form.watch("customFieldsText"))}
              onChange={(fields) => form.setValue("customFieldsText", customFieldsToText(fields))}
            />
          </div>
          <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-3">
            <p className="text-[11px] text-white/45 leading-snug">
              Save this venue first, then use <span className="text-white/60">Edit</span> to upload drawings and photos.
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 hidden md:table-cell align-top max-w-[14rem]">
        <div className="space-y-1.5">
          <Label className="text-white/50 text-xs uppercase tracking-wide">Notes</Label>
          <Input
            {...form.register("notes")}
            placeholder="Access, loading dock, quirks…"
            className="bg-white/5 border-white/10 text-white h-8 text-sm placeholder:text-white/25 focus:border-white/30"
          />
        </div>
      </td>
      <td className="px-5 py-3">
        <Button
          size="sm"
          onClick={form.handleSubmit((v) => createMutation.mutate(v))}
          disabled={createMutation.isPending || !canWrite}
          className="bg-red-900 hover:bg-red-800 text-white border-red-700/50 h-8 gap-1.5"
        >
          <Plus size={13} />
          {createMutation.isPending ? "Saving…" : "Save Venue"}
        </Button>
      </td>
    </tr>
  );
}

export default function Venues() {
  const { canWrite } = usePermissions();
  const { t } = useI18n();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: venues, isLoading, error } = useQuery({
    queryKey: ["venues"],
    queryFn: () => api.get<Venue[]>("/api/venues"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/venues/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["venues"] });
      setDeleteId(null);
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-white/40">Manage your venues.</p>
        <Button
          size="sm"
          onClick={() => setShowAddForm(true)}
          disabled={!canWrite}
          title={canWrite ? undefined : "Read-only for your role. Ask an org owner to give you Manager access if you need to edit."}
          className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-2"
        >
          <Plus size={14} /> Add Venue
        </Button>
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-5 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide">Name</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide hidden sm:table-cell">Address</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide hidden md:table-cell w-[7.5rem]">
                {t("venueInfo.tableColumnFiles")}
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide hidden md:table-cell">
                {t("venueInfo.tableColumnTitle")}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide hidden md:table-cell max-w-[14rem]">
                {t("venueInfo.tableColumnNotes")}
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide w-20"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-5 py-8">
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full bg-white/5" />
                    ))}
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-red-400 text-sm">
                  Failed to load venues.
                </td>
              </tr>
            ) : (venues ?? []).length === 0 && !showAddForm ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-white/30 text-sm">
                  No venues yet.
                </td>
              </tr>
            ) : (
              (venues ?? []).map((venue) => (
                <VenueRow key={venue.id} venue={venue} onDelete={setDeleteId} canWrite={canWrite} />
              ))
            )}
            {showAddForm ? (
              <AddVenueForm onSuccess={() => setShowAddForm(false)} canWrite={canWrite} />
            ) : null}
          </tbody>
        </table>

        {!showAddForm && (venues ?? []).length > 0 && canWrite ? (
          <div className="px-5 py-3 border-t border-white/5">
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="text-xs text-white/30 hover:text-white/60 flex items-center gap-1.5 transition-colors"
            >
              <Plus size={12} /> Add another venue
            </button>
          </div>
        ) : null}
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent className="bg-[#16161f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete venue?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              This will permanently delete the venue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
              onClick={() => {
                if (!deleteId) return;
                if (!confirmDeleteAction("venue")) return;
                deleteMutation.mutate(deleteId);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
