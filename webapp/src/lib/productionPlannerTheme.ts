import type { ProductionCostCategory, ProductionPlannerTask } from "@/lib/types";

export const TASK_CATEGORY_COLORS: Record<
  ProductionPlannerTask["category"],
  { bar: string; border: string; text: string }
> = {
  production_window: {
    bar: "bg-violet-500/35",
    border: "border-violet-400/50",
    text: "text-violet-200",
  },
  get_in: { bar: "bg-amber-500/40", border: "border-amber-400/55", text: "text-amber-100" },
  get_out: { bar: "bg-orange-500/35", border: "border-orange-400/50", text: "text-orange-100" },
  rehearsal: { bar: "bg-sky-500/40", border: "border-sky-400/55", text: "text-sky-100" },
  soundcheck: { bar: "bg-cyan-500/35", border: "border-cyan-400/50", text: "text-cyan-100" },
  performance: { bar: "bg-red-600/50", border: "border-red-400/60", text: "text-red-50" },
  travel: { bar: "bg-emerald-600/35", border: "border-emerald-400/50", text: "text-emerald-100" },
  day_off: { bar: "bg-white/10", border: "border-white/25", text: "text-white/50" },
  job: { bar: "bg-indigo-500/40", border: "border-indigo-400/55", text: "text-indigo-100" },
  custom: { bar: "bg-fuchsia-500/35", border: "border-fuchsia-400/50", text: "text-fuchsia-100" },
  cost: { bar: "bg-yellow-500/45", border: "border-yellow-300/60", text: "text-yellow-50" },
};

export const COST_CATEGORY_COLORS: Record<ProductionCostCategory, string> = {
  labor: "text-sky-300",
  venue: "text-violet-300",
  equipment: "text-orange-300",
  travel: "text-emerald-300",
  marketing: "text-pink-300",
  rights: "text-amber-300",
  contingency: "text-white/60",
  revenue: "text-green-300",
  other: "text-white/50",
};

export const COST_CATEGORY_LABELS: Record<ProductionCostCategory, string> = {
  labor: "Labor",
  venue: "Venue",
  equipment: "Equipment",
  travel: "Travel",
  marketing: "Marketing",
  rights: "Rights & licenses",
  contingency: "Contingency",
  revenue: "Revenue",
  other: "Other",
};
