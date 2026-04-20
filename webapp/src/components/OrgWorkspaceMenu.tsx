import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronsUpDown } from "lucide-react";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OrgMembershipDTO } from "@/lib/postAuthRouting";

interface OrgData {
  id: string;
  name: string;
}

export function OrgWorkspaceMenu({ onNav }: { onNav?: () => void }) {
  const queryClient = useQueryClient();

  const { data: org } = useQuery<OrgData>({
    queryKey: ["org"],
    queryFn: () => api.get<OrgData>("/api/org"),
    staleTime: 30_000,
    retry: false,
  });

  const { data: memberships } = useQuery({
    queryKey: ["org-memberships"],
    queryFn: () => api.get<OrgMembershipDTO[]>("/api/org/memberships"),
    staleTime: 30_000,
  });

  const switchMutation = useMutation({
    mutationFn: (organizationId: string) => api.post("/api/org/switch", { organizationId }),
    onSuccess: async () => {
      await authClient.getSession();
      queryClient.invalidateQueries({ queryKey: ["org"] });
      queryClient.invalidateQueries({ queryKey: ["org-memberships"] });
      queryClient.invalidateQueries({ queryKey: ["me", "permissions"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      onNav?.();
      window.location.assign("/dashboard");
    },
  });

  if (!memberships || memberships.length === 0) {
    return null;
  }

  const currentId = org?.id;
  const label = org?.name ?? memberships.find((m) => m.organizationId === currentId)?.name ?? "Organization";

  if (memberships.length === 1) {
    return (
      <div className="px-3 py-2 border-b border-white/10">
        <div className="text-[10px] uppercase tracking-wider text-white/35 font-medium">Workspace</div>
        <div className="text-sm text-white/80 font-medium truncate mt-0.5" title={label}>
          {label}
        </div>
      </div>
    );
  }

  return (
    <div className="px-2 py-2 border-b border-white/10">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="w-full h-auto py-2 px-2 flex items-center gap-2 justify-between text-left text-white/90 hover:text-white hover:bg-white/5"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-white/35 font-medium">Workspace</div>
              <div className="text-sm font-medium truncate">{label}</div>
            </div>
            <ChevronsUpDown size={16} className="text-white/35 flex-shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56 bg-[#16161f] border-white/10 text-white" align="start">
          <DropdownMenuLabel className="text-white/50 text-xs font-normal">Switch organization</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-white/10" />
          {memberships.map((m) => (
            <DropdownMenuItem
              key={m.organizationId}
              disabled={switchMutation.isPending}
              className="focus:bg-white/10 cursor-pointer"
              onClick={() => {
                if (m.organizationId === currentId) return;
                switchMutation.mutate(m.organizationId);
              }}
            >
              <span className="truncate flex-1">{m.name}</span>
              {m.organizationId === currentId ? (
                <span className="text-[10px] text-ordo-yellow ml-2 flex-shrink-0">current</span>
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
