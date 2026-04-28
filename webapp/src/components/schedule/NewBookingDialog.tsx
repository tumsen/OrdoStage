import { useForm, useFieldArray } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type { CreateInternalBooking, Venue, Person } from "../../../../backend/src/types";
import { toast } from "@/hooks/use-toast";
import { DatetimeScheduleFields } from "@/components/DatetimeScheduleFields";

interface NewBookingDialogProps {
  open: boolean;
  onClose: () => void;
  venues: Venue[];
  people: Person[];
  /** Prefill start/end from week/day grid drag */
  initialSlot?: { startDate: string; endDate: string } | null;
}

const emptyForm: CreateInternalBooking = {
  title: "",
  description: "",
  startDate: "",
  endDate: "",
  type: "other",
  venueId: "",
  personIds: [],
};

export function NewBookingDialog({ open, onClose, venues, people, initialSlot }: NewBookingDialogProps) {
  const queryClient = useQueryClient();

  const form = useForm<CreateInternalBooking>({
    defaultValues: emptyForm,
  });

  useEffect(() => {
    if (!open) return;
    if (initialSlot?.startDate && initialSlot?.endDate) {
      form.reset({
        ...emptyForm,
        startDate: initialSlot.startDate,
        endDate: initialSlot.endDate,
      });
    } else {
      form.reset(emptyForm);
    }
  }, [open, initialSlot, form]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "personIds",
  });

  const mutation = useMutation({
    mutationFn: (data: CreateInternalBooking) => {
      const payload = {
        ...data,
        venueId: data.venueId || undefined,
        description: data.description || undefined,
        endDate: data.endDate || undefined,
        personIds: data.personIds && data.personIds.length > 0 ? data.personIds : undefined,
      };
      return api.post("/api/bookings", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      form.reset();
      onClose();
      toast({ title: "Booking created" });
    },
    onError: () => {
      toast({ title: "Failed to create booking", variant: "destructive" });
    },
  });

  function onSubmit(data: CreateInternalBooking) {
    mutation.mutate(data);
  }

  const inputClass = "bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-white/30 h-9";
  const labelClass = "text-white/60 text-sm";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-[#0d0d14] border-white/10 text-white sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white text-base">New Booking</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClass}>Title *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Booking title" className={inputClass} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Type */}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClass}>Type *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className={inputClass}>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-[#16161f] border-white/10 text-white">
                      <SelectItem value="rehearsal">Rehearsal</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Date range */}
            <div className="space-y-2">
              <FormLabel className={labelClass}>Schedule *</FormLabel>
              <DatetimeScheduleFields
                startValue={form.watch("startDate")}
                endValue={form.watch("endDate") ?? ""}
                onStartChange={(v) => form.setValue("startDate", v, { shouldDirty: true, shouldValidate: true })}
                onEndChange={(v) => form.setValue("endDate", v, { shouldDirty: true })}
              />
              <FormMessage>{form.formState.errors.startDate?.message}</FormMessage>
            </div>

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClass}>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Optional notes..."
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-white/30 resize-none min-h-[72px]"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Venue */}
            <FormField
              control={form.control}
              name="venueId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={labelClass}>Venue</FormLabel>
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className={inputClass}>
                        <SelectValue placeholder="No venue" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-[#16161f] border-white/10 text-white">
                      <SelectItem value="none">No venue</SelectItem>
                      {venues.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* People */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={labelClass}>People</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-white/50 hover:text-white gap-1"
                  onClick={() => append({ personId: "", role: "" })}
                >
                  <Plus size={12} />
                  Add person
                </Button>
              </div>

              {fields.map((field, idx) => (
                <div key={field.id} className="flex items-center gap-2">
                  <Select
                    value={form.watch(`personIds.${idx}.personId`)}
                    onValueChange={(v) => form.setValue(`personIds.${idx}.personId`, v)}
                  >
                    <SelectTrigger className="flex-1 bg-white/5 border-white/10 text-white text-sm h-8">
                      <SelectValue placeholder="Select person" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#16161f] border-white/10 text-white">
                      {people.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Role"
                    value={form.watch(`personIds.${idx}.role`) ?? ""}
                    onChange={(e) => form.setValue(`personIds.${idx}.role`, e.target.value)}
                    className="w-28 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-8 text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-white/30 hover:text-red-400 flex-shrink-0"
                    onClick={() => remove(idx)}
                  >
                    <X size={13} />
                  </Button>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <Button
                type="button"
                variant="ghost"
                className="text-white/50 hover:text-white"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50"
              >
                {mutation.isPending ? "Creating..." : "Create Booking"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
