import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { displayHex } from "@/lib/timeCatalogColors";
import type { TimeParentCategory } from "@/contracts/backendTypes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function TimeParentCategorySelect({
  value,
  onValueChange,
  disabled,
  allowEmpty = true,
  className,
}: {
  value: string | null | undefined;
  onValueChange: (id: string | null) => void;
  disabled?: boolean;
  allowEmpty?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const { data: categories } = useQuery({
    queryKey: ["time-parent-categories"],
    queryFn: () => api.get<TimeParentCategory[]>("/api/time/parent-categories"),
  });

  const selectValue = value || (allowEmpty ? "__none__" : "");

  return (
    <Select
      value={selectValue}
      onValueChange={(v) => onValueChange(v === "__none__" ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger className={className ?? "bg-white/5 border-white/10 text-white"}>
        <SelectValue placeholder={t("time.parentCategorySelectPlaceholder")} />
      </SelectTrigger>
      <SelectContent className="bg-[#16161f] border-white/10 text-white">
        {allowEmpty ? (
          <SelectItem value="__none__">{t("time.parentCategoryNone")}</SelectItem>
        ) : null}
        {(categories ?? []).map((cat) => (
          <SelectItem key={cat.id} value={cat.id}>
            <span className="flex items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full ring-1 ring-white/15"
                style={{ backgroundColor: displayHex(cat.color, cat.id) }}
                aria-hidden
              />
              {cat.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
