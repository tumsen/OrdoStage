import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MailPlus } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
import { TeamMemberRow, type TeamMember } from "./TeamMemberRow";
import { useSession } from "@/lib/auth-client";
import { toast } from "@/components/ui/use-toast";
import { RoleBadge } from "./RoleBadge";

interface TeamMembersSectionProps {
  isOwner: boolean;
  canManageTeam: boolean;
}

type InvitationRow = {
  id: string;
  email: string;
  orgRole: string;
  expiresAt: string;
  createdAt: string;
};

export function TeamMembersSection({ isOwner, canManageTeam }: TeamMembersSectionProps) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"manager" | "member" | "viewer">("member");

  const { data: members, isLoading, error } = useQuery({
    queryKey: ["team"],
    queryFn: () => api.get<TeamMember[]>("/api/team"),
  });

  const { data: invitations } = useQuery({
    queryKey: ["team", "invitations"],
    queryFn: () => api.get<InvitationRow[]>("/api/team/invitations"),
    enabled: canManageTeam,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/team/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      setRemoveTarget(null);
    },
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      api.post<InvitationRow>("/api/team/invitations", {
        email: inviteEmail.trim(),
        role: inviteRole,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", "invitations"] });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("member");
      toast({ title: "Invitation sent", description: "They will receive an email with a link to join." });
    },
    onError: (err: Error) => {
      toast({ title: "Could not invite", description: err.message, variant: "destructive" });
    },
  });

  const cancelInviteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/team/invitations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", "invitations"] });
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/team/invitations/${id}/resend`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", "invitations"] });
      toast({ title: "Invitation resent", description: "A new invitation email has been sent." });
    },
    onError: (err: Error) => {
      toast({ title: "Could not resend invitation", description: err.message, variant: "destructive" });
    },
  });

  return (
    <>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wide">Team Members</h2>
          <p className="text-xs text-white/30 mt-0.5">Everyone who can sign in to your organisation</p>
        </div>
        {canManageTeam ? (
          <Button
            size="sm"
            className="bg-purple-700 hover:bg-purple-600 text-white gap-2"
            onClick={() => setInviteOpen(true)}
          >
            <MailPlus size={14} />
            Invite
          </Button>
        ) : null}
      </div>

      {canManageTeam && (invitations?.length ?? 0) > 0 ? (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-white/40 mb-2">Pending invitations</p>
          <ul className="space-y-2">
            {(invitations ?? []).map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 text-sm text-white/70"
              >
                <span className="truncate">{inv.email}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <RoleBadge role={inv.orgRole} />
                  <button
                    type="button"
                    className="text-xs text-white/35 hover:text-indigo-300 disabled:opacity-50"
                    disabled={resendInviteMutation.isPending}
                    onClick={() => resendInviteMutation.mutate(inv.id)}
                  >
                    Resend
                  </button>
                  <button
                    type="button"
                    className="text-xs text-white/35 hover:text-red-400"
                    onClick={() => {
                      if (!confirmDeleteAction(`invitation for ${inv.email}`)) return;
                      cancelInviteMutation.mutate(inv.id);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
              <th className="px-5 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide hidden sm:table-cell">
                Access
              </th>
              <th className="px-5 py-3 w-12" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-5 py-8">
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full bg-white/5" />
                    ))}
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-red-400 text-sm">
                  Failed to load team members.
                </td>
              </tr>
            ) : (members ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-white/30 text-sm">
                  No team members found.
                </td>
              </tr>
            ) : (
              (members ?? []).map((member) => (
                <TeamMemberRow
                  key={member.id}
                  member={member}
                  isOwner={isOwner}
                  canManageTeam={canManageTeam}
                  currentUserId={currentUserId}
                  onRemove={(id, name) => setRemoveTarget({ id, name })}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="bg-[#16161f] border-white/10 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite to organisation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="invite-email" className="text-white/70">
                Email
              </Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/70">Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as typeof inviteRole)}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a24] border-white/10">
                  <SelectItem value="manager">Manager — edit most content, manage team</SelectItem>
                  <SelectItem value="member">Member — edit schedules and content</SelectItem>
                  <SelectItem value="viewer">Viewer — read-only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="border-white/10" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-purple-700 hover:bg-purple-600"
              disabled={!inviteEmail.trim() || inviteMutation.isPending}
              onClick={() => inviteMutation.mutate()}
            >
              {inviteMutation.isPending ? "Sending…" : "Send invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(o) => { if (!o) setRemoveTarget(null); }}
      >
        <AlertDialogContent className="bg-[#16161f] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete team member?</AlertDialogTitle>
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
              onClick={() => {
                if (!removeTarget) return;
                if (!confirmDeleteAction(`team member "${removeTarget.name}"`)) return;
                removeMutation.mutate(removeTarget.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
