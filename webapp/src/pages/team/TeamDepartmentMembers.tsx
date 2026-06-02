import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { Loader2, User, UserMinus } from "lucide-react";
import { PersonCard } from "@/components/person/PersonCard";
import { TeamAddPersonFooter } from "./TeamAddPersonFooter";
import { TeamMemberRolesEditor } from "./TeamMemberRolesEditor";
import { api, isApiError } from "@/lib/api";
import type { Person } from "../../../../backend/src/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";

export interface DepartmentMember {
  personId: string;
  name: string;
  email: string | null;
  defaultRole: string | null;
  roleInTeam: string | null;
}

import { parseTeamRoles, serializeTeamRoles } from "./teamRoles";
export { parseTeamRoles, serializeTeamRoles } from "./teamRoles";

function personPhotoUrl(person: Person): string | null {
  if (!person.hasPhoto) return null;
  return `${import.meta.env.VITE_BACKEND_URL || ""}/api/people/${person.id}/photo?ts=${person.photoUpdatedAt ?? ""}`;
}

function PersonPickerLabel({ person }: { person: Person }) {
  const photoUrl = personPhotoUrl(person);
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className="h-6 w-6 rounded-full overflow-hidden bg-white/10 border border-white/10 shrink-0 flex items-center justify-center">
        {photoUrl ? (
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <User size={12} className="text-white/30" />
        )}
      </span>
      <span className="truncate text-sm">{person.name}</span>
    </span>
  );
}

interface TeamDepartmentMembersProps {
  departmentId: string;
  expanded: boolean;
  canWrite: boolean;
}

