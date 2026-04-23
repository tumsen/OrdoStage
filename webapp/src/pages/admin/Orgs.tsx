import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, isApiError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

interface OrgSummary {
  id: string;
  name: string;
  creditBalance: number;
  unlimitedCredits?: boolean;
  discountPercent: number;
  freeTrialUsed: boolean;
  createdAt: string;
  totalPurchasedDays: number;
  totalPurchasedCents: number;
  _count: { users: number; events: number; people: number; memberships?: number };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CreditBadge({ balance, unlimited }: { balance: number; unlimited?: boolean }) {
  if (unlimited) {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
        ∞
      </span>
    );
  }
  if (balance <= 0) {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-red-950/60 text-red-400 border border-red-800/40">
        {balance}d
      </span>
    );
  }
  if (balance <= 30) {
    return (
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-950/60 text-amber-400 border border-amber-800/40">
        {balance}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-green-950/60 text-green-400 border border-green-800/40">
      {balance}d
    </span>
  );
}

export default function Orgs() {
  const [search, setSearch] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgAdminEmail, setNewOrgAdminEmail] = useState("");
  const queryClient = useQueryClient();

  const { data: orgs, isPending } = useQuery<OrgSummary[]>({
    queryKey: ["admin", "orgs"],
    queryFn: () => api.get<OrgSummary[]>("/api/admin/orgs"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/orgs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orgs"] });
      toast({ title: "Organization deleted" });
    },
    onError: () => toast({ title: "Failed to delete organization", variant: "destructive" }),
  });

  const createOrgMutation = useMutation({
    mutationFn: (payload: { name: string; ownerEmail?: string }) =>
      api.post<{ organization: { id: string; name: string }; warning?: string | null }>("/api/admin/orgs", payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "orgs"] });
      setNewOrgName("");
      setNewOrgAdminEmail("");
      toast({
        title: "Organization created",
        description: data.warning ?? undefined,
      });
    },
    onError: (err) =>
      toast({
        title: "Failed to create organization",
        description: isApiError(err) ? err.message : undefined,
        variant: "destructive",
      }),
  });

  const filtered = (orgs ?? []).filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-4">
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-3 max-w-2xl">
        <h3 className="text-sm font-semibold text-white">Create organization</h3>
        <p className="text-xs text-white/45">
          Create a new organization and optionally grant org admin (owner role) to an existing user email.
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          <Input
            placeholder="Organization name"
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            className="bg-gray-900 border-white/10 text-white placeholder:text-white/30"
          />
          <Input
            placeholder="Org admin email (optional)"
            type="email"
            value={newOrgAdminEmail}
            onChange={(e) => setNewOrgAdminEmail(e.target.value)}
            className="bg-gray-900 border-white/10 text-white placeholder:text-white/30"
          />
        </div>
        <div>
          <Button
            className="bg-rose-700 hover:bg-rose-600"
            disabled={createOrgMutation.isPending || newOrgName.trim().length === 0}
            onClick={() =>
              createOrgMutation.mutate({
                name: newOrgName.trim(),
                ownerEmail: newOrgAdminEmail.trim() || undefined,
              })
            }
          >
            {createOrgMutation.isPending ? "Creating..." : "Create organization"}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <Input
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-gray-900 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-rose-500/30"
          />
        </div>
        <div className="text-white/30 text-sm">{filtered.length} organizations</div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-white/10 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Organization Name</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Users</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">People</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Events</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Credits</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Discount</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Purchased</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Free Trial</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider">Created</TableHead>
              <TableHead className="text-white/40 font-medium text-xs uppercase tracking-wider text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-white/5">
                  {Array.from({ length: 10 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 bg-white/5 rounded animate-pulse" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow className="border-white/5">
                <TableCell colSpan={10} className="text-center text-white/30 py-12">
                  {search ? "No organizations match your search" : "No organizations yet"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((org) => (
                <TableRow key={org.id} className="border-white/5 hover:bg-white/[0.02]">
                  <TableCell className="font-medium text-white/80">{org.name}</TableCell>
                  <TableCell className="text-white/50">
                    {org._count.memberships ?? org._count.users}
                  </TableCell>
                  <TableCell className="text-white/50">{org._count.people}</TableCell>
                  <TableCell className="text-white/50">{org._count.events}</TableCell>
                  <TableCell>
                    <CreditBadge balance={org.creditBalance} unlimited={org.unlimitedCredits} />
                  </TableCell>
                  <TableCell className="text-white/50">
                    {org.discountPercent > 0 ? `${org.discountPercent}%` : "—"}
                  </TableCell>
                  <TableCell className="text-white/50 text-sm">
                    {org.totalPurchasedDays}d / €{(org.totalPurchasedCents / 100).toFixed(0)}
                  </TableCell>
                  <TableCell>
                    {org.freeTrialUsed ? (
                      <Badge className="bg-white/5 text-white/40 border-white/10 text-xs">Used</Badge>
                    ) : (
                      <Badge className="bg-blue-950/60 text-blue-400 border-blue-800/40 text-xs">Available</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-white/40 text-sm">{formatDate(org.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="border-white/10 text-white/60 hover:bg-white/5 hover:text-white text-xs"
                      >
                        <Link to={`/admin/orgs/${org.id}`}>Manage</Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-900/50 text-red-400/80 hover:bg-red-950/40 hover:text-red-300 text-xs px-2"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          const expected = `DELETE ${org.name}`;
                          const typed = window.prompt(
                            `DO YOU WANT TO DELETE "${org.name}"?\n\nType exactly:\n${expected}`
                          );
                          if (!typed) return;
                          if (typed.trim() !== expected) {
                            toast({
                              title: "Delete cancelled",
                              description: `Type exactly: ${expected}`,
                              variant: "destructive",
                            });
                            return;
                          }
                          deleteMutation.mutate(org.id);
                        }}
                        title="Delete organization"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
