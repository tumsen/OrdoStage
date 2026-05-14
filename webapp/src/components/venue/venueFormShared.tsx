import { z } from "zod";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import type { Venue } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Up to 999.99 with comma or dot decimals; optional trailing " m" (meters). */
export const VENUE_DIMENSION_VALUE_REGEX = /^(\d{1,3})([.,]\d{1,2})?(\s*[mM])?$/;

const dimensionHint = "Up to 999,99 m (e.g. 12,5 m)";

function optionalVenueDimension() {
  return z
    .string()
    .optional()
    .transform((s) => (s == null ? "" : s.trim()))
    .refine((s) => s === "" || VENUE_DIMENSION_VALUE_REGEX.test(s), dimensionHint);
}

export const VenueFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  addressStreet: z.string().optional(),
  addressNumber: z.string().optional(),
  addressZip: z.string().optional(),
  addressCity: z.string().optional(),
  addressState: z.string().optional(),
  addressCountry: z.string().optional(),
  capacity: z.union([z.literal(""), z.coerce.number().int().min(0)]),
  width: optionalVenueDimension(),
  length: optionalVenueDimension(),
  height: optionalVenueDimension(),
  contactPersonName: z.string().max(120).optional(),
  contactPersonEmail: z
    .string()
    .max(254)
    .optional()
    .refine(
      (v) => v == null || v.trim() === "" || z.string().email().safeParse(v.trim()).success,
      "Invalid email",
    ),
  contactPersonPhone: z.string().max(40).optional(),
  contactPersonRole: z.string().max(120).optional(),
  contactCompanyName: z.string().max(200).optional(),
  contactCompanyVat: z.string().max(64).optional(),
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
  contactPersonName: "",
  contactPersonEmail: "",
  contactPersonPhone: "",
  contactPersonRole: "",
  contactCompanyName: "",
  contactCompanyVat: "",
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
    contactPersonName: venue.contactPersonName ?? "",
    contactPersonEmail: venue.contactPersonEmail ?? "",
    contactPersonPhone: venue.contactPersonPhone ?? "",
    contactPersonRole: venue.contactPersonRole ?? "",
    contactCompanyName: venue.contactCompanyName ?? "",
    contactCompanyVat: venue.contactCompanyVat ?? "",
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
    contactPersonName: data.contactPersonName?.trim() || undefined,
    contactPersonEmail: data.contactPersonEmail?.trim() || undefined,
    contactPersonPhone: data.contactPersonPhone?.trim() || undefined,
    contactPersonRole: data.contactPersonRole?.trim() || undefined,
    contactCompanyName: data.contactCompanyName?.trim() || undefined,
    contactCompanyVat: data.contactCompanyVat?.trim() || undefined,
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

const dimInputClass =
  "bg-white/5 border-white/10 text-white h-9 text-sm focus:border-white/30 w-[9ch] min-w-0 font-mono tabular-nums tracking-tight";

