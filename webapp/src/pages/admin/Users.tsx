import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search } from "lucide-react";

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

  const { data: users, isPending } = useQuery<AdminUser[]>({
    queryKey: ["admin", "users"],
    queryFn: () => api.get<AdminUser[]>("/api/admin/users"),
  });

  const filtered = (users ?? []).filter((u) => {
    const q = search.toLowerCase();
    return (
      (u.name?.toLowerCase().includes(q) ?? false) ||
      u.email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-4">
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
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Role</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-white/5">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-white/5 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow className="border-white/5">
                <TableCell colSpan={5} className="text-center text-white/30 py-12">
                  {search ? "No users match your search" : "No users yet"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((user) => (
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
                  <TableCell className="text-white/40 text-sm">{formatDate(user.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
