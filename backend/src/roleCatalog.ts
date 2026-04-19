/** Nav / page areas a user can open (see). */
export const VIEW_DEFS: { id: string; label: string; path: string }[] = [
  { id: "dashboard", label: "Dashboard", path: "/dashboard" },
  { id: "events", label: "Events", path: "/events" },
  { id: "schedule", label: "Schedule", path: "/schedule" },
  { id: "tours", label: "Tours", path: "/tours" },
  { id: "venues", label: "Venues", path: "/venues" },
  { id: "people", label: "People", path: "/people" },
  { id: "team", label: "Team", path: "/team" },
  { id: "calendars", label: "Calendars", path: "/calendars" },
  { id: "billing", label: "Billing", path: "/billing" },
  { id: "account", label: "Account", path: "/account" },
  { id: "roles", label: "Roles", path: "/roles" },
];

/** Things a user can do beyond opening a page. */
export const ACTION_DEFS: {
  id: string;
  label: string;
  group: "content" | "team" | "billing" | "organization" | "account";
}[] = [
  { id: "write.events", label: "Create & edit events", group: "content" },
  { id: "write.schedule", label: "Manage internal schedule & bookings", group: "content" },
  { id: "write.tours", label: "Create & edit tours", group: "content" },
  { id: "write.venues", label: "Manage venues", group: "content" },
  { id: "write.people", label: "Manage people & directory", group: "content" },
  { id: "write.calendars", label: "Manage share links & calendars", group: "content" },
  { id: "write.departments", label: "Manage teams & who is on each team", group: "content" },
  { id: "team.invite", label: "Invite users & manage org members", group: "team" },
  { id: "billing.view", label: "View billing & credits", group: "billing" },
  { id: "billing.manage", label: "Purchase credits & billing settings", group: "billing" },
  { id: "org.policies", label: "Org policies (e.g. deactivate credit cost)", group: "organization" },
  { id: "roles.manage", label: "Define roles & permissions", group: "organization" },
  { id: "account.danger", label: "Danger zone (delete account)", group: "account" },
];

export const ALL_VIEW_IDS = VIEW_DEFS.map((v) => v.id);
export const ALL_ACTION_IDS = ACTION_DEFS.map((a) => a.id);

function allExceptViews(exclude: string[]): string[] {
  return ALL_VIEW_IDS.filter((id) => !exclude.includes(id));
}

const ALL_ACTIONS_SET = ALL_ACTION_IDS;

/** Default sets when no DB row exists (legacy). */
export const LEGACY_PRESETS: Record<
  string,
  { views: string[]; actions: string[] }
> = {
  owner: {
    views: [...ALL_VIEW_IDS],
    actions: [...ALL_ACTIONS_SET],
  },
  manager: {
    views: allExceptViews(["roles"]),
    actions: ALL_ACTION_IDS.filter(
      (a) => !["org.policies", "roles.manage", "billing.manage"].includes(a)
    ),
  },
  member: {
    views: allExceptViews(["roles"]),
    actions: ALL_ACTION_IDS.filter(
      (a) =>
        ![
          "team.invite",
          "billing.manage",
          "org.policies",
          "roles.manage",
          "account.danger",
        ].includes(a)
    ),
  },
};

/** Bootstrap rows for new organizations (slug → preset). */
export function systemRoleSeeds(): Array<{
  slug: string;
  name: string;
  description: string;
  views: string[];
  actions: string[];
  sortOrder: number;
}> {
  return [
    {
      slug: "owner",
      name: "Owner",
      description: "Full access to the organization.",
      sortOrder: 0,
      views: [...LEGACY_PRESETS.owner!.views],
      actions: [...LEGACY_PRESETS.owner!.actions],
    },
    {
      slug: "manager",
      name: "Manager",
      description: "Run day-to-day production; invite team; no org-wide billing or policies.",
      sortOrder: 1,
      views: [...LEGACY_PRESETS.manager!.views],
      actions: [...LEGACY_PRESETS.manager!.actions],
    },
    {
      slug: "member",
      name: "Member",
      description: "Work in the directory, schedule, and tours; cannot invite or change roles.",
      sortOrder: 2,
      views: [...LEGACY_PRESETS.member!.views],
      actions: [...LEGACY_PRESETS.member!.actions],
    },
  ];
}

/** Whether any write-style action is present (approximates former canWrite). */
export function actionsAllowWrite(actions: Set<string>): boolean {
  return [...actions].some(
    (a) =>
      a.startsWith("write.") ||
      a === "team.invite" ||
      a === "billing.manage" ||
      a === "org.policies" ||
      a === "roles.manage"
  );
}

/** Matches former canManageTeam (invite / manage memberships). */
export function actionsAllowTeamManage(actions: Set<string>): boolean {
  return actions.has("team.invite");
}
