import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { Loader2 } from "lucide-react";
import { PersonCard } from "@/components/person/PersonCard";
import { TeamAddPersonFooter } from "./TeamAddPersonFooter";
import { TeamMemberRolesEditor } from "./TeamMemberRolesEditor";
import { api, isApiError } from "@/lib/api";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import type { Person } from "../../../../backend/src/types";
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
                canDeletePerson={canWrite}
                canSeeDocumentSummaries={canWrite}
                deleteAction="remove-from-team"
                onEdit={() => navigate(`/people/${person.id}/edit`)}
                onDelete={() => setRemoveTarget(m)}
                footer={
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
            <div className="rounded-lg border border-white/5 overflow-hidden bg-white/[0.02]">
              {candidates.map((person) => {
                const personEmail = person.email?.toLowerCase() ?? null;
                const canEditPerson =
                  canWrite || Boolean(sessionEmail && personEmail && sessionEmail === personEmail);
                return (
                  <PersonCard
                    key={person.id}
                    person={person}
                    showActiveToggle={false}
                    canEditPerson={canEditPerson}
                    canDeletePerson={false}
                    canSeeDocumentSummaries={canWrite}
                    onEdit={() => navigate(`/people/${person.id}/edit`)}
                    onDelete={() => {}}
                    footer={
                      <TeamAddPersonFooter
                        isAdding={
                          addMutation.isPending && addMutation.variables?.personId === person.id
                        }
                        onAdd={(roles) => addMutation.mutate({ personId: person.id, roles })}
                      />
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <AlertDialog open={removeTarget !== null} onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}>
        <AlertDialogContent className="bg-[#16161f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete team member?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              {removeTarget
                ? `${removeTarget.name} will be removed from this team only. They must stay on at least one other team.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
              onClick={() => {
                if (!removeTarget) return;
                if (!confirmDeleteAction(`team member "${removeTarget.name}"`)) return;
                removeMutation.mutate(removeTarget.personId);
              }}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
