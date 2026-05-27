import { getTimeTrackingSection, isTimeTrackingSection } from "@/lib/roleTimeTrackingSections";

export type PublicRoleFeatureSection = {
  heading: string;
  body?: string;
  bullets: readonly string[];
};

export type PublicRoleFeature = {
  slug: string;
  title: string;
  intro: string;
  heroLead: string;
  sections: readonly PublicRoleFeatureSection[];
  relatedSlugs: readonly string[];
};

function withTimeTrackingSection(role: PublicRoleFeature): PublicRoleFeature {
  const withoutTime = role.sections.filter((s) => !isTimeTrackingSection(s.heading));
  const billingIdx = withoutTime.findIndex((s) => s.heading === "Plans & billing");
  const timeSection = getTimeTrackingSection(role.slug);
  if (billingIdx >= 0) {
    return {
      ...role,
      sections: [...withoutTime.slice(0, billingIdx), timeSection, ...withoutTime.slice(billingIdx)],
    };
  }
  return { ...role, sections: [...withoutTime, timeSection] };
}

const RAW_PUBLIC_ROLE_FEATURES: PublicRoleFeature[] = [
  {
    slug: "hr-manager",
    title: "HR Manager",
    intro: "Keep your roster accurate and your people onboarded without chasing spreadsheets.",
    heroLead:
      "OrdoStage gives HR and people operations a single roster that production, staffing, and permissions all pull from — so you onboard someone once and every department works from the same record.",
    sections: [
      {
        heading: "People roster",
        body: "One place for names, photos, contact details, and employment context.",
        bullets: [
          "Maintain profiles your whole organisation can find and reuse",
          "Attach photos so crew and office staff recognise people on show day",
          "Link people to departments and teams that match your structure",
        ],
      },
      {
        heading: "Teams & departments",
        bullets: [
          "Mirror how your house or tour is organised — not a generic org chart",
          "Group people for staffing views and internal communication",
          "Keep team membership in sync when people move roles mid-season",
        ],
      },
      {
        heading: "Invites & onboarding",
        bullets: [
          "Invite new members by email and assign them to the right org",
          "Reuse the same person record across events, staffing, and time tracking",
          "Reduce duplicate entries when someone works on multiple productions",
        ],
      },
      {
        heading: "Permission groups",
        bullets: [
          "Align access with permission groups so each department sees what they need",
          "Grant view or write access by area — volunteers, contractors, and staff included",
          "Support trust boundaries without maintaining separate tools per department",
        ],
      },
    ],
    relatedSlugs: ["production-manager", "accountant", "producer"],
  },
  {
    slug: "producer",
    title: "Producer",
    intro: "Program the season and keep artistic planning tied to real dates and venues.",
    heroLead:
      "From first hold to opening night, producers need programming decisions tied to real calendar data — not a parallel spreadsheet that drifts out of date. OrdoStage keeps events, venues, and schedules in one live picture.",
    sections: [
      {
        heading: "Events & programming",
        bullets: [
          "Run your season or one-off specials with shows, rehearsals, and notes in one record",
          "Track status from programming conversation through tech week",
          "Link events to venues so artistic and operations agree on what is booked where",
        ],
      },
      {
        heading: "Schedule & holds",
        bullets: [
          "See holds, get-ins, and venue availability on a shared calendar",
          "Filter week and month views across events, rehearsals, tours, and venue bookings",
          "Spot conflicts before they become crises in tech week",
        ],
      },
      {
        heading: "Shared calendars",
        bullets: [
          "Publish calendars when partners need a read-only view without full access",
          "Export or share when external stakeholders live in Outlook or Google",
          "Keep OrdoStage as the source of truth while still coordinating outward",
        ],
      },
      {
        heading: "Season overview",
        body: "See the whole programming picture — not just the next show.",
        bullets: [
          "Dashboard and list views for upcoming events across your organisation",
          "Connect touring dates with home-venue programming when both apply",
          "Fewer “did you see the update?” moments before load-in",
        ],
      },
    ],
    relatedSlugs: ["production-manager", "stage-manager", "tour-manager"],
  },
  {
    slug: "production-manager",
    title: "Production Manager",
    intro: "Coordinate deadlines, documents, and crew requirements across the whole production.",
    heroLead:
      "Production managers juggle phases, documents, staffing, and calendars at once. OrdoStage ties production planning to the same events and schedule your stage management team relies on — so nothing ships on an outdated version.",
    sections: [
      {
        heading: "Production planner",
        bullets: [
          "Plan phases and tasks with costs and notes on a production timeline",
          "Track build and tech milestones alongside the event they support",
          "Open task detail for phase context without leaving the production record",
        ],
      },
      {
        heading: "Event production documents",
        bullets: [
          "Keep production documents and details next to the event they belong to",
          "Reduce email chains of PDFs with different filenames and dates",
          "Give stage management and technical teams one place to look before call time",
        ],
      },
      {
        heading: "Staffing requirements",
        bullets: [
          "Line up requirements and assignments for each show",
          "Use staffing views built around how performance organisations actually staff",
          "Connect roster data to the people HR already maintains",
        ],
      },
      {
        heading: "Cross-calendar coordination",
        bullets: [
          "Filter the schedule across events, tours, rehearsals, and venue bookings",
          "See get-ins and production deadlines in the same view as artistic holds",
          "Coordinate with tour routing when a production leaves the building",
        ],
      },
    ],
    relatedSlugs: ["producer", "stage-manager", "head-of-stage"],
  },
  {
    slug: "stage-manager",
    title: "Stage Manager",
    intro: "Trust the schedule and staffing picture on show day — not a thread of outdated messages.",
    heroLead:
      "On show day, stage managers need the current schedule, staffing, and notes — not a screenshot from yesterday. OrdoStage gives you the same live data the office uses, filtered to what matters at call time.",
    sections: [
      {
        heading: "Show-day schedule",
        bullets: [
          "See get-ins, rehearsals, and performances in one filterable calendar",
          "Week and month views combine events, venue bookings, and tour dates",
          "Filter to what your run needs without digging through unrelated bookings",
        ],
      },
      {
        heading: "Event staffing",
        bullets: [
          "Review show staffing and assignments from the same data the office uses",
          "Line up requirements and confirmed assignments per event",
          "Fewer last-minute calls because someone worked from an old list",
        ],
      },
      {
        heading: "Notes & handovers",
        bullets: [
          "Open event records with notes and links your crew can rely on at call time",
          "Keep production context attached to the show — not scattered in chat",
          "Support smooth handovers between rehearsal, tech, and performance phases",
        ],
      },
    ],
    relatedSlugs: ["production-manager", "producer", "head-of-stage"],
  },
  {
    slug: "tour-manager",
    title: "Tour Manager",
    intro: "Route the tour and keep every city, day, and local pack aligned.",
    heroLead:
      "Touring adds cities, trucks, and local production teams to every decision. OrdoStage structures tours with days and shows, generates tech packs from tour data, and shares schedules when partners need a link — not a login to your whole org.",
    sections: [
      {
        heading: "Tour structure",
        bullets: [
          "Structure tours with days, cities, and shows so routing stays legible",
          "See production deadlines alongside travel and performance dates",
          "Keep tour detail accessible to production without re-keying into spreadsheets",
        ],
      },
      {
        heading: "Tech riders",
        bullets: [
          "Generate and share venue tech riders from tour data for local production teams",
          "Fewer “which version is this?” moments when the truck rolls in",
          "Give front-of-house and local crew the same pack your home team approved",
        ],
      },
      {
        heading: "Public tour links",
        bullets: [
          "Share public or personal tour schedules when artists and partners need a link",
          "Read-only access without giving up control of your whole organisation",
          "Update once in OrdoStage — everyone with the link sees current dates",
        ],
      },
      {
        heading: "Routing vs venue dates",
        bullets: [
          "Coordinate tour dates alongside venue bookings and production deadlines",
          "Align home-venue holds with road dates when a show both tours and resides",
          "One calendar picture for routing decisions — not three tools that disagree",
        ],
      },
    ],
    relatedSlugs: ["head-of-stage", "production-manager", "producer"],
  },
  {
    slug: "head-of-stage",
    title: "Head of Stage",
    intro: "Own venue specs, room inventory, and technical information where bookings live.",
    heroLead:
      "Technical departments live in specs, files, and room availability. OrdoStage keeps venue inventory, documents, and booking calendars together — so artistic programming and stage operations agree on what is possible when.",
    sections: [
      {
        heading: "Venue inventory",
        bullets: [
          "Maintain every stage, hall, and studio in a single inventory",
          "Attach documents and thumbnails to the venue they describe",
          "Support multi-venue organisations and presenting houses with many rooms",
        ],
      },
      {
        heading: "Specs & files",
        bullets: [
          "Keep specs and files next to the room — not lost in email attachments",
          "Reduce re-sending the same PDF when a tour arrives in a new city",
          "Give production and visiting crews one authoritative source per venue",
        ],
      },
      {
        heading: "Venue booking calendar",
        bullets: [
          "Use venue booking calendars so artistic and operations agree on what is possible",
          "See holds, get-ins, and maintenance next to the room they affect",
          "Support internal bookings separate from public-facing event programming",
        ],
      },
      {
        heading: "Touring tech packs",
        bullets: [
          "Support touring shows with consistent tech information at each stop",
          "Generate riders from tour data so local teams get what they need",
          "Align visiting production requirements with your venue’s actual inventory",
        ],
      },
    ],
    relatedSlugs: ["tour-manager", "stage-manager", "production-manager"],
  },
  {
    slug: "accountant",
    title: "Accountant",
    intro: "Turn crew hours and company details into numbers finance can work with.",
    heroLead:
      "Finance needs hours, exports, and company details in one place — not a folder of timesheets after closing night. OrdoStage connects time tracking to the work crew actually did and keeps billing context in the organisation account.",
    sections: [
      {
        heading: "Reports & exports",
        bullets: [
          "Run time reports for payroll prep and retrospective costing",
          "Export data when finance needs to reconcile outside OrdoStage",
          "Keep managers and finance aligned on the same numbers",
        ],
      },
      {
        heading: "Company account details",
        bullets: [
          "Store company and invoice details in the organisation account",
          "Keep billing contact and legal entity information where owners expect it",
          "Support org-level settings finance needs for invoicing",
        ],
      },
      {
        heading: "Plans & billing",
        body: "Owners choose Flex (monthly postpaid) or Yearly (committed seats) — see pricing for seat tiers and plan comparison.",
        bullets: [
          "Flex scales with active billable members month to month",
          "Yearly offers committed seat pricing for stable teams",
          "Billing is managed by organisation owners in Account",
        ],
      },
    ],
    relatedSlugs: ["hr-manager", "stage-manager", "production-manager"],
  },
];

export const PUBLIC_ROLE_FEATURES: readonly PublicRoleFeature[] =
  RAW_PUBLIC_ROLE_FEATURES.map(withTimeTrackingSection);

const SLUG_SET = new Set(PUBLIC_ROLE_FEATURES.map((r) => r.slug));

export function isPublicRoleSlug(slug: string | undefined): slug is string {
  return slug != null && SLUG_SET.has(slug);
}

export function getRoleBySlug(slug: string): PublicRoleFeature | undefined {
  return PUBLIC_ROLE_FEATURES.find((r) => r.slug === slug);
}
