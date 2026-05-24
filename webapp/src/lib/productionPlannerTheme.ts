import type { ProductionCostCategory } from "@/lib/types";

export const TASK_CATEGORY_COLORS: Record<
  string,
  { bar: string; border: string; text: string }
> = {
  planning_window: {
    bar: "bg-violet-500/30",
    border: "border-violet-400/45",
    text: "text-violet-200",
  },
  set_build: {
    bar: "bg-amber-500/40",
    border: "border-amber-400/55",
    text: "text-amber-100",
  },
  costume: {
    bar: "bg-pink-500/35",
    border: "border-pink-400/50",
    text: "text-pink-100",
  },
  props: {
    bar: "bg-orange-500/35",
    border: "border-orange-400/50",
    text: "text-orange-100",
  },
  design: {
    bar: "bg-fuchsia-500/35",
    border: "border-fuchsia-400/50",
    text: "text-fuchsia-100",
  },
  rehearsal: {
    bar: "bg-sky-500/40",
    border: "border-sky-400/55",
    text: "text-sky-100",
  },
  tech: {
    bar: "bg-cyan-500/35",
    border: "border-cyan-400/50",
    text: "text-cyan-100",
  },
  marketing: {
    bar: "bg-rose-500/35",
    border: "border-rose-400/50",
    text: "text-rose-100",
  },
  deadline: {
    bar: "bg-red-600/45",
    border: "border-red-400/60",
    text: "text-red-50",
  },
  premiere: {
    bar: "bg-red-700/55",
    border: "border-red-300/70",
    text: "text-red-50",
  },
  other: {
    bar: "bg-indigo-500/35",
    border: "border-indigo-400/50",
    text: "text-indigo-100",
  },
  cost: {
    bar: "bg-yellow-500/45",
    border: "border-yellow-300/60",
    text: "text-yellow-50",
  },
};

export const TASK_CATEGORY_LABELS: Record<string, string> = {
  planning_window: "Production period",
  set_build: "Set build",
  costume: "Costume",
  props: "Props",
  design: "Design",
  rehearsal: "Rehearsal",
  tech: "Tech week",
  marketing: "Marketing",
  deadline: "Deadline",
  premiere: "Premiere",
  other: "Other",
  cost: "Budget line",
};

export const PRODUCTION_STATUS_LABELS: Record<string, string> = {
  planning: "Planning",
  in_progress: "In progress",
  rehearsal: "Rehearsal",
  tech: "Tech",
  preview: "Preview",
  premiered: "Premiered",
  on_tour: "On tour",
  closed: "Closed",
};

export const CRITICAL_PATH_BAR_CLASS = "ring-2 ring-red-400/75 border-red-300/80";

export const CRITICAL_PATH_LEGEND = {
  bar: "bg-red-600/40",
  border: "border-red-400/70",
};

export function taskCategoryColors(category: string) {
  return (
    TASK_CATEGORY_COLORS[category] ?? {
      bar: "bg-white/15",
      border: "border-white/25",
      text: "text-white/70",
    }
  );
}

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
