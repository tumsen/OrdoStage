import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { api } from "@/lib/api";
import type { Venue } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { VenueDocumentsSection } from "@/components/VenueDocumentsSection";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { AddressFields, type Address } from "@/components/AddressFields";
import {
  VenueFormSchema,
  type VenueFormValues,
  DEFAULT_VENUE_FORM_VALUES,
  venueToFormValues,
  venueFormValuesToPayload,
  StageSizeFields,
  VenueContactFields,
} from "@/components/venue/venueFormShared";

export default function VenueEdit() {
  const { id: venueId = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { canWrite } = usePermissions();

  const {
    data: venue,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["venue", venueId],
    queryFn: () => api.get<Venue>(`/api/venues/${venueId}`),
    enabled: Boolean(venueId),
  });

  const form = useForm<VenueFormValues>({
    resolver: zodResolver(VenueFormSchema),
    values: venue ? venueToFormValues(venue) : DEFAULT_VENUE_FORM_VALUES,
  });

  const updateMutation = useMutation({
    mutationFn: (data: VenueFormValues) =>
      api.put(`/api/venues/${venueId}`, venueFormValuesToPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["venues"] });
      queryClient.invalidateQueries({ queryKey: ["venue", venueId] });
      toast({ title: "Venue saved" });
      navigate(`/venues/${venueId}`);
    },
    onError: (err: Error) => {
      toast({ title: "Could not save venue", description: err.message, variant: "destructive" });
    },
  });

  if (!venueId) {
    return <Navigate to="/venues" replace />;
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 min-h-0 flex-col gap-6 p-6">
        <Skeleton className="h-9 w-48 bg-white/5" />
        <Skeleton className="h-64 w-full rounded-xl border border-white/10 bg-white/5" />
        <Skeleton className="h-40 w-full rounded-xl border border-white/10 bg-white/5" />
      </div>
    );
  }

  if (error || !venue) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center gap-4">
        <p className="text-red-400 text-sm">Could not load this venue.</p>
        <Button asChild variant="outline" className="border-white/10 bg-white/5 text-white">
          <Link to="/venues">Back to venues</Link>
        </Button>
      </div>
    );
  }

  if (!canWrite) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center gap-4 max-w-md mx-auto">
        <p className="text-white/50 text-sm">
          You do not have permission to edit venues. Ask an org owner for Manager access if you need to make changes.
        </p>
        <Button asChild variant="outline" className="border-white/10 bg-white/5 text-white">
          <Link to="/venues">Back to venues</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="shrink-0 border-b border-white/10 px-6 py-4">
        <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="shrink-0 h-9 w-9 text-white/50 hover:text-white mt-0.5"
            >
              <Link to="/venues" aria-label="Back to venues">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-white tracking-tight">Edit venue</h1>
              <p className="text-sm text-white/40 mt-0.5">{venue.name}</p>
            </div>
          </div>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-white/10 bg-white/5 text-white/80 hover:text-white shrink-0 self-start sm:self-center"
          >
            <Link to={`/venues/${venueId}`} className="gap-2">
              <CalendarDays className="h-4 w-4 opacity-70" />
              Booking calendar
            </Link>
          </Button>
        </div>
      </div>

      <form
        className="flex-1 overflow-y-auto p-6"
        onSubmit={form.handleSubmit((v) => updateMutation.mutate(v))}
      >
        <input type="hidden" {...form.register("customFieldsText")} />
        <div className="w-full space-y-8 pb-24">
          <section className="space-y-3">
            <Label htmlFor="venue-name" className="text-white/50 text-xs uppercase tracking-wide">
              Name
            </Label>
            <Input
              id="venue-name"
              {...form.register("name")}
              className="w-full bg-white/5 border-white/10 text-white h-10 text-sm focus:border-white/30"
            />
            {form.formState.errors.name && (
              <p className="text-red-400 text-xs">{form.formState.errors.name.message}</p>
            )}
          </section>

          <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-stretch md:gap-5">
            <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
              <Label className="text-white/50 text-xs uppercase tracking-wide">Address</Label>
              <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
                <AddressFields
                  value={{
                    street: form.watch("addressStreet") ?? "",
                    number: form.watch("addressNumber") ?? "",
                    zip: form.watch("addressZip") ?? "",
                    city: form.watch("addressCity") ?? "",
                    state: form.watch("addressState") ?? "",
                    country: form.watch("addressCountry") ?? "",
                  }}
                  onChange={(addr: Address) => {
                    form.setValue("addressStreet", addr.street);
                    form.setValue("addressNumber", addr.number);
                    form.setValue("addressZip", addr.zip);
                    form.setValue("addressCity", addr.city);
                    form.setValue("addressState", addr.state);
                    form.setValue("addressCountry", addr.country);
                  }}
                />
              </div>
            </div>
            <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
              <Label className="text-white/50 text-xs uppercase tracking-wide">Stage &amp; room size</Label>
              <StageSizeFields
                hideHeader
                className="flex-1"
                register={form.register}
                errors={form.formState.errors}
              />
            </div>
          </div>

          <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-stretch md:gap-5">
            <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
              <Label className="text-white/50 text-xs uppercase tracking-wide">Venue contact</Label>
              <VenueContactFields
                hideHeader
                className="flex-1"
                register={form.register}
                errors={form.formState.errors}
              />
            </div>
            <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
              <Label htmlFor="venue-notes" className="text-white/50 text-xs uppercase tracking-wide">
                Notes
              </Label>
              <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
                <p className="shrink-0 text-[11px] text-white/35 leading-relaxed">
                  Access, load-in, rigging quirks — anything the team should know.
                </p>
                <Textarea
                  id="venue-notes"
                  {...form.register("notes")}
                  placeholder="Access, loading dock, quirks…"
                  className="min-h-[10rem] w-full flex-1 resize-y bg-white/5 border-white/10 text-white text-sm focus:border-white/30 placeholder:text-white/25"
                />
              </div>
            </div>
          </div>

          <section className="space-y-3">
            <Label className="text-white/50 text-xs uppercase tracking-wide">Files</Label>
            <VenueDocumentsSection venueId={venue.id} canWrite={canWrite} />
          </section>

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/10">
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
            >
              {updateMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-white/50 hover:text-white"
              onClick={() => navigate("/venues")}
            >
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
