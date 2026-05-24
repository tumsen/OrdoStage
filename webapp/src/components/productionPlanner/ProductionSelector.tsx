import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Production } from "@/lib/types";
import { PRODUCTION_STATUS_LABELS } from "@/lib/productionPlannerTheme";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export function ProductionSelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["productions"],
    queryFn: () => api.get<Production[]>("/api/productions"),
  });

  const productions = data ?? [];

  if (isLoading) {
    return <Skeleton className="h-9 w-[min(100%,280px)] rounded-lg bg-white/5" />;
  }

  if (productions.length === 0) {
    return (
      <p className="text-xs text-white/45 py-2">No productions yet — create one to start planning.</p>
    );
  }

  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[min(100%,320px)] bg-white/5 border-white/10 text-white text-sm">
        <SelectValue placeholder="Select production" />
      </SelectTrigger>
      <SelectContent className="bg-[#16161f] border-white/10 max-h-[280px]">
        {productions.map((p) => (
          <SelectItem key={p.id} value={p.id} className="text-sm">
            <span className="truncate">{p.name}</span>
            {p.premiereDate ? (
              <span className="text-white/40 ml-2 text-xs tabular-nums">
                premiere {p.premiereDate.slice(0, 10)}
              </span>
            ) : (
              <span className="text-white/35 ml-2 text-xs">
                {PRODUCTION_STATUS_LABELS[p.status] ?? p.status}
              </span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
