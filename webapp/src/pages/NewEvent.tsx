import { useQuery, useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import type { Event, Venue } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Frontend Zod v3 schema (mirrors backend CreateEventSchema)
const EventFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  status: z.enum(["draft", "confirmed", "cancelled"]).default("draft"),
  venueId: z.string().optional(),
  tags: z.string().optional(),
});

type EventFormValues = z.infer<typeof EventFormSchema>;

export default function NewEvent() {
  const navigate = useNavigate();

  const { data: venues } = useQuery({
    queryKey: ["venues"],
    queryFn: () => api.get<Venue[]>("/api/venues"),
  });

  const form = useForm<EventFormValues>({
    resolver: zodResolver(EventFormSchema),
    defaultValues: {
      title: "",
      description: "",
      startDate: "",
      endDate: "",
      status: "draft",
      venueId: "",
      tags: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: EventFormValues) => api.post<Event>("/api/events", data),
    onSuccess: (event) => {
      navigate(`/events/${event.id}`);
    },
  });

  function onSubmit(values: EventFormValues) {
    const payload: EventFormValues = {
      ...values,
      venueId: values.venueId === "__none__" || values.venueId === "" ? undefined : values.venueId,
      endDate: values.endDate === "" ? undefined : values.endDate,
      description: values.description === "" ? undefined : values.description,
      tags: values.tags === "" ? undefined : values.tags,
    };
    createMutation.mutate(payload);
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/events")}
        className="text-white/40 hover:text-white gap-2 -ml-2"
      >
        <ArrowLeft size={14} /> Back to Events
      </Button>

      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6">
        <h2 className="text-base font-semibold text-white mb-6">Create New Event</h2>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/70 text-sm">Title *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g. A Midsummer Night's Dream"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
                    />
                  </FormControl>
                  <FormMessage className="text-red-400 text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/70 text-sm">Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Optional description..."
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-none"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage className="text-red-400 text-xs" />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/70 text-sm">Start Date & Time *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="datetime-local"
                        className="bg-white/5 border-white/10 text-white focus:border-white/30 [color-scheme:dark]"
                      />
                    </FormControl>
                    <FormMessage className="text-red-400 text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/70 text-sm">End Date & Time</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value ?? ""}
                        type="datetime-local"
                        className="bg-white/5 border-white/10 text-white focus:border-white/30 [color-scheme:dark]"
                      />
                    </FormControl>
                    <FormMessage className="text-red-400 text-xs" />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/70 text-sm">Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white focus:border-white/30">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-[#16161f] border-white/10 text-white">
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-red-400 text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="venueId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/70 text-sm">Venue</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value ?? ""}>
                      <FormControl>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white focus:border-white/30">
                          <SelectValue placeholder="No venue" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-[#16161f] border-white/10 text-white">
                        <SelectItem value="__none__">No venue</SelectItem>
                        {(venues ?? []).map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage className="text-red-400 text-xs" />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white/70 text-sm">Tags</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="e.g. drama, mainstage, summer"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
                    />
                  </FormControl>
                  <FormMessage className="text-red-400 text-xs" />
                </FormItem>
              )}
            />

            {createMutation.isError && (
              <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                {createMutation.error instanceof Error
                  ? createMutation.error.message
                  : "Failed to create event."}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/events")}
                className="border-white/10 text-white/60 hover:text-white hover:border-white/20 bg-transparent"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50"
              >
                {createMutation.isPending ? "Creating..." : "Create Event"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
