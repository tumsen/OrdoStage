import type { NavigateFunction } from "react-router-dom";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

export type OrgMembershipDTO = { organizationId: string; name: string; orgRole: string };

/** Where to send the user immediately after sign-in / sign-up (multi-org aware). */
export async function completePostAuthenticationNavigation(
  navigate: NavigateFunction,
  opts: { returnTo?: string }
) {
  const returnTo = opts.returnTo?.trim();
  if (returnTo) {
    navigate(returnTo);
    return;
  }

  const rows = await api.get<OrgMembershipDTO[]>("/api/org/memberships");

  if (rows.length === 0) {
    navigate("/setup-org");
    return;
  }

  if (rows.length === 1) {
    await api.post("/api/org/switch", { organizationId: rows[0].organizationId });
    await authClient.getSession();
    navigate("/dashboard");
    return;
  }
  // Multi-organization users always choose workspace after login.
  navigate("/select-org");
}
