type FeatureSection = {
  heading: string;
  body?: string;
  bullets: readonly string[];
};

const TIME_TRACKING_HEADING = "Time tracking";

/** Role-specific time tracking copy — included on every role's feature spec. */
export function getTimeTrackingSection(roleSlug: string): FeatureSection {
  const byRole: Record<string, FeatureSection> = {
    "hr-manager": {
      heading: TIME_TRACKING_HEADING,
      body: "Connect your roster to the hours people actually work.",
      bullets: [
        "Staff and contractors log time against events, roles, and categories",
        "Reuse the same person record for staffing, invites, and time entries",
        "Support HR and finance with one trail from roster to reported hours",
      ],
    },
    producer: {
      heading: TIME_TRACKING_HEADING,
      body: "See labour against the productions you programme — not a separate timesheet tool.",
      bullets: [
        "Crew and staff log hours linked to events and shows in your season",
        "Compare activity across productions when reviewing run costs",
        "Keep artistic and operations aligned on who worked which show",
      ],
    },
    "production-manager": {
      heading: TIME_TRACKING_HEADING,
      body: "Track build and tech hours next to the production plan and event record.",
      bullets: [
        "Log time against productions, events, and staffing assignments",
        "Support retrospective costing after tech week and opening",
        "Give finance numbers tied to the work production actually coordinated",
      ],
    },
    "stage-manager": {
      heading: TIME_TRACKING_HEADING,
      body: "On busy show days, crew log hours where they belong — not on paper after load-out.",
      bullets: [
        "Let crew and staff log time against the event they are on",
        "Connect show-day work to the same schedule and staffing data you trust",
        "Reduce memory-based timesheets after a long run",
      ],
    },
    "tour-manager": {
      heading: TIME_TRACKING_HEADING,
      body: "Road crew hours stay linked to tour days and shows — city by city.",
      bullets: [
        "Log time against tour dates and performances on the road",
        "Support payroll and costing when the company moves every week",
        "Keep routing, staffing, and hours in one system instead of spreadsheets",
      ],
    },
    "head-of-stage": {
      heading: TIME_TRACKING_HEADING,
      body: "Technical and stage crew hours tie back to venues, events, and get-ins.",
      bullets: [
        "Log time against venue bookings and the events they support",
        "Track technical and stage labour for internal costing and reports",
        "Align crew hours with the room and show they worked",
      ],
    },
    accountant: {
      heading: TIME_TRACKING_HEADING,
      body: "Finance receives structured time data — not a folder of loose timesheets.",
      bullets: [
        "Collect entries from staff and crew linked to the work they did",
        "Run time reports for payroll prep and retrospective costing",
        "Export when finance needs to reconcile outside OrdoStage",
      ],
    },
  };

  return (
    byRole[roleSlug] ?? {
      heading: TIME_TRACKING_HEADING,
      body: "Organisations log hours against events, roles, and categories in one place.",
      bullets: [
        "Staff and crew enter time linked to the work they performed",
        "Managers and finance use reports and exports from the same data",
        "Reduce reliance on ad-hoc spreadsheets after closing night",
      ],
    }
  );
}

export function isTimeTrackingSection(heading: string): boolean {
  return /time\s*track|time\s*log/i.test(heading);
}
