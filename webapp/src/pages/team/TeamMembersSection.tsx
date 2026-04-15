import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
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
import { api } from "@/lib/api";
import { TeamMemberRow, type TeamMember } from "./TeamMemberRow";
import { useSession } from "@/lib/auth-client";

interface TeamMembersSectionProps {
  isOwner: boolean;
}

export function TeamMembersSection({ isOwner }: TeamMembersSectionProps) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);

  const { data: members, isLoading, error } = useQuery({
    queryKey: ["team"],
    queryFn: () => api.get<TeamMember[]>("/api/team"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/team/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      setRemoveTarget(null);
    },
  });

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wide">Team Members</h2>
          <p className="text-xs text-white/30 mt-0.5">Everyone in your organisation</p>
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-5 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide">
                Member
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide hidden md:table-cell">
                Email
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide hidden sm:table-cell">
                Department
              </th>
              <th className="px-5 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide">
                Role
              </th>
              <th className="px-5 py-3 w-12" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-5 py-8">
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full bg-white/5" />
                    ))}
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-red-400 text-sm">
                  Failed to load team members.
                </td>
              </tr>
            ) : (members ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-white/30 text-sm">
                  No team members found.
                </td>
              </tr>
            ) : (
              (members ?? []).map((member) => (
                <TeamMemberRow
                  key={member.id}
                  member={member}
                  isOwner={isOwner}
                  currentUserId={currentUserId}
                  onRemove={(id, name) => setRemoveTarget({ id, name })}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}
      >
        <AlertDialogContent className="bg-[#16161f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove team member?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              {removeTarget?.name} will be removed from the organisation. They will need to be re-invited to regain access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-900 hover:bg-red-800 text-white border-red-700/50"
              onClick={() => { if (removeTarget) removeMutation.mutate(removeTarget.id); }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