export function TeamDepartmentMembers({ departmentId, expanded, canWrite }: TeamDepartmentMembersProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const [removeTarget, setRemoveTarget] = useState<DepartmentMember | null>(null);
  const [addPersonId, setAddPersonId] = useState("");

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["department-members", departmentId],
    queryFn: () => api.get<DepartmentMember[]>(`/api/departments/${departmentId}/members`),
    enabled: expanded,
  });

  const { data: allPeople = [] } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<Person[]>("/api/people"),
    enabled: expanded,
  });

  const peopleById = useMemo(() => new Map(allPeople.map((p) => [p.id, p])), [allPeople]);
  const sessionEmail = session?.user?.email?.toLowerCase() ?? null;

  const memberIds = new Set(members.map((m) => m.personId));
  const candidates = allPeople.filter((p) => !memberIds.has(p.id));
  const addPerson = addPersonId ? peopleById.get(addPersonId) : undefined;

  const addMutation = useMutation({
    mutationFn: ({ personId, roles }: { personId: string; roles: string }) =>
      api.post<DepartmentMember>(`/api/departments/${departmentId}/members`, {
        personId,
        role: serializeTeamRoles(parseTeamRoles(roles)) ?? undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["department-members", departmentId] });
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      queryClient.invalidateQueries({ queryKey: ["people"] });
      setAddPersonId("");
      toast({ title: "Added to team" });
    },
    onError: (e: unknown) => {
      toast({
        title: isApiError(e) ? e.message : "Could not add person",
        variant: "destructive",
      });
    },
  });

  const patchRoleMutation = useMutation({
    mutationFn: ({ personId, role }: { personId: string; role: string | null }) =>
      api.patch<DepartmentMember>(`/api/departments/${departmentId}/members/${personId}`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["department-members", departmentId] });
      queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (e: unknown) => {
      toast({
        title: isApiError(e) ? e.message : "Could not update roles",
        variant: "destructive",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (personId: string) =>
      api.delete(`/api/departments/${departmentId}/members/${personId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["department-members", departmentId] });
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      queryClient.invalidateQueries({ queryKey: ["people"] });
      setRemoveTarget(null);
      toast({ title: "Removed from team" });
    },
    onError: (e: unknown) => {
      toast({
        title: isApiError(e) ? e.message : "Could not remove",
        variant: "destructive",
      });
    },
  });

  if (!expanded) return null;

  return (
    <div className="px-4 py-3 bg-black/20 border-t border-white/5 space-y-3">
      <p className="text-[11px] text-white/35 leading-relaxed">
        <strong className="text-white/45">Profile default role</strong> is set on the People page. Here you assign{" "}
        <strong className="text-white/45">role(s) in this team only</strong> — add several, or remove the profile default
        for this person if you want team roles to stand alone. Multiple team roles: use commas or add tags one by one.
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 text-white/40 text-xs py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading members…
        </div>
      ) : members.length === 0 ? (
        <p className="text-xs text-white/30 py-1">No people in this team yet.</p>
      ) : (
        <div className="rounded-lg border border-white/5 overflow-hidden bg-white/[0.02]">
          {members.map((m) => {
            const person = peopleById.get(m.personId);
            if (!person) {
              return (
                <div key={m.personId} className="px-5 py-4 border-b border-white/5 text-sm text-white/50">
                  {m.name}
                  {m.email ? <span className="text-white/30"> · {m.email}</span> : null}
                </div>
              );
            }
            const personEmail = person.email?.toLowerCase() ?? null;
            const canEditPerson =
              canWrite || Boolean(sessionEmail && personEmail && sessionEmail === personEmail);
            return (
              <PersonCard
                key={m.personId}
                person={person}
                hideTeamsLine
                showActiveToggle={false}
                canEditPerson={canEditPerson}
                canDeletePerson={false}
                canSeeDocumentSummaries={canWrite}
                onEdit={() => navigate(`/people/${person.id}/edit`)}
                onDelete={() => {}}
                footer={
                  <div className="space-y-2">
                    <TeamMemberRolesEditor
                      departmentId={departmentId}
                      member={m}
                      canWrite={canWrite}
                      onSaveTeamRoles={(role) =>
                        patchRoleMutation.mutate({ personId: m.personId, role })
                      }
                      isSaving={
                        patchRoleMutation.isPending &&
                        patchRoleMutation.variables?.personId === m.personId
                      }
                    />
                    {canWrite ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs border-white/15 text-white/55 hover:text-red-300 hover:border-red-500/40 hover:bg-red-950/30 gap-1.5"
                        onClick={() => setRemoveTarget(m)}
                      >
                        <UserMinus size={13} />
                        Remove from team
                      </Button>
                    ) : null}
                  </div>
                }
              />
            );
          })}
        </div>
      )}

      {canWrite ? (
        <div className="space-y-2 pt-3 border-t border-white/5 border-dashed">
          <p className="text-xs font-medium text-white/45">Add from People</p>
          {candidates.length === 0 ? (
            <p className="text-xs text-white/30 py-1">Everyone is already on this team.</p>
          ) : (
            <>
              <Select value={addPersonId || undefined} onValueChange={setAddPersonId}>
                <SelectTrigger className="w-full bg-white/5 border-white/10 text-white h-10">
                  {addPerson ? (
                    <PersonPickerLabel person={addPerson} />
                  ) : (
                    <SelectValue placeholder="Choose someone…" />
                  )}
                </SelectTrigger>
                <SelectContent className="bg-[#16161f] border-white/10 text-white max-h-60">
                  {candidates.map((person) => (
                    <SelectItem key={person.id} value={person.id} className="py-2">
                      <PersonPickerLabel person={person} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {addPerson ? (
                <TeamAddPersonFooter
                  key={addPerson.id}
                  isAdding={
                    addMutation.isPending && addMutation.variables?.personId === addPerson.id
                  }
                  onAdd={(roles) => addMutation.mutate({ personId: addPerson.id, roles })}
                />
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <AlertDialog open={removeTarget !== null} onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}>
        <AlertDialogContent className="bg-[#16161f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from team?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              {removeTarget
                ? `${removeTarget.name} will be removed from this team only. They stay in People and on any other teams.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
              onClick={() => {
                if (!removeTarget) return;
                removeMutation.mutate(removeTarget.personId);
              }}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? "Removing…" : "Remove from team"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
