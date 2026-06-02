import { UserRound } from "lucide-react";

type PeopleCountGraphicProps = {
  count: number;
  label: string;
};

export function PeopleCountGraphic({ count, label }: PeopleCountGraphicProps) {
  const safeCount = Math.max(0, count);
  const shown = Math.min(safeCount, 8);
  const extra = safeCount - shown;

  return (
    <div className="rounded-md border border-white/10 bg-white/5 p-3">
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <div className="mt-2 flex items-center gap-1 text-white/80">
        {Array.from({ length: shown }).map((_, i) => (
          <UserRound key={`${label}-${i}`} className="h-4 w-4" />
        ))}
        {extra > 0 ? <span className="ml-1 text-xs text-white/60">+{extra}</span> : null}
      </div>
      <p className="mt-1 text-sm font-medium text-white">{safeCount}</p>
    </div>
  );
}

type PersonChipProps = {
  name: string;
  roleLabel: string;
};

export function PersonChip({ name, roleLabel }: PersonChipProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/60">
        <UserRound className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm text-white/90">{name || "Unnamed"}</p>
        <p className="text-[10px] uppercase tracking-wide text-white/45">{roleLabel}</p>
      </div>
    </div>
  );
}
