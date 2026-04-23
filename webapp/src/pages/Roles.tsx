import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { KeyRound, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { api, isApiError } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { confirmDeleteAction } from "@/lib/deleteConfirm";

type Catalog = {
  views: { id: string; label: string; path: string }[];
  actions: { id: string; label: string; group: string }[];
};

type RoleRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  views: string[];
  actions: string[];
  sortOrder: number;
  isSystem: boolean;
  assignedUserCount: number;
};

const GROUP_LABEL: Record<string, string> = {
  content: "Production & content",
  team: "Team",
  billing: "Billing",
  organization: "Organization",
  account: "Account",
};

export default function Roles() {
  const queryClient = useQueryClient();
  const { isOwner } = usePermissions();

  const { data: catalog } = useQuery({
    queryKey: ["role-definitions", "catalog"],
    queryFn: () => api.get<Catalog>("/api/org/role-definitions/catalog"),
  });

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ["role-definitions"],
    queryFn: () => api.get<RoleRow[]>("/api/org/role-definitions"),
  });

  const [mode, setMode] = useState<"closed" | "new" | "edit">("closed");
  const [editRow, setEditRow] = useState<RoleRow | null>(null);
  const [newName, setNewName] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftViews, setDraftViews] = useState<string[]>([]);
  const [draftActions, setDraftActions] = useState<string[]>([]);

  useEffect(() => {
    if (mode === "edit" && editRow) {
      setDraftName(editRow.name);
      setDraftViews([...editRow.views]);
      setDraftActions([...editRow.actions]);
    }
    if (mode === "new" && catalog) {
      setNewName("");
      setDraftViews(catalog.views.map((v) => v.id));
      setDraftActions([]);
    }
  }, [mode, editRow, catalog]);

  function openEdit(r: RoleRow) {
    setEditRow(r);
    setMode("edit");
  }

  function openCreate() {
    setEditRow(null);
    setMode("new");
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (mode === "new") {
        const slug = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "role";
        await api.post("/api/org/role-definitions", {
          slug,
          name: newName.trim() || slug,
          views: draftViews,
          actions: draftActions,
        });
      } else if (mode === "edit" && editRow) {
        await api.patch(`/api/org/role-definitions/${editRow.id}`, {
          name: draftName.trim() || editRow.slug,
          description: editRow.description,
          views: draftViews,
          actions: draftActions,
          sortOrder: editRow.sortOrder,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-definitions"] });
      queryClient.invalidateQueries({ queryKey: ["me", "permissions"] });
      setMode("closed");
      setEditRow(null);
      toast({ title: "Saved" });
    },
    onError: (e: unknown) => {
      toast({
        title: isApiError(e) ? e.message : "Could not save",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/org/role-definitions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["role-definitions"] });
      toast({ title: "Role removed" });
    },
    onError: (e: unknown) => {
      toast({
        title: isApiError(e) ? e.message : "Could not delete",
        variant: "destructive",
      });
    },
  });

  function toggle(arr: string[], id: string, on: boolean): string[] {
    const s = new Set(arr);
    if (on) s.add(id);
    else s.delete(id);
    return [...s];
  }

  const actionGroups =
    catalog?.actions.reduce<Record<string, typeof catalog.actions>>((acc, a) => {
      acc[a.group] = acc[a.group] ?? [];
      acc[a.group].push(a);
      return acc;
    }, {}) ?? {};

  const dialogOpen = mode !== "closed";

  const permissionsForm =
    catalog ? (
      <div className="overflow-y-auto flex-1 space-y-4 max-h-[58vh] pr-1">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-white/35 mb-2">Can see</p>
          <div className="space-y-2 rounded-md border border-white/10 p-3 bg-white/[0.02]">
            {catalog.views.map((v) => (
              <label key={v.id} className="flex items-center gap-2 text-sm text-white/75 cursor-pointer">
                <Checkbox
                  checked={draftViews.includes(v.id)}
                  onCheckedChange={(ch) => setDraftViews(toggle(draftViews, v.id, ch === true))}
                />
                <span>{v.label}</span>
              </label>
            ))}
          </div>
        </div>
        {Object.entries(actionGroups).map(([group, items]) => (
          <div key={group}>
            <p className="text-[10px] uppercase tracking-wide text-white/35 mb-2">
              {GROUP_LABEL[group] ?? group}
            </p>
            <div className="space-y-2 rounded-md border border-white/10 p-3 bg-white/[0.02]">
              {items.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm text-white/75 cursor-pointer">
                  <Checkbox
                    checked={draftActions.includes(a.id)}
                    onCheckedChange={(ch) =>
                      setDraftActions(toggle(draftActions, a.id, ch === true))
                    }
                  />
                  <span>{a.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <p className="text-white/40 text-sm py-4">Loading catalog…</p>
    );

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-white/90">
            <KeyRound className="w-5 h-5 text-red-400/90" />
            <h1 className="text-lg font-semibold">Roles</h1>
          </div>
          <p className="text-sm text-white/40 mt-1 max-w-xl">
            Define what each role can <strong className="text-white/55">see</strong> in the sidebar and what they can{" "}
            <strong className="text-white/55">do</strong> in the app. Built-in roles can be tuned; add custom roles and assign
            them from the Team page.
          </p>
        </div>
        {isOwner ? (
          <Button
            size="sm"
            onClick={openCreate}
            className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50 gap-2 shrink-0"
          >
            <Plus size={14} /> Add role
          </Button>
        ) : null}
      </div>

      {!isOwner ? (
        <p className="text-sm text-amber-200/80 border border-amber-500/25 rounded-lg px-4 py-3 bg-amber-950/20">
          Only the <strong className="text-amber-100">organization owner</strong> can create or edit role definitions.
        </p>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 text-white/40 text-sm py-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading roles…
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] divide-y divide-white/5">
          {roles.map((r) => (
            <div key={r.id} className="px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-white font-medium">{r.name}</span>
                  <code className="text-[11px] text-white/35 bg-white/5 px-1.5 py-0.5 rounded">{r.slug}</code>
                  {r.isSystem ? (
                    <span className="text-[10px] uppercase tracking-wide text-white/35 border border-white/10 rounded px-1.5 py-0.5">
                      System
                    </span>
                  ) : null}
                  {r.assignedUserCount > 0 ? (
                    <span className="text-[11px] text-white/40">
                      {r.assignedUserCount} user{r.assignedUserCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
                {r.description ? (
                  <p className="text-xs text-white/35 mt-1">{r.description}</p>
                ) : null}
                <p className="text-[10px] text-white/25 mt-2">
                  <span className="text-white/40">See:</span> {r.views.length} areas ·{" "}
                  <span className="text-white/40">Do:</span> {r.actions.length} actions
                </p>
              </div>
              {isOwner ? (
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" className="border-white/15" onClick={() => openEdit(r)}>
                    <Pencil size={13} className="mr-1.5" /> Edit
                  </Button>
                  {!r.isSystem ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white/35 hover:text-red-400"
                      disabled={deleteMutation.isPending || r.assignedUserCount > 0}
                      title={r.assignedUserCount > 0 ? "Reassign users first" : "Delete role"}
                      onClick={() => {
                        if (r.assignedUserCount > 0) return;
                        if (!confirmDeleteAction(`role "${r.name}"`)) return;
                        deleteMutation.mutate(r.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setMode("closed");
            setEditRow(null);
          }
        }}
      >
        <DialogContent className="bg-[#16161f] border-white/10 text-white max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{mode === "new" ? "New role" : `Edit ${editRow?.name ?? ""}`}</DialogTitle>
          </DialogHeader>

          {mode === "new" ? (
            <div className="space-y-3 py-1 shrink-0">
              <div>
                <Label className="text-white/50 text-xs">Role name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Producer"
                  className="bg-white/5 border-white/10 mt-1"
                  autoFocus
                />
                {newName.trim() ? (
                  <p className="text-[11px] text-white/30 mt-1">
                    Slug: <code className="text-white/45">{newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}</code>
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {mode === "edit" ? (
            <div className="shrink-0">
              <Label className="text-white/50 text-xs">Display name</Label>
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="bg-white/5 border-white/10 mt-1"
              />
            </div>
          ) : null}

          {permissionsForm}

          <DialogFooter className="gap-2 sm:gap-0 shrink-0">
            <Button
              variant="outline"
              className="border-white/10"
              onClick={() => {
                setMode("closed");
                setEditRow(null);
              }}
            >
              Cancel
            </Button>
            {isOwner ? (
              <Button
                className="bg-red-900 hover:bg-red-800"
                disabled={saveMutation.isPending || (mode === "new" && !newName.trim())}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
