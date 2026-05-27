import type { OrdoAccent } from "@/lib/roleAccentStyles";

export type PlatformFeatureArea = {
  title: string;
  summary: string;
  body: string;
  bullets: readonly string[];
  accent: OrdoAccent;
};

/** Detailed capability list for the homepage “all functions” section below role tabs. */
export const PLATFORM_FEATURE_AREAS: readonly PlatformFeatureArea[] = [
  {
    title: "Events & productions",
    summary: "Programme the season and keep every show, rehearsal, and note in one live record.",
    accent: "magenta",
    body:
      "Events are the centre of OrdoStage. Each production gets a durable record that artistic, production, and stage teams open from first conversation through load-out — with shows, documents, staffing, and venue context attached instead of scattered files.",
    bullets: [
      "Create and edit events with title, status, dates, venue links, and free-form notes",
      "Manage multiple shows per event — performances, rehearsals, get-ins, and special calls",
      "Track show timing with start, end, and duration fields that stay consistent across views",
      "Attach production documents and downloads next to the event they belong to",
      "Use custom fields and contacts on the event record for partners, agents, and co-producers",
      "Link events to venues so programming and operations agree on which room is booked",
      "Open dedicated tabs for details, shows, venue booking, teams, and people on one page",
      "See staffing summaries per show and per department before call time",
      "Navigate from the events list or dashboard to what is on next in your organisation",
      "Reduce duplicate data entry when the same production appears on tour and at home",
    ],
  },
  {
    title: "Schedule & venue bookings",
    summary: "Week and month calendars that combine artistic holds, get-ins, tours, and room bookings.",
    accent: "orange",
    body:
      "The schedule is where conflicts surface before tech week. OrdoStage merges event dates, internal venue bookings, and tour activity into filterable calendar views so production managers and stage management work from the same timeline.",
    bullets: [
      "Switch between week and month views across your organisation’s activity",
      "Filter calendar items by event, venue, tour, rehearsal, or internal booking type",
      "Create and edit venue bookings with time grids similar to familiar calendar tools",
      "See get-ins, performances, holds, and maintenance in one combined picture",
      "Open items in place to adjust times without losing context",
      "Spot overlapping bookings before they become show-day crises",
      "Connect schedule entries back to the underlying event or venue record",
      "Support internal bookings separate from public-facing event programming",
      "Use consistent date and time handling for multi-day productions",
      "Give stage managers a filterable view of what matters on the day they care about",
    ],
  },
  {
    title: "Venues & technical inventory",
    summary: "Every stage, hall, and studio with specs, files, and its own booking calendar.",
    accent: "violet",
    body:
      "Technical departments maintain venue inventory where bookings live. Room specs, rigging notes, floor plans, and photos stay on the venue record so visiting productions and in-house teams pull from one authoritative source.",
    bullets: [
      "Maintain a full inventory of venues and rooms across one or many sites",
      "Store address, capacity, and technical metadata per venue",
      "Attach documents, thumbnails, and files to the room they describe",
      "Manage stage dimensions and warnings when production sizes exceed room limits",
      "Run a dedicated venue booking calendar per room",
      "Edit venue details with structured address and contact fields",
      "Support presenting houses, multi-room buildings, and touring receiving venues",
      "Reduce re-sending the same PDF when a tour arrives in a new city",
      "Link venue bookings from events so artistic and ops see the same hold",
      "Give head-of-stage and technical teams one place to update specs after refits",
    ],
  },
  {
    title: "Tours & tech riders",
    summary: "Routing, tour days, shared schedules, and rider packs generated from tour data.",
    accent: "blue",
    body:
      "Touring adds cities, trucks, and local crews to every decision. OrdoStage structures tours with days and shows, produces tech information for each stop, and shares read-only schedules when partners need a link instead of full access.",
    bullets: [
      "Structure tours with days, cities, venues, and linked shows",
      "See routing alongside home-venue programming when a show both tours and resides",
      "Generate and share tech riders from tour data for local production teams",
      "Publish public tour schedule links for artists, agents, and partners",
      "Offer personal tour views when someone needs only their slice of the road",
      "Keep tour detail accessible to production without re-keying spreadsheets",
      "Coordinate tour dates with venue bookings and production deadlines",
      "Update once in OrdoStage — everyone with the link sees current dates",
      "Reduce “which rider version is this?” moments when the truck rolls in",
      "Align visiting production requirements with each venue’s actual inventory",
    ],
  },
  {
    title: "Staffing & show jobs",
    summary: "Requirements, assignments, and department views built for how shows are actually crewed.",
    accent: "magenta",
    body:
      "Staffing connects the people roster to each show. Line up jobs by department, track who is confirmed, and see at a glance where you are short — using the same data HR maintains and stage management trusts on show day.",
    bullets: [
      "Define show jobs with roles, departments, and planned hours per performance",
      "Assign people from your organisation roster to each job on a show",
      "See staffing OK indicators and gaps by department before opening night",
      "Review team notes and handover information attached to events",
      "Use staffing views designed for performance organisations, not generic HR tools",
      "Connect assignments to the event and show they support",
      "Reduce last-minute calls because someone worked from an outdated list",
      "Support multiple teams and notes per event for complex productions",
      "Align crew requirements with production planner and schedule data",
      "Give stage managers the same assignment picture the office uses",
    ],
  },
  {
    title: "People, teams & permissions",
    summary: "One roster, structured teams, invites, and permission groups for every department.",
    accent: "violet",
    body:
      "People records feed everything else. HR and operations onboard members once, organise them into teams and permission groups, and control who can view or edit events, venues, time, and billing — without maintaining parallel spreadsheets.",
    bullets: [
      "Maintain profiles with names, photos, contact details, and employment context",
      "Organise people into teams and departments that mirror your house or tour",
      "Invite new members by email and assign them to the correct organisation",
      "Reuse the same person across events, staffing, time tracking, and documents",
      "Configure permission groups with granular view and write access by area",
      "Support volunteers, contractors, and staff with appropriate trust boundaries",
      "Manage organisation membership and multi-org access for touring companies",
      "Keep team membership current when people change roles mid-season",
      "Control who sees billing, production, venues, and time modules",
      "Reduce duplicate entries when someone works on multiple productions",
    ],
  },
  {
    title: "Time tracking & reports",
    summary: "Crew and staff log hours on real work; finance exports structured data.",
    accent: "yellow",
    body:
      "Time entries link to events, shows, roles, and categories — not a separate timesheet app. Managers review activity in context; finance runs reports and exports when payroll or costing needs numbers tied to actual productions.",
    bullets: [
      "Log hours against events, productions, and staffing assignments",
      "Categorise time for payroll, costing, and internal reporting rules",
      "Review entries in time-tracking views filtered by person, event, or period",
      "Run time reports for payroll preparation and retrospective production costing",
      "Export data when finance needs to reconcile in external systems",
      "Connect reported hours to the roster record HR already maintains",
      "Support road crews logging against tour days and city stops",
      "Give production managers visibility into labour against the plan",
      "Reduce memory-based timesheets after long tech weeks or tour legs",
      "Keep managers and finance aligned on the same underlying numbers",
    ],
  },
  {
    title: "Production planner",
    summary: "Phases, tasks, costs, crew lines, and PDF plans on a production timeline.",
    accent: "orange",
    body:
      "The production planner is for build and tech milestones that sit alongside the artistic calendar. Plan phases on a Gantt-style timeline, attach costs and crew, open task detail, and export a PDF when partners need a printable plan.",
    bullets: [
      "Create productions and add plan lines for phases, tasks, and cost items",
      "View an interactive Gantt timeline with zoom and date range controls",
      "Track task categories, critical path, and milestones across the production",
      "Open task pages for phase context, edits, and deletion when plans change",
      "Manage budget and crew panels tied to the selected production",
      "Record planned and actual costs next to the timeline they support",
      "Download production plan PDFs for meetings and external partners",
      "Align planner dates with events and schedule data the organisation already uses",
      "Support long-running builds where tech week is only one chapter",
      "Give production managers one timeline instead of a folder of versions",
    ],
  },
  {
    title: "Shared calendars & organisation account",
    summary: "Publish read-only views, manage billing, and keep company details where owners expect them.",
    accent: "blue",
    body:
      "Not everyone needs a login. Shared calendars and public tour links let partners see current dates safely. Organisation owners manage plans, seats, and company billing details in the account area — alongside the work the whole company runs in OrdoStage.",
    bullets: [
      "Publish shared calendars when external partners need a read-only view",
      "Export or coordinate outward while OrdoStage remains the source of truth",
      "Share public tour schedules without granting access to your whole organisation",
      "Store company, invoice, and billing contact details in the organisation account",
      "Choose Flex or Yearly billing with seat tiers suited to your team size",
      "Manage organisation settings, members, and owners in one account area",
      "Send email invitations and onboard new members into the right organisation",
      "Use the dashboard to see upcoming events and activity at a glance",
      "Switch between organisations when your company runs multiple entities",
      "Control who can manage billing and membership as organisation owners",
    ],
  },
] as const;

/** @deprecated Use PLATFORM_FEATURE_AREAS */
export const PLATFORM_FEATURE_HIGHLIGHTS = PLATFORM_FEATURE_AREAS;
