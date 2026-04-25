import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Copy, Trash2, Check, Share2 } from "lucide-react";
import { api } from "@/lib/api";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import type { Calendar } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

const CalendarFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  filter: z.string().optional(),
});

type CalendarFormValues = z.infer<typeof CalendarFormSchema>;

function getIcsUrl(token: string): string {
  const base = import.meta.env.VITE_BACKEND_URL || window.location.origin;
  return `${base}/api/calendars/${token}.ics`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="gap-1.5 h-8 text-white/40 hover:text-white border border-white/10 hover:border-white/20"
    >
      {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
      {copied ? "Copied!" : "Copy URL"}
    </Button>
  );
}

export default function Calendars() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: calendars, isLoading, error } = useQuery({
    queryKey: ["calendars"],
    queryFn: () => api.get<Calendar[]>("/api/calendars"),
  });

  const form = useForm<CalendarFormValues>({
    resolver: zodResolver(CalendarFormSchema),
    defaultValues: { name: "", filter: "" },
  });

  const createMutation = useMutation({
    mutationFn: (data: CalendarFormValues) =>
      api.post<Calendar>("/api/calendars", {
        name: data.name,
        filter: data.filter || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
      setCreateOpen(false);
      form.reset();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/calendars/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendars"] });
      setDeleteId(null);
    },
  });

  return (
    <div className="p-6 space-y-6">
      {/* Explainer */}
      <div className="bg-indigo-500/5 border border-indigo-500/15 rounded-xl p-5 flex gap-4">
        <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
          <Share2 size={16} className="text-indigo-400" />
        </div>
        <div>
          <div className="text-sm font-medium text-white/80 mb-1">Calendar Subscriptions</div>
          <p className="text-sm text-white/45 leading-relaxed">
            Share these URLs with your team. They can subscribe in Google Calendar, Apple Calendar, Outlook, or any app that supports ICS feeds. The feed stays live — new events appear automatically.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-2"
        >
          <Plus size={14} /> New Calendar
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl bg-white/5" />
          ))}
        </div>
      ) : error ? (
        <div className="py-10 text-center text-red-400 text-sm">Failed to load calendars.</div>
      ) : (calendars ?? []).length === 0 ? (
        <div className="py-12 text-center text-white/30 text-sm">
          No calendars yet. Create one to share with your team.
        </div>
      ) : (
        <div className="space-y-3">
          {(calendars ?? []).map((cal) => {
            const icsUrl = getIcsUrl(cal.token);
            return (
              <div
                key={cal.id}
                className="bg-white/[0.03] border border-white/10 rounded-xl p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white/90">{cal.name}</div>
                    {cal.filter ? (
                      <div className="text-xs text-white/40 mt-0.5 capitalize">
                        Filter: {cal.filter}
                      </div>
                    ) : (
                      <div className="text-xs text-white/30 mt-0.5">All events</div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteId(cal.id)}
                    className="h-7 w-7 text-white/25 hover:text-red-400 flex-shrink-0"
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>

                <div className="bg-white/[0.04] border border-white/8 rounded-lg px-3 py-2 flex items-center gap-3">
                  <code className="text-xs text-white/40 flex-1 truncate font-mono">{icsUrl}</code>
                  <CopyButton text={icsUrl} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-[#16161f] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>New Calendar</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4 py-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g. All Events, Confirmed Only..."
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30"
                      />
                    </FormControl>
                    <FormMessage className="text-red-400 text-xs" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="filter"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/60 text-xs uppercase tracking-wide">Filter by status (optional)</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === "__all__" ? "" : v)}
                      defaultValue="__all__"
                    >
                      <FormControl>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="bg-[#16161f] border-white/10 text-white">
                        <SelectItem value="__all__">All events</SelectItem>
                        <SelectItem value="confirmed">Confirmed only</SelectItem>
                        <SelectItem value="draft">Draft only</SelectItem>
                        <SelectItem value="cancelled">Cancelled only</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
              {createMutation.isError && (
                <div className="text-red-400 text-sm">
                  {createMutation.error instanceof Error
                    ? createMutation.error.message
                    : "Failed to create calendar."}
                </div>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                  className="border-white/10 text-white/60 hover:text-white bg-transparent"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
                >
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent className="bg-[#16161f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete calendar?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              Anyone subscribed to this calendar URL will stop receiving updates.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
              onClick={() => {
                if (!deleteId) return;
                if (!confirmDeleteAction("calendar")) return;
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
