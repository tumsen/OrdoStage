import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api, isApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { DepartmentMember } from "./TeamDepartmentMembers";
import { parseTeamRoles, serializeTeamRoles } from "./teamRoles";

export function TeamMemberRolesEditor({
  departmentId,
  member,
  canWrite,
  onSaveTeamRoles,
  isSaving,
}: {
  departmentId: string;
  member: DepartmentMember;
  canWrite: boolean;
  onSaveTeamRoles: (role: string | null) => void;
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
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 space-y-2">
      <div className="text-[10px] text-white/35 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>
          Profile default:{" "}
          <span className="text-white/55">{hasProfileDefault ? member.defaultRole : "—"}</span>
        </span>
        {canWrite && hasProfileDefault ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-amber-400/90 hover:text-amber-300 hover:bg-amber-500/10"
            onClick={() => setClearDefaultOpen(true)}
          >
            Remove profile default
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