export function StageSizeFields({
  register,
  errors,
}: {
  register: UseFormRegister<VenueFormValues>;
  errors?: FieldErrors<VenueFormValues>;
}) {
  const { t } = useI18n();
  const dimErrors = [errors?.width, errors?.length, errors?.height].filter((e) => e?.message);

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 md:p-5">
      <Label className="text-white/50 text-xs uppercase tracking-wide">Stage &amp; room size</Label>
      <p className="text-[11px] text-white/35 leading-snug">
        Values are in meters: up to <span className="text-white/50">999,99</span> per field (comma or dot). The unit{" "}
        <span className="text-white/50">m</span> is shown beside each box — you do not need to type it unless you want
        to.
      </p>
      <div className="flex flex-nowrap items-end gap-4 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
        <div className="shrink-0 space-y-1.5">
          <Label className="text-white/45 text-[10px] uppercase tracking-wide">{t("venueInfo.widthMetersLabel")}</Label>
          <div className="flex items-center gap-1.5">
            <Input
              {...register("width")}
              maxLength={10}
              inputMode="decimal"
              autoComplete="off"
              title={dimensionHint}
              className={dimInputClass}
            />
            <span className="select-none text-sm tabular-nums text-white/50" aria-hidden>
              m
            </span>
          </div>
        </div>
        <div className="shrink-0 space-y-1.5">
          <Label className="text-white/45 text-[10px] uppercase tracking-wide">{t("venueInfo.depthMetersLabel")}</Label>
          <div className="flex items-center gap-1.5">
            <Input
              {...register("length")}
              maxLength={10}
              inputMode="decimal"
              autoComplete="off"
              title={dimensionHint}
              className={dimInputClass}
            />
            <span className="select-none text-sm tabular-nums text-white/50" aria-hidden>
              m
            </span>
          </div>
        </div>
        <div className="shrink-0 space-y-1.5">
          <Label className="text-white/45 text-[10px] uppercase tracking-wide">{t("venueInfo.heightMetersLabel")}</Label>
          <div className="flex items-center gap-1.5">
            <Input
              {...register("height")}
              maxLength={10}
              inputMode="decimal"
              autoComplete="off"
              title={dimensionHint}
              className={dimInputClass}
            />
            <span className="select-none text-sm tabular-nums text-white/50" aria-hidden>
              m
            </span>
          </div>
        </div>
      </div>
      {dimErrors.length > 0 ? (
        <div className="space-y-0.5">
          {dimErrors.map((e, i) => (
            <p key={i} className="text-[11px] text-red-400/90">
              {String(e?.message)}
            </p>
          ))}
        </div>
      ) : null}
      <div className="space-y-1.5 pt-1">
        <Label className="text-white/45 text-[10px] uppercase tracking-wide">{t("venueInfo.audienceCapacityLabel")}</Label>
        <div className="flex items-center gap-1.5 max-w-[14rem]">
          <Input
            {...register("capacity")}
            type="number"
            min={0}
            placeholder="e.g. 500"
            className="max-w-[10rem] bg-white/5 border-white/10 text-white h-9 text-sm focus:border-white/30"
          />
          <span className="select-none text-sm tabular-nums text-white/50 shrink-0" aria-hidden>
            {t("venueInfo.capacityInputSuffix")}
          </span>
        </div>
      </div>
    </div>
  );
}

const contactInputClass = "bg-white/5 border-white/10 text-white h-9 text-sm focus:border-white/30";

export function VenueContactFields({
  register,
  errors,
}: {
  register: UseFormRegister<VenueFormValues>;
  errors?: FieldErrors<VenueFormValues>;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 md:p-5">
      <Label className="text-white/50 text-xs uppercase tracking-wide">Venue contact</Label>
      <p className="text-[11px] text-white/35 leading-snug">On-site or technical contact for this venue.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-white/45 text-[10px] uppercase tracking-wide">Company name</Label>
          <Input
            {...register("contactCompanyName")}
            maxLength={200}
            className={contactInputClass}
            placeholder="Legal or trading name"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-white/45 text-[10px] uppercase tracking-wide">VAT number</Label>
          <Input
            {...register("contactCompanyVat")}
            maxLength={64}
            className={contactInputClass}
            placeholder="e.g. DK12345678"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-white/45 text-[10px] uppercase tracking-wide">Name</Label>
          <Input {...register("contactPersonName")} maxLength={120} className={contactInputClass} placeholder="Name" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-white/45 text-[10px] uppercase tracking-wide">Role</Label>
          <Input
            {...register("contactPersonRole")}
            maxLength={120}
            className={contactInputClass}
            placeholder="e.g. Technical director"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-white/45 text-[10px] uppercase tracking-wide">Phone</Label>
          <Input
            {...register("contactPersonPhone")}
            maxLength={40}
            className={contactInputClass}
            placeholder="Phone"
            inputMode="tel"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-white/45 text-[10px] uppercase tracking-wide">Email</Label>
          <Input
            {...register("contactPersonEmail")}
            maxLength={254}
            type="email"
            className={contactInputClass}
            placeholder="email@example.com"
          />
          {errors?.contactPersonEmail?.message ? (
            <p className="text-[11px] text-red-400/90">{String(errors.contactPersonEmail.message)}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
