import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { RoleBadge } from "./RoleBadge";
import { cn } from "@/lib/utils";

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  orgRole: string;
  departmentId: string | null;
  department: { id: string; name: string; color: string } | null;
  createdAt: string;
}

const ROLES = ["owner", "manager", "viewer"] as const;

interface TeamMemberRowProps {
  member: TeamMember;
  isOwner: boolean;
  currentUserId: string | undefined;
  onRemove: (id: string, name: string) => void;
}

export function TeamMemberRow({ member, isOwner, currentUserId, onRemove }: TeamMemberRowProps) {
  const queryClient = useQueryClient();
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);

  const initials = member.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const roleMutation = useMutation({
    mutationFn: (role: string) => api.put(`/api/team/${member.id}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      setRoleDropdownOpen(false);
    },
  });

  const isSelf = member.id === currentUserId;

  return (
    <tr className="border-b border-white/5 group hover:bg-white/[0.02] transition-colors">
      {/* Avatar + Name */}
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-purple-700/50 flex items-center justify-center flex-shrink-0">
            <span className="text-purple-200 text-xs font-semibold">{initials || "?"}</span>
          </div>
          <div>
            <div className="text-sm font-medium text-white/90">
              {member.name}
              {isSelf ? <span className="ml-2 text-xs text-white/30">(you)</span> : null}
            </div>
          </div>
        </div>
      </td>

      {/* Email */}
      <td className="px-5 py-3.5 text-sm text-white/50 hidden md:table-cell">
        {member.email}
      </td>

      {/* Department */}
      <td className="px-5 py-3.5 hidden sm:table-cell">
        {member.department ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-white/5 border border-white/10 text-white/60">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: member.department.color }}
            />
            {member.department.name}
          </span>
        ) : (
          <span className="text-white/25 text-sm">—</span>
        )}
      </td>

      {/* Role */}
      <td className="px-5 py-3.5">
        {isOwner && !isSelf ? (
          <div className="relative">
            <button
              onClick={() => setRoleDropdownOpen((v) => !v)}
              className="flex items-center gap-1 group/role"
            >
              <RoleBadge role={member.orgRole} />
              <ChevronDown size={12} className="text-white/30 group-hover/role:text-white/60 transition-colors" />
            </button>
            {roleDropdownOpen ? (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setRoleDropdownOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-20 bg-[#1a1a24] border border-white/10 rounded-lg shadow-xl py-1 min-w-[120px]">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => roleMutation.mutate(r)}
                      disabled={roleMutation.isPending}
                      className={cn(
                        "flex items-center w-full px-3 py-1.5 text-sm transition-colors",
                        member.orgRole === r
                          ? "text-white/90 bg-white/5"
                          : "text-white/50 hover:text-white/80 hover:bg-white/5"
                      )}
                    >
                      <RoleBadge role={r} />
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <RoleBadge role={member.orgRole} />
        )}
      </td>

      {/* Actions */}
      <td className="px-5 py-3.5 w-12">
        {isOwner && !isSelf ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
            onClick={() => onRemove(member.id, member.name)}
          >
            <X size={13} />
          </Button>
        ) : null}
      </td>
    </tr>
  );
}
