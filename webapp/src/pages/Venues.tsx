import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Edit2, Trash2, Check, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Venue } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const VenueFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  address: z.string().optional(),
  capacity: z.union([z.literal(""), z.coerce.number().int().min(0)]),
  width: z.string().optional(),
  length: z.string().optional(),
  height: z.string().optional(),
  customFieldsText: z.string().optional(),
  notes: z.string().optional(),
});

type VenueFormValues = z.infer<typeof VenueFormSchema>;

function customFieldsToText(fields: Array<{ key: string; value?: string }>): string {
  return fields.map((field) => `${field.key}: ${field.value ?? ""}`.trim()).join("\n");
}

function textToCustomFields(value: string | undefined): Array<{ key: string; value: string }> {
  if (!value) return [];
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [keyPart, ...valueParts] = line.split(":");
      return {
        key: keyPart.trim(),
        value: valueParts.join(":").trim(),
      };
    })
    .filter((field) => field.key.length > 0);
}

function CustomFieldsEditor({
  fields,
  onChange,
}: {
  fields: Array<{ key: string; value: string }>;
  onChange: (fields: Array<{ key: string; value: string }>) => void;
}) {
  return (
    <div className="mt-2 space-y-2 rounded-md border border-white/10 bg-white/[0.02] p-2">
      {fields.map((field, index) => (
        <div key={`${index}-${field.key}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Input
            value={field.key}
            onChange={(e) => {
              const next = [...fields];
              next[index] = { ...next[index], key: e.target.value };
              onChange(next);
            }}
            placeholder="Field name"
            className="bg-white/5 border-white/10 text-white h-8 text-sm focus:border-white/30"
          />
          <Input
            value={field.value}
            onChange={(e) => {
              const next = [...fields];
              next[index] = { ...next[index], value: e.target.value };
              onChange(next);
            }}
            placeholder="Value"
            className="bg-white/5 border-white/10 text-white h-8 text-sm focus:border-white/30"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/40 hover:text-red-400"
            onClick={() => onChange(fields.filter((_, i) => i !== index))}
          >
            <Trash2 size={12} />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...fields, { key: "", value: "" }])}
        className="h-8 border-white/10 bg-white/5 text-white/70 hover:text-white"
      >
        <Plus size={12} className="mr-1" /> Add custom field
      </Button>
    </div>
  );
}

function AddressInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [predictions, setPredictions] = useState<Array<{ placeId: string; description: string }>>([]);
  const [open, setOpen] = useState(false);

  async function searchAddresses(query: string) {
    if (query.trim().length < 3) {
      setPredictions([]);
      return;
    }
    try {
      const results = await api.get<Array<{ placeId: string; description: string }>>(
        `/api/venues/address-search?q=${encodeURIComponent(query)}`
      );
      setPredictions(results);
      setOpen(true);
    } catch {
      setPredictions([]);
    }
  }

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
          searchAddresses(next);
        }}
        placeholder="Address (Google search enabled)"
        className="bg-white/5 border-white/10 text-white h-8 text-sm placeholder:text-white/25 focus:border-white/30"
      />
      {open && predictions.length > 0 ? (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-white/10 bg-[#16161f] shadow-lg overflow-hidden">
          {predictions.slice(0, 6).map((prediction) => (
            <button
              key={prediction.placeId}
              type="button"
              onClick={() => {
                onChange(prediction.description);
                setOpen(false);
              }}
              className="w-full px-2 py-1.5 text-left text-xs text-white/80 hover:bg-white/10"
            >
              {prediction.description}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);

  const form = useForm<VenueFormValues>({
    resolver: zodResolver(VenueFormSchema),
    values: {
      name: venue.name,
      address: venue.address ?? "",
      capacity: venue.capacity ?? "",
      width: venue.width ?? "",
      length: venue.length ?? "",
      height: venue.height ?? "",
      customFieldsText: customFieldsToText(venue.customFields ?? []),
      notes: venue.notes ?? "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: VenueFormValues) => {
      const payload = {
        name: data.name,
        address: data.address || undefined,
        capacity: data.capacity === "" ? undefined : Number(data.capacity),
        width: data.width?.trim() || undefined,
        length: data.length?.trim() || undefined,
        height: data.height?.trim() || undefined,
        customFields: textToCustomFields(data.customFieldsText),
        notes: data.notes || undefined,
      };
      return api.put(`/api/venues/${venue.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["venues"] });
      setEditing(false);
    },
    onError: (error: Error) => {
      toast({ title: "Could not save venue", description: error.message, variant: "destructive" });
    },
  });

  if (editing) {
    return (
      <tr className="border-b border-white/5">
        <td className="px-5 py-3">
          <Input
            {...form.register("name")}
            className="bg-white/5 border-white/10 text-white h-8 text-sm focus:border-white/30"
          />
        </td>
        <td className="px-5 py-3 hidden sm:table-cell">
          <AddressInput
            value={form.watch("address") ?? ""}
            onChange={(value) => form.setValue("address", value)}
          />
        </td>
        <td className="px-5 py-3 hidden md:table-cell">
          <div className="grid grid-cols-2 gap-2 max-w-[220px]">
            <Input
              {...form.register("width")}
              placeholder="Width"
              className="bg-white/5 border-white/10 text-white h-8 text-sm focus:border-white/30"
            />
            <Input
              {...form.register("length")}
              placeholder="Length"
              className="bg-white/5 border-white/10 text-white h-8 text-sm focus:border-white/30"
            />
            <Input
              {...form.register("height")}
              placeholder="Height"
              className="bg-white/5 border-white/10 text-white h-8 text-sm focus:border-white/30"
            />
            <Input
              {...form.register("capacity")}
              type="number"
              min={0}
              placeholder="Capacity"
              className="bg-white/5 border-white/10 text-white h-8 text-sm focus:border-white/30"
            />
          </div>
          <Input
            {...form.register("notes")}
            placeholder="Notes"
            className="mt-2 bg-white/5 border-white/10 text-white h-8 text-sm focus:border-white/30"
          />
          <Textarea
            {...form.register("customFieldsText")}
            className="hidden"
          />
          <CustomFieldsEditor
            fields={textToCustomFields(form.watch("customFieldsText"))}
            onChange={(fields) => form.setValue("customFieldsText", customFieldsToText(fields))}
          />
        </td>
        <td className="px-5 py-3">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-emerald-400 hover:text-emerald-300"
              onClick={form.handleSubmit((v) => updateMutation.mutate(v))}
              disabled={updateMutation.isPending || !canWrite}
            >
              <Check size={13} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white/30 hover:text-white"
              onClick={() => setEditing(false)}
            >
              <X size={13} />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-white/5 group hover:bg-white/[0.02] transition-colors">
      <td className="px-5 py-3.5 text-sm font-medium text-white/90">{venue.name}</td>
      <td className="px-5 py-3.5 text-sm text-white/50 hidden sm:table-cell">{venue.address ?? "—"}</td>
      <td className="px-5 py-3.5 text-sm text-white/50 hidden md:table-cell">
        <div>{venue.capacity != null ? venue.capacity.toLocaleString() : "—"}</div>
        <div className="text-[11px] text-white/30">
          W {venue.width ?? "—"} · L {venue.length ?? "—"} · H {venue.height ?? "—"}
        </div>
        {venue.notes ? <div className="text-[11px] text-white/30 truncate max-w-56">{venue.notes}</div> : null}
        {(venue.customFields ?? []).length > 0 ? (
          <div className="text-[11px] text-white/30 truncate max-w-56">
            {(venue.customFields ?? []).map((f) => `${f.key}: ${f.value}`).join(" · ")}
          </div>
        ) : null}
      </td>
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canWrite ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white/30 hover:text-white"
              onClick={() => setEditing(true)}
            >
              <Edit2 size={13} />
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
      </td>
    </tr>
  );
}

function AddVenueForm({ onSuccess, canWrite }: { onSuccess: () => void; canWrite: boolean }) {
  const form = useForm<VenueFormValues>({
    resolver: zodResolver(VenueFormSchema),
    defaultValues: {
      name: "",
      address: "",
      capacity: "",
      width: "",
      length: "",
      height: "",
      customFieldsText: "",
      notes: "",
    },
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useMutation({
    mutationFn: (data: VenueFormValues) => {
      const payload = {
        name: data.name,
        address: data.address || undefined,
        capacity: data.capacity === "" ? undefined : Number(data.capacity),
        width: data.width?.trim() || undefined,
        length: data.length?.trim() || undefined,
        height: data.height?.trim() || undefined,
        customFields: textToCustomFields(data.customFieldsText),
        notes: data.notes || undefined,
      };
      return api.post<Venue>("/api/venues", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["venues"] });
      form.reset();
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
        <AddressInput
          value={form.watch("address") ?? ""}
          onChange={(value) => form.setValue("address", value)}
        />
      </td>
      <td className="px-5 py-3 hidden md:table-cell">
        <div className="grid grid-cols-2 gap-2 max-w-[220px]">
          <Input
            {...form.register("width")}
            placeholder="Width"
            className="bg-white/5 border-white/10 text-white h-8 text-sm placeholder:text-white/25 focus:border-white/30"
          />
          <Input
            {...form.register("length")}
            placeholder="Length"
            className="bg-white/5 border-white/10 text-white h-8 text-sm placeholder:text-white/25 focus:border-white/30"
          />
          <Input
            {...form.register("height")}
            placeholder="Height"
            className="bg-white/5 border-white/10 text-white h-8 text-sm placeholder:text-white/25 focus:border-white/30"
          />
          <Input
            {...form.register("capacity")}
            type="number"
            min={0}
            placeholder="Capacity"
            className="bg-white/5 border-white/10 text-white h-8 text-sm placeholder:text-white/25 focus:border-white/30"
          />
        </div>
        <Input
          {...form.register("notes")}
          placeholder="Notes"
          className="mt-2 bg-white/5 border-white/10 text-white h-8 text-sm placeholder:text-white/25 focus:border-white/30"
        />
        <Textarea
          {...form.register("customFieldsText")}
          className="hidden"
        />
        <CustomFieldsEditor
          fields={textToCustomFields(form.watch("customFieldsText"))}
          onChange={(fields) => form.setValue("customFieldsText", customFieldsToText(fields))}
        />
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
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
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
              <th className="px-5 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide hidden md:table-cell">Size &amp; capacity</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide w-20"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-5 py-8">
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full bg-white/5" />
                    ))}
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-red-400 text-sm">
                  Failed to load venues.
                </td>
              </tr>
            ) : (venues ?? []).length === 0 && !showAddForm ? (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-white/30 text-sm">
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
              onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
