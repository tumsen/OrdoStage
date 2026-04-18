import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserMinus, UserPlus, X } from "lucide-react";
import { api, isApiError } from "@/lib/api";
import type { Person } from "../../../../backend/src/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/** Stored as comma-separated text in PersonTeam.role */
export function parseTeamRoles(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function serializeTeamRoles(roles: string[]): string | null {
  const cleaned = roles.map((r) => r.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  return cleaned.join(", ");
}

interface TeamDepartmentMembersProps {
  departmentId: string;
  expanded: boolean;
  canWrite: boolean;
}

export function TeamDepartmentMembers({ departmentId, expanded, canWrite }: TeamDepartmentMembersProps) {
  const queryClient = useQueryClient();
  const [removeTarget, setRemoveTarget] = useState<DepartmentMember | null>(null);
  const [addPersonId, setAddPersonId] = useState<string>("");
  const [addRoles, setAddRoles] = useState("");

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["department-members", departmentId],
    queryFn: () => api.get<DepartmentMember[]>(`/api/departments/${departmentId}/members`),
    enabled: expanded,
  });

  const { data: allPeople = [] } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<Person[]>("/api/people"),
    enabled: expanded && canWrite,
  });

  const memberIds = new Set(members.map((m) => m.personId));
  const candidates = allPeople.filter((p) => !memberIds.has(p.id));

  const addMutation = useMutation({
    mutationFn: () =>
      api.post<DepartmentMember>(`/api/departments/${departmentId}/members`, {
        personId: addPersonId,
        role: serializeTeamRoles(parseTeamRoles(addRoles)) ?? undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["department-members", departmentId] });
      queryClient.invalidateQueries({ queryKey: ["people"] });
      setAddPersonId("");
      setAddRoles("");
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
        <div className="space-y-2">
          {members.map((m) => (
            <MemberRow
              key={m.personId}
              departmentId={departmentId}
              member={m}
              canWrite={canWrite}
              onSaveTeamRoles={(role) =>
                patchRoleMutation.mutate({ personId: m.personId, role })
              }
              onRemove={() => setRemoveTarget(m)}
              isSaving={
                patchRoleMutation.isPending && patchRoleMutation.variables?.personId === m.personId
              }
            />
          ))}
        </div>
      )}

      {canWrite ? (
        <div className="flex flex-col gap-2 pt-1 border-t border-white/5 border-dashed">
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={addPersonId || undefined} onValueChange={setAddPersonId}>
              <SelectTrigger className="flex-1 bg-white/5 border-white/10 text-white text-sm h-9">
                <SelectValue placeholder="Add someone from People…" />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white max-h-60">
                {candidates.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-white/40">Everyone is already on this team.</div>
                ) : (
                  candidates.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.email ? ` · ${p.email}` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Input
              value={addRoles}
              onChange={(e) => setAddRoles(e.target.value)}
              placeholder="Roles in this team — comma-separated, e.g. Lead, Swing, Cover"
              className="flex-1 bg-white/5 border-white/10 text-white h-9 text-sm placeholder:text-white/25"
            />
            <Button
              type="button"
              size="sm"
              className="bg-red-900/90 hover:bg-red-800 text-white h-9 gap-1.5 shrink-0 sm:w-auto w-full"
              disabled={!addPersonId || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              <UserPlus size={14} />
              {addMutation.isPending ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
      ) : null}

      <AlertDialog open={removeTarget !== null} onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}>
        <AlertDialogContent className="bg-[#16161f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from this team?</AlertDialogTitle>
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
                if (removeTarget) removeMutation.mutate(removeTarget.personId);
              }}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MemberRow({
  departmentId,
  member,
  canWrite,
  onSaveTeamRoles,
  onRemove,
  isSaving,
}: {
  departmentId: string;
  member: DepartmentMember;
  canWrite: boolean;
  onSaveTeamRoles: (role: string | null) => void;
  onRemove: () => void;
  isSaving: boolean;
}) {
  const queryClient = useQueryClient();
  const [roles, setRoles] = useState<string[]>(() => parseTeamRoles(member.roleInTeam));
  const [newTag, setNewTag] = useState("");
  const [clearDefaultOpen, setClearDefaultOpen] = useState(false);

  useEffect(() => {
    setRoles(parseTeamRoles(member.roleInTeam));
  }, [member.personId, member.roleInTeam]);

  function persist(next: string[]) {
    const serialized = serializeTeamRoles(next);
    const prev = serializeTeamRoles(parseTeamRoles(member.roleInTeam));
    if (serialized !== prev) {
      onSaveTeamRoles(serialized);
    }
  }

  function syncRoles(next: string[]) {
    setRoles(next);
    persist(next);
  }

  const clearDefaultMutation = useMutation({
    mutationFn: () => api.put(`/api/people/${member.personId}`, { role: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["people"] });
      queryClient.invalidateQueries({ queryKey: ["department-members", departmentId] });
      setClearDefaultOpen(false);
      toast({
        title: "Profile default role removed",
        description: "Their default role on the People page is cleared. Team roles above are unchanged.",
      });
    },
    onError: (e: unknown) => {
      toast({
        title: isApiError(e) ? e.message : "Could not update profile",
        variant: "destructive",
      });
    },
  });

  const hasProfileDefault = Boolean(member.defaultRole?.trim());

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5">
      <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white/90 font-medium truncate">{member.name}</div>
          <div className="text-[10px] text-white/35 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              Profile default:{" "}
              <span className="text-white/55">{hasProfileDefault ? member.defaultRole : "—"}</span>
            </span>
            {member.email ? <span className="text-white/25">{member.email}</span> : null}
            {canWrite && hasProfileDefault ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px] text-amber-400/90 hover:text-amber-300 hover:bg-amber-500/10"
                  onClick={() => setClearDefaultOpen(true)}
                >
                  Remove profile default
                </Button>
              </>
            ) : null}
          </div>
        </div>
        {canWrite ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/25 hover:text-red-400 shrink-0 self-start sm:self-center"
            onClick={onRemove}
            title="Remove from team"
          >
            <UserMinus size={14} />
          </Button>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <label className="text-[9px] uppercase tracking-wide text-white/30">Role(s) in this team</label>
        <div className="flex flex-wrap gap-1.5 min-h-[26px]">
          {roles.length === 0 ? (
            <span className="text-[11px] text-white/25 italic">No roles yet — add below.</span>
          ) : (
            roles.map((r, i) => (
              <span
                key={`${r}-${i}`}
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] pl-2.5 pr-1 py-0.5 text-[11px] text-white/85"
              >
                {r}
                {canWrite ? (
                  <button
                    type="button"
                    disabled={isSaving}
                    className="rounded-full p-0.5 text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-40"
                    onClick={() => syncRoles(roles.filter((_, j) => j !== i))}
                    aria-label={`Remove ${r}`}
                  >
                    <X size={12} />
                  </button>
                ) : null}
              </span>
            ))
          )}
        </div>
        {canWrite ? (
          <div className="flex gap-2 flex-wrap items-center pt-0.5">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const t = newTag.trim();
                  if (t && !roles.includes(t)) syncRoles([...roles, t]);
                  setNewTag("");
                }
              }}
              disabled={isSaving}
              placeholder="Add a role…"
              className="h-8 flex-1 min-w-[120px] max-w-[220px] text-xs bg-white/5 border-white/10 text-white placeholder:text-white/20"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 text-xs bg-white/10 hover:bg-white/15 text-white border-0"
              disabled={isSaving || !newTag.trim() || roles.includes(newTag.trim())}
              onClick={() => {
                const t = newTag.trim();
                if (!t || roles.includes(t)) return;
                syncRoles([...roles, t]);
                setNewTag("");
              }}
            >
              Add role
            </Button>
            {roles.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-white/40 hover:text-white"
                disabled={isSaving}
                onClick={() => syncRoles([])}
              >
                Clear team roles
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <AlertDialog open={clearDefaultOpen} onOpenChange={setClearDefaultOpen}>
        <AlertDialogContent className="bg-[#16161f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove default role from their profile?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50 space-y-2">
              <p>
                This clears the <strong className="text-white/70">default role</strong> on the People page for{" "}
                {member.name}. It does not remove their roles in this team.
              </p>
              <p>Use this when their job title should only appear per team, not as a global default.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-900 hover:bg-amber-800 text-white border-amber-700/50"
              onClick={() => clearDefaultMutation.mutate()}
              disabled={clearDefaultMutation.isPending}
            >
              {clearDefaultMutation.isPending ? "Removing…" : "Remove profile default"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
