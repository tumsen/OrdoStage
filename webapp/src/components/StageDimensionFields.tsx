import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Matches Event detail / venue edit dimension panels. */
export const DETAIL_FIELD_LABEL_CLASS = "text-white/50 text-xs uppercase tracking-wide";
export const DETAIL_IN_CARD_FIELD_LABEL_CLASS = "block text-xs font-normal text-white/40 mb-1";
export const DETAIL_CARD_CLASS =
  "flex min-h-0 flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-5 md:p-6";

const STAGE_DIM_ROWS = [
  { label: "Width", key: "stageWidth" as const },
  { label: "Depth", key: "stageDepth" as const },
  { label: "Height", key: "stageHeight" as const },
];

export type StageDimensionKey = (typeof STAGE_DIM_ROWS)[number]["key"];

export type StageDimensionValues = Record<StageDimensionKey, string>;

type StageDimensionFieldsProps = {
  values: StageDimensionValues;
  onChange: (key: StageDimensionKey, value: string) => void;
  disabled?: boolean;
  className?: string;
  /** Section title above the row (Event detail uses "Technical"). */
  sectionTitle?: string;
};

export function StageDimensionFields({
  values,
  onChange,
  disabled,
  className,
  sectionTitle = "Technical",
}: StageDimensionFieldsProps) {
  return (
    <div className={cn(DETAIL_CARD_CLASS, "gap-4", className)}>
      <Label className={cn(DETAIL_FIELD_LABEL_CLASS, "block")}>{sectionTitle}</Label>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-4">
        {STAGE_DIM_ROWS.map((row) => (
          <div key={row.key} className="shrink-0 space-y-1.5 w-[5.75rem]">
            <Label htmlFor={`stage-${row.key}`} className={DETAIL_IN_CARD_FIELD_LABEL_CLASS}>
              {row.label}
            </Label>
            <div className="flex items-center gap-1.5">
              <Input
                id={`stage-${row.key}`}
                value={values[row.key]}
                onChange={(e) => onChange(row.key, e.target.value)}
                disabled={disabled}
                inputMode="decimal"
                maxLength={7}
                placeholder="0"
                autoComplete="off"
                aria-label={`Stage ${row.label.toLowerCase()} (m)`}
                className="h-9 w-[4.5rem] min-w-[4.5rem] bg-white/5 border-white/10 text-white tabular-nums text-sm"
              />
              <span className="text-[10px] text-white/35 shrink-0">m</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
