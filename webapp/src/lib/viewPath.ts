/** Map app path to a "view" id from the org role catalog. */
export function viewIdForPath(pathname: string): string | null {
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return "dashboard";
  if (pathname.startsWith("/events")) return "events";
  if (pathname.startsWith("/schedule")) return "schedule";
  if (pathname.startsWith("/tours")) return "tours";
  if (pathname.startsWith("/venues")) return "venues";
  if (pathname.startsWith("/people")) return "people";
  if (pathname.startsWith("/team")) return "team";
  if (pathname.startsWith("/calendars")) return "calendars";
  if (pathname.startsWith("/billing")) return "billing";
  if (pathname.startsWith("/account")) return "account";
  if (pathname.startsWith("/roles")) return "roles";
  return null;
}
