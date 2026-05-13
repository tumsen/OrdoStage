import { z } from "zod";
import type { UseFormRegister } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import type { Venue } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const VenueFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  addressStreet: z.string().optional(),
  addressNumber: z.string().optional(),
  addressZip: z.string().optional(),
  addressCity: z.string().optional(),
  addressState: z.string().optional(),
  addressCountry: z.string().optional(),
  capacity: z.union([z.literal(""), z.coerce.number().int().min(0)]),
  width: z.string().optional(),
  length: z.string().optional(),
  height: z.string().optional(),
  customFieldsText: z.string().optional(),
  notes: z.string().optional(),
});

export type VenueFormValues = z.infer<typeof VenueFormSchema>;

export const DEFAULT_VENUE_FORM_VALUES: VenueFormValues = {
  name: "",
  addressStreet: "",
  addressNumber: "",
  addressZip: "",
  addressCity: "",
  addressState: "",
  addressCountry: "",
  capacity: "",
  width: "",
  length: "",
  height: "",
  customFieldsText: "",
  notes: "",
};

export function customFieldsToText(fields: Array<{ key: string; value?: string }>): string {
  return fields.map((field) => `${field.key}: ${field.value ?? ""}`.trim()).join("\n");
}

export function textToCustomFields(value: string | undefined): Array<{ key: string; value: string }> {
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

export function venueToFormValues(venue: Venue): VenueFormValues {
  return {
    name: venue.name,
    addressStreet: venue.addressStreet ?? "",
    addressNumber: venue.addressNumber ?? "",
    addressZip: venue.addressZip ?? "",
    addressCity: venue.addressCity ?? "",
    addressState: venue.addressState ?? "",
    addressCountry: venue.addressCountry ?? "",
    capacity: venue.capacity ?? "",
    width: venue.width ?? "",
    length: venue.length ?? "",
    height: venue.height ?? "",
    customFieldsText: customFieldsToText(venue.customFields ?? []),
    notes: venue.notes ?? "",
  };
}

export function venueFormValuesToPayload(data: VenueFormValues) {
  return {
    name: data.name,
    addressStreet: data.addressStreet || undefined,
    addressNumber: data.addressNumber || undefined,
    addressZip: data.addressZip || undefined,
    addressCity: data.addressCity || undefined,
    addressState: data.addressState || undefined,
    addressCountry: data.addressCountry || undefined,
    capacity: data.capacity === "" ? undefined : Number(data.capacity),
    width: data.width?.trim() || undefined,
    length: data.length?.trim() || undefined,
    height: data.height?.trim() || undefined,
    customFields: textToCustomFields(data.customFieldsText),
    notes: data.notes || undefined,
  };
}

export function CustomFieldsEditor({
  fields,
  onChange,
}: {
  fields: Array<{ key: string; value: string }>;
  onChange: (fields: Array<{ key: string; value: string }>) => void;
}) {
  return (
    <div className="space-y-2">
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

export function StageSizeFields({ register }: { register: UseFormRegister<VenueFormValues> }) {
  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 md:p-5">
      <Label className="text-white/50 text-xs uppercase tracking-wide">Stage &amp; room size</Label>
      <p className="text-[11px] text-white/35 leading-snug">
        Interior dimensions; include units if helpful (e.g. 12&nbsp;m).
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-white/45 text-[10px] uppercase tracking-wide">Width</Label>
          <Input
            {...register("width")}
            placeholder="e.g. 14 m"
            className="bg-white/5 border-white/10 text-white h-9 text-sm focus:border-white/30"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-white/45 text-[10px] uppercase tracking-wide">Length</Label>
          <Input
            {...register("length")}
            placeholder="e.g. 20 m"
            className="bg-white/5 border-white/10 text-white h-9 text-sm focus:border-white/30"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-white/45 text-[10px] uppercase tracking-wide">Height</Label>
          <Input
            {...register("height")}
            placeholder="e.g. 8 m"
            className="bg-white/5 border-white/10 text-white h-9 text-sm focus:border-white/30"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-white/45 text-[10px] uppercase tracking-wide">Audience capacity</Label>
          <Input
            {...register("capacity")}
            type="number"
            min={0}
            placeholder="e.g. 500"
            className="bg-white/5 border-white/10 text-white h-9 text-sm focus:border-white/30"
          />
        </div>
      </div>
    </div>
  );
}
