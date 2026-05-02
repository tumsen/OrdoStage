import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, isApiError } from "@/lib/api";
import { confirmDeleteAction } from "@/lib/deleteConfirm";
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
import { Search, Trash2, Wrench, Pencil, Check, X } from "lucide-react";
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
  const [fixEmail, setFixEmail] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEmailVal, setEditEmailVal] = useState("");
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

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/api/admin/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({
        title: "Platform admin removed",
        description: "That login no longer has owner-admin access.",
      });
    },
    onError: (err) => {
      const msg = isApiError(err) ? err.message : "Could not delete user.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const fixCredentialMutation = useMutation({
    mutationFn: (email: string) =>
      api.post<{ message: string; rowsBefore: number }>("/api/admin/users/fix-credential", { email }),
    onSuccess: (data) => {
      toast({
        title: "Login fixed",
        description: data.message,
      });
    },
    onError: (err) => {
      const msg = isApiError(err) ? err.message : "Could not fix credential.";
      toast({ title: "Fix failed", description: msg, variant: "destructive" });
    },
  });

  const changeEmailMutation = useMutation({
    mutationFn: ({ userId, email }: { userId: string; email: string }) =>
      api.put<{ message: string }>(`/api/admin/users/${userId}/email`, { email }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setEditingId(null);
      toast({ title: "Email updated", description: data.message });
    },
    onError: (err) => {
      const msg = isApiError(err) ? err.message : "Could not update email.";
      toast({ title: "Update failed", description: msg, variant: "destructive" });
    },
  });

  const filtered = (users ?? []).filter((u) => {
    const q = search.toLowerCase();
    return (
      (u.name?.toLowerCase().includes(q) ?? false) ||
      u.email.toLowerCase().includes(q)
    );
  });

  const COL_COUNT = 7;

  return (
    <div className="p-6 space-y-4">
      <p className="text-sm text-white/45 max-w-2xl">
        This list is only <strong className="text-white/70">OrdoStage platform admins</strong> (owner-admin console access).
        Organization members and billing contacts are managed under{" "}
        <Link to="/admin/orgs" className="text-rose-400 hover:text-rose-300 underline underline-offset-2">
          Organizations
        </Link>{" "}
        → open an org → Users.
      </p>

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

      <div className="rounded-lg border border-amber-800/30 bg-amber-950/10 p-4 space-y-3 max-w-xl">
        <h3 className="text-sm font-semibold text-amber-300">Fix login for a user</h3>
        <p className="text-xs text-white/45">
          If a user can't sign in after a password reset, enter their email here to consolidate any duplicate credential rows.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px] space-y-1">
            <label htmlFor="fix-email" className="text-xs text-white/40">
              Email
            </label>
            <Input
              id="fix-email"
              type="email"
              autoComplete="off"
              placeholder="name@example.com"
              value={fixEmail}
              onChange={(e) => setFixEmail(e.target.value)}
              className="bg-gray-900 border-white/10 text-white placeholder:text-white/25"
            />
          </div>
          <Button
            type="button"
            disabled={fixCredentialMutation.isPending || fixEmail.trim().length === 0}
            className="bg-amber-700 hover:bg-amber-600"
            onClick={() => fixCredentialMutation.mutate(fixEmail.trim())}
          >
            <Wrench size={14} className="mr-1.5" />
            {fixCredentialMutation.isPending ? "Fixing…" : "Fix login"}
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
        <div className="text-white/30 text-sm">{filtered.length} platform admin{filtered.length === 1 ? "" : "s"}</div>
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
                Platform admin
              </TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Joined</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider text-right">Actions</TableHead>
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
                  {search ? "No platform admins match your search" : "No platform admins yet"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((user) => {
                const busy = toggleAdminMutation.isPending || deleteUserMutation.isPending;
                const isProtected = user.email.toLowerCase() === "tumsen@gmail.com";
                return (
                  <TableRow key={user.id} className="border-white/5 hover:bg-white/[0.02]">
                    <TableCell>
                      <span className="text-white/80">{user.name ?? "—"}</span>
                    </TableCell>
                    <TableCell className="text-white/50">
                      {editingId === user.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            autoFocus
                            type="email"
                            value={editEmailVal}
                            onChange={(e) => setEditEmailVal(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") changeEmailMutation.mutate({ userId: user.id, email: editEmailVal });
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="h-7 py-0 px-2 text-sm bg-gray-900 border-white/20 text-white w-52"
                          />
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-400 hover:text-emerald-300"
                            disabled={changeEmailMutation.isPending}
                            onClick={() => changeEmailMutation.mutate({ userId: user.id, email: editEmailVal })}>
                            <Check size={13} />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-white/30 hover:text-white/60"
                            onClick={() => setEditingId(null)}>
                            <X size={13} />
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="flex items-center gap-1.5 group hover:text-white/80 transition-colors"
                          onClick={() => { setEditingId(user.id); setEditEmailVal(user.email); }}
                        >
                          {user.email}
                          <Pencil size={11} className="opacity-0 group-hover:opacity-40 transition-opacity" />
                        </button>
                      )}
                    </TableCell>
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
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={fixCredentialMutation.isPending}
                          title="Fix login — consolidates duplicate credential rows so password works after reset"
                          className="text-amber-400 hover:text-amber-300 hover:bg-amber-950/30 disabled:opacity-40"
                          onClick={() => fixCredentialMutation.mutate(user.email)}
                        >
                          <Wrench size={14} className="mr-1.5" />
                          Fix login
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy || isProtected}
                          className="text-red-300 hover:text-red-200 hover:bg-red-950/30 disabled:opacity-40"
                          onClick={() => {
                            if (!confirmDeleteAction(user.email)) return;
                            deleteUserMutation.mutate(user.id);
                          }}
                        >
                          <Trash2 size={14} className="mr-1.5" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {session?.user?.id ? (
        <p className="text-xs text-white/35 max-w-2xl">
          To revoke your own platform admin access, turn off the switch on your row — unless you are the only platform admin,
          add another first. Delete requires typing <span className="text-white/60">DELETE</span>.
          The protected account <span className="text-white/60">tumsen@gmail.com</span> cannot be deleted.
        </p>
      ) : null}
    </div>
  );
}
