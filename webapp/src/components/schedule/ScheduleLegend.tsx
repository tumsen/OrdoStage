import { ITEM_COLORS } from "./scheduleUtils";

const LEGEND_ITEMS = [
  { label: "Event", colorKey: "event" },
  { label: "Rehearsal", colorKey: "rehearsal" },
  { label: "Maintenance", colorKey: "maintenance" },
  { label: "Private", colorKey: "private" },
  { label: "Other booking", colorKey: "other" },
];

export function ScheduleLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {LEGEND_ITEMS.map(({ label, colorKey }) => (
        <div key={colorKey} className="flex items-center gap-1.5">
          <span
            className={`inline-block w-3 h-3 rounded-sm ${ITEM_COLORS[colorKey]}`}
          />
          <span className="text-xs text-white/40">{label}</span>
        </div>
      ))}
    </div>
  );
}
