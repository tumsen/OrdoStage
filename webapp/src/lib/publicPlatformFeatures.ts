import type { OrdoAccent } from "@/lib/roleAccentStyles";

export type PlatformFeatureHighlight = {
  title: string;
  description: string;
  accent: OrdoAccent;
};

/** Cross-role capabilities shown on the full Features page. */
export const PLATFORM_FEATURE_HIGHLIGHTS: readonly PlatformFeatureHighlight[] = [
  {
    title: "Events & productions",
    description: "Season programming, shows, rehearsals, and notes in one record.",
    accent: "magenta",
  },
  {
    title: "Schedule & venue bookings",
    description: "Week and month views for holds, get-ins, tours, and maintenance.",
    accent: "orange",
  },
  {
    title: "Venues & tech packs",
    description: "Room inventory, specs, files, and venue booking calendars.",
    accent: "violet",
  },
  {
    title: "Tours & riders",
    description: "Routing, tour days, tech riders, and shared tour schedules.",
    accent: "blue",
  },
  {
    title: "Staffing & people",
    description: "Roster, teams, show jobs, and permission groups.",
    accent: "magenta",
  },
  {
    title: "Time tracking",
    description: "Crew and staff log hours on events and roles; reports and exports for finance.",
    accent: "yellow",
  },
  {
    title: "Shared calendars",
    description: "Publish or export when partners need a read-only view.",
    accent: "blue",
  },
  {
    title: "Production planner",
    description: "Phases, tasks, costs, and documents tied to each production.",
    accent: "orange",
  },
] as const;
