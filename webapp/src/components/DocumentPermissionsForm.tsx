import { Checkbox } from "@/components/ui/checkbox";

export type DocumentPermissionMember = { id: string; name: string };
export type DocumentPermissionTeam = {
  id: string;
  name: string;
  color: string;
  members: DocumentPermissionMember[];
};
export type DocumentPermissionState = { teamIds: string[]; personIds: string[] };
export type DocumentPermissionOptions = { ownerPersonId: string; teams: DocumentPermissionTeam[] };

/** If a whole team is allowed, drop redundant per-member person ids for that team (keeps load/save consistent with the “entire team or specific people” model). */
export function normalizeDocumentPermissions(
  state: DocumentPermissionState,
  teams: DocumentPermissionTeam[] | undefined
): DocumentPermissionState {
  if (!teams?.length) return state;
  const teamIdSet = new Set(state.teamIds);
  return {
    teamIds: state.teamIds,
    personIds: state.personIds.filter((pid) => {
      for (const team of teams) {
        if (!teamIdSet.has(team.id)) continue;
        if (team.members.some((m) => m.id === pid)) return false;
      }
      return true;
    }),
  };
}

type Props = {
  options: DocumentPermissionOptions | undefined;
  draft: DocumentPermissionState;
  onChange: (next: DocumentPermissionState) => void;
};

/**
 * For each team: either grant the **whole team** (team id in teamIds) or
 * grant **only selected people** in that team (person ids, team id not in teamIds).
 */
export function DocumentPermissionsForm({ options, draft, onChange }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-white/50">
        Per team: use <span className="text-white/70">Entire team</span> for everyone, or turn it off and check
        <span className="text-white/70"> only specific people</span> in that team.
      </p>
      {(options?.teams ?? []).map((team) => {
        const entireTeam = draft.teamIds.includes(team.id);
        const membersExcludingOwner = team.members.filter((m) => m.id !== options?.ownerPersonId);
        const allMemberIdsInTeam = new Set(team.members.map((m) => m.id));

        const setEntireTeam = (on: boolean) => {
          if (on) {
            onChange({
              teamIds: [...new Set([...draft.teamIds, team.id])],
              // Whole team makes per-member picks for this team unnecessary — remove them
              personIds: draft.personIds.filter((id) => !allMemberIdsInTeam.has(id)),
            });
          } else {
            onChange({
              ...draft,
              teamIds: draft.teamIds.filter((id) => id !== team.id),
            });
          }
        };

        const toggleMember = (personId: string, checked: boolean) => {
          if (entireTeam) return;
          onChange({
            ...draft,
            personIds: checked
              ? [...new Set([...draft.personIds, personId])]
              : draft.personIds.filter((id) => id !== personId),
          });
        };

        return (
          <div key={team.id} className="rounded border border-white/10 bg-white/[0.02] p-3 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={entireTeam}
                onCheckedChange={(v) => setEntireTeam(v === true)}
              />
              <span
                className="inline-block h-2.5 w-2.5 rounded-full border border-white/20 shrink-0"
                style={{ backgroundColor: team.color }}
              />
              <span className="text-sm text-white/85">Entire team: {team.name}</span>
            </label>
            {entireTeam ? (
              <p className="pl-7 text-[11px] text-white/40">All active members in this team can view this document.</p>
            ) : (
              <>
                <p className="pl-1 text-[10px] uppercase tracking-wide text-white/35">Specific people in {team.name}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-1">
                  {membersExcludingOwner.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-xs text-white/80 cursor-pointer">
                      <Checkbox
                        checked={draft.personIds.includes(m.id)}
                        onCheckedChange={(v) => toggleMember(m.id, v === true)}
                      />
                      <span className="truncate" title={m.name}>
                        {m.name}
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
