import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import type {
  Department,
  Person,
  Production,
  ProductionPerson,
  ProductionPlannerRow,
  ProductionTeam,
} from "@/lib/types";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const NONE = "__none__";

export function ProductionCrewPanel({
  row,
  productionId,
  plannerQueryKey,
  canEdit,
}: {
  row: ProductionPlannerRow | null;
  productionId: string | null;
  plannerQueryKey: unknown[];
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [personRole, setPersonRole] = useState("");

  const { data: allTeams } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Department[]>("/api/departments"),
  });

  const { data: allPeople } = useQuery({
    queryKey: ["people"],
    queryFn: () => api.get<Person[]>("/api/people"),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: plannerQueryKey });
    queryClient.invalidateQueries({ queryKey: ["productions"] });
  };

  const updateLeadMutation = useMutation({
    mutationFn: (leadPersonId: string | null) =>
      api.patch<Production>(`/api/productions/${productionId}`, { leadPersonId }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Production lead updated" });
    },
    onError: (e) =>
      toast({
        title: e instanceof Error ? e.message : "Could not update lead",
        variant: "destructive",
      }),
  });

  const assignTeamMutation = useMutation({
    mutationFn: (teamId: string) =>
      api.post<ProductionTeam>(`/api/productions/${productionId}/teams`, { teamId }),
    onSuccess: () => {
      invalidate();
      setAddTeamOpen(false);
      setSelectedTeamId("");
      toast({ title: "Team added" });
    },
    onError: (e) =>
      toast({
        title: e instanceof Error ? e.message : "Could not add team",
        variant: "destructive",
      }),
  });

  const addPersonMutation = useMutation({
    mutationFn: ({ personId, role }: { personId: string; role?: string }) =>
      api.post<ProductionPerson>(`/api/productions/${productionId}/people`, {
        personId,
        role: role?.trim() || undefined,
      }),
    onSuccess: () => {
      invalidate();
      setAddPersonOpen(false);
      setSelectedPersonId("");
      setPersonRole("");
      toast({ title: "Person added" });
    },
    onError: (e) =>
      toast({
        title: e instanceof Error ? e.message : "Could not add person",
        variant: "destructive",
      }),
  });

  const removeTeamMutation = useMutation({
    mutationFn: (teamId: string) => api.delete(`/api/productions/${productionId}/teams/${teamId}`),
    onSuccess: invalidate,
  });

  const removePersonMutation = useMutation({
    mutationFn: (personId: string) =>
      api.delete(`/api/productions/${productionId}/people/${personId}`),
    onSuccess: invalidate,
  });

  if (!row || !productionId) {
    return (
      <div className="rounded-xl border border-white/10 bg-[#12121a]/60 p-6 text-center text-sm text-white/40">
        Select a production to manage crew.
      </div>
    );
  }

  const assignedTeamIds = new Set(row.teams.map((t) => t.teamId));
  const availableTeams = (allTeams ?? []).filter((t) => !assignedTeamIds.has(t.id));
  const onProductionPersonIds = new Set(row.people.map((p) => p.personId));
  const availablePeople = (allPeople ?? []).filter((p) => !onProductionPersonIds.has(p.id));

  return (
    <div className="rounded-xl border border-white/10 bg-[#12121a]/80 flex flex-col min-h-0 overflow-hidden flex-1">
      <div className="px-4 py-3 border-b border-white/10 shrink-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Crew</p>
        <p className="text-sm font-medium text-white truncate">{row.title}</p>
      </div>

      <div className="p-4 space-y-5 overflow-y-auto flex-1">
        <div className="space-y-1.5">
          <Label className="text-white/60 text-xs flex items-center gap-1.5">
            <UserRound className="h-3.5 w-3.5" />
            Production lead
          </Label>
          <Select
            value={row.leadPersonId ?? NONE}
            onValueChange={(v) => updateLeadMutation.mutate(v === NONE ? null : v)}
            disabled={!canEdit || updateLeadMutation.isPending}
          >
            <SelectTrigger className="bg-white/5 border-white/10">
              <SelectValue placeholder="Select lead" />
            </SelectTrigger>
            <SelectContent className="bg-[#16161f] border-white/10">
              <SelectItem value={NONE}>None</SelectItem>
              {(allPeople ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-white/50 uppercase tracking-wide">Teams</span>
            {canEdit ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs border-white/10"
                onClick={() => setAddTeamOpen(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            ) : null}
          </div>
          {row.teams.length === 0 ? (
            <p className="text-xs text-white/30">No teams assigned.</p>
          ) : (
            <ul className="space-y-1.5">
              {row.teams.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-white/8 bg-white/[0.03] px-2.5 py-1.5"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: t.team.color }}
                    />
                    <span className="text-sm text-white/85 truncate">{t.team.name}</span>
                  </span>
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400/60 shrink-0"
                      onClick={() => removeTeamMutation.mutate(t.teamId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-white/50 uppercase tracking-wide">People</span>
            {canEdit ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs border-white/10"
                onClick={() => setAddPersonOpen(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            ) : null}
          </div>
          {row.people.length === 0 ? (
            <p className="text-xs text-white/30">No people assigned.</p>
          ) : (
            <ul className="space-y-1.5">
              {row.people.map((pp) => (
                <li
                  key={pp.id}
                  className="flex items-start justify-between gap-2 rounded-md border border-white/8 bg-white/[0.03] px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white/85 truncate">{pp.person.name}</p>
                    <p className="text-[10px] text-white/35 truncate">
                      {pp.role ?? pp.person.role ?? "—"}
                      {pp.person.phone ? ` · ${pp.person.phone}` : ""}
                    </p>
                  </div>
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400/60 shrink-0"
                      onClick={() => removePersonMutation.mutate(pp.personId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Dialog open={addTeamOpen} onOpenChange={setAddTeamOpen}>
        <DialogContent className="bg-[#16161f] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Add team</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-white/60 text-xs">Team</Label>
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger className="bg-white/5 border-white/10">
                <SelectValue placeholder="Select team" />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10">
                {availableTeams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-white/35">
              All team members are added to the production roster.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddTeamOpen(false)} className="border-white/10">
              Cancel
            </Button>
            <Button
              disabled={!selectedTeamId || assignTeamMutation.isPending}
              onClick={() => assignTeamMutation.mutate(selectedTeamId)}
            >
              Add team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addPersonOpen} onOpenChange={setAddPersonOpen}>
        <DialogContent className="bg-[#16161f] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Add person</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-white/60 text-xs">Person</Label>
              <Select value={selectedPersonId} onValueChange={setSelectedPersonId}>
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue placeholder="Select person" />
                </SelectTrigger>
                <SelectContent className="bg-[#16161f] border-white/10">
                  {availablePeople.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-white/60 text-xs">Role (optional)</Label>
              <Input
                value={personRole}
                onChange={(e) => setPersonRole(e.target.value)}
                placeholder="e.g. Stage manager"
                className="bg-white/5 border-white/10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPersonOpen(false)} className="border-white/10">
              Cancel
            </Button>
            <Button
              disabled={!selectedPersonId || addPersonMutation.isPending}
              onClick={() =>
                addPersonMutation.mutate({ personId: selectedPersonId, role: personRole })
              }
            >
              Add person
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
