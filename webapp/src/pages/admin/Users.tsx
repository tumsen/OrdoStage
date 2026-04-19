import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, isApiError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/lib/auth-client";

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  organizationMember: {
    role: string;
    organization: {
      id: string;
      name: string;
    };
  } | null;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function Users() {
  const [search, setSearch] = useState("");
  const [grantEmail, setGrantEmail] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  const { data: users, isPending } = useQuery<AdminUser[]>({
    queryKey: ["admin", "users"],
    queryFn: () => api.get<AdminUser[]>("/api/admin/users"),
  });

  const toggleAdminMutation = useMutation({
    mutationFn: ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) =>
      api.patch<AdminUser>(`/api/admin/users/${userId}`, { isAdmin }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({
        title: vars.isAdmin ? "Admin granted" : "Admin revoked",
        description: "Platform admin access has been updated.",
      });
    },
    onError: (err) => {
      const msg = isApiError(err) ? err.message : "Could not update admin status.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const grantAdminMutation = useMutation({
    mutationFn: (email: string) =>
      api.post<AdminUser>("/api/admin/users/grant-admin", { email }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setGrantEmail("");
      toast({
        title: "Admin granted",
        description: "That account now has owner admin access.",
      });
    },
    onError: (err) => {
      const msg = isApiError(err) ? err.message : "Could not grant admin.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const filtered = (users ?? []).filter((u) => {
    const q = search.toLowerCase();
    return (
      (u.name?.toLowerCase().includes(q) ?? false) ||
      u.email.toLowerCase().includes(q)
    );
  });

  const COL_COUNT = 6;

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-3 max-w-xl">
        <h3 className="text-sm font-semibold text-white">Grant platform admin</h3>
        <p className="text-xs text-white/45">
          The account must already exist (user has signed up). Enter their email to grant owner-admin access.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px] space-y-1">
            <label htmlFor="grant-email" className="text-xs text-white/40">
              Email
            </label>
            <Input
              id="grant-email"
              type="email"
              autoComplete="off"
              placeholder="name@example.com"
              value={grantEmail}
              onChange={(e) => setGrantEmail(e.target.value)}
              className="bg-gray-900 border-white/10 text-white placeholder:text-white/25"
            />
          </div>
          <Button
            type="button"
            disabled={grantAdminMutation.isPending || grantEmail.trim().length === 0}
            className="bg-rose-700 hover:bg-rose-600"
            onClick={() => grantAdminMutation.mutate(grantEmail.trim())}
          >
            {grantAdminMutation.isPending ? "Granting…" : "Grant admin"}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-gray-900 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-rose-500/30"
          />
        </div>
        <div className="text-white/30 text-sm">{filtered.length} users</div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-white/10 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Name</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Email</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Organization</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Org role</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider text-center">
                Admin
              </TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-white/5">
                  {Array.from({ length: COL_COUNT }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-white/5 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow className="border-white/5">
                <TableCell colSpan={COL_COUNT} className="text-center text-white/30 py-12">
                  {search ? "No users match your search" : "No users yet"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((user) => {
                const busy = toggleAdminMutation.isPending;
                return (
                  <TableRow key={user.id} className="border-white/5 hover:bg-white/[0.02]">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-white/80">{user.name ?? "—"}</span>
                        {user.isAdmin ? (
                          <Badge className="bg-rose-950/60 text-rose-400 border-rose-800/40 text-xs">Admin</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-white/50">{user.email}</TableCell>
                    <TableCell>
                      {user.organizationMember ? (
                        <Link
                          to={`/admin/orgs/${user.organizationMember.organization.id}`}
                          className="text-rose-400 hover:text-rose-300 underline underline-offset-2 text-sm transition-colors"
                        >
                          {user.organizationMember.organization.name}
                        </Link>
                      ) : (
                        <span className="text-white/20 text-sm">No org</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.organizationMember ? (
                        <Badge
                          className={
                            user.organizationMember.role === "owner"
                              ? "bg-rose-950/60 text-rose-400 border-rose-800/40 text-xs"
                              : "bg-white/5 text-white/50 border-white/10 text-xs"
                          }
                        >
                          {user.organizationMember.role}
                        </Badge>
                      ) : (
                        <span className="text-white/20 text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="inline-flex items-center justify-center">
                        <Switch
                          checked={user.isAdmin}
                          disabled={busy}
                          onCheckedChange={(checked) =>
                            toggleAdminMutation.mutate({ userId: user.id, isAdmin: checked })
                          }
                          aria-label={`Platform admin for ${user.email}`}
                          className="data-[state=checked]:bg-rose-600"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-white/40 text-sm">{formatDate(user.createdAt)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {session?.user?.id ? (
        <p className="text-xs text-white/35 max-w-2xl">
          To revoke your own admin access, turn off the switch on your row — unless you are the only admin, in which case
          add another admin first.
        </p>
      ) : null}
    </div>
  );
}
