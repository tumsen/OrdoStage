import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, ArrowRightLeft, FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";
import { format, parseISO } from "date-fns";

import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "@/hooks/use-toast";
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
import { cn } from "@/lib/utils";
import { displayHex } from "@/lib/timeCatalogColors";
import { timeCategoryMessageId } from "@/lib/timeCategoryI18n";
import type {
  TimeCategory,
  TimeParentCategory,
  TimeParentCategoryCatalog,
  TimeProject,
  TimeProjectEntriesResponse,
} from "@/contracts/backendTypes";

type CatalogProject = TimeParentCategoryCatalog["projects"][number];

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (m === 0) return `${h}t`;
  return `${h}t ${m}m`;
}

export default function TimeParentCategoryCatalog() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { canAction } = usePermissions();
  const canManage = canAction("time.manage_catalog");

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [reassignToProjectId, setReassignToProjectId] = useState("");
  const [moveToProjectId, setMoveToProjectId] = useState("");
  const [moveToCategoryId, setMoveToCategoryId] = useState("");
  const [renameTarget, setRenameTarget] = useState<
    null | { kind: "category" | "project"; id: string; name: string }
  >(null);
  const [renameValue, setRenameValue] = useState("");

  const { data: catalog, isLoading } = useQuery({
    queryKey: ["time-parent-category-catalog"],
    queryFn: () => api.get<TimeParentCategoryCatalog>("/api/time/parent-category-catalog"),
    enabled: canManage,
  });

  const categories = useMemo(() => catalog?.categories ?? [], [catalog?.categories]);
  const allProjects = useMemo(() => catalog?.projects ?? [], [catalog?.projects]);
  const selectedCategory =
    categories.find((c) => c.id === selectedCategoryId) ?? categories[0] ?? null;
  const activeCategoryId = selectedCategory?.id ?? null;

  useEffect(() => {
    if (!selectedCategoryId && categories[0]) setSelectedCategoryId(categories[0].id);
  }, [categories, selectedCategoryId]);

  const projectsInCategory = useMemo(() => {
    if (!activeCategoryId) return [] as CatalogProject[];
    return allProjects.filter((p) => p.timeParentCategoryId === activeCategoryId);
  }, [allProjects, activeCategoryId]);

  const unassignedProjects = useMemo(
    () => allProjects.filter((p) => !p.timeParentCategoryId),
    [allProjects]
  );

  const selectedProject =
    allProjects.find((p) => p.id === selectedProjectId) ?? null;

  useEffect(() => {
    if (!selectedProject) {
      setMoveToCategoryId("");
      return;
    }
    setMoveToCategoryId(selectedProject.timeParentCategoryId ?? "__none__");
  }, [selectedProject]);

  const { data: projectEntries, isLoading: entriesLoading } = useQuery({
    queryKey: ["time-project-entries", selectedProjectId],
    queryFn: () =>
      api.get<TimeProjectEntriesResponse>(
        `/api/time/projects/${selectedProjectId}/entries?limit=400`
      ),
    enabled: canManage && Boolean(selectedProjectId),
  });

  const { data: deleteUsage } = useQuery({
    queryKey: ["time-project-usage", deleteProjectId],
    queryFn: () =>
      api.get<{ count: number }>(`/api/time/projects/${deleteProjectId}/usage`),
    enabled: canManage && Boolean(deleteProjectId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["time-parent-category-catalog"] });
    queryClient.invalidateQueries({ queryKey: ["time-projects"] });
    queryClient.invalidateQueries({ queryKey: ["time-project-entries"] });
    queryClient.invalidateQueries({ queryKey: ["time-entries"] });
  };

  const addCategory = useMutation({
    mutationFn: (name: string) => api.post<TimeParentCategory>("/api/time/parent-categories", { name }),
    onSuccess: (row) => {
      invalidate();
      setSelectedCategoryId(row.id);
      setNewCategoryName("");
      toast({ title: t("time.parentCategoryAdded") });
    },
    onError: () => toast({ title: t("time.catalogSaveError"), variant: "destructive" }),
  });

  const addProject = useMutation({
    mutationFn: (vars: { name: string; timeParentCategoryId: string }) =>
      api.post<TimeProject>("/api/time/projects", vars),
    onSuccess: (row) => {
      invalidate();
      setNewProjectName("");
      setSelectedProjectId(row.id);
      toast({ title: t("time.catalogProjectAdded") });
    },
    onError: () => toast({ title: t("time.catalogSaveError"), variant: "destructive" }),
  });

  const renameCategory = useMutation({
    mutationFn: (vars: { id: string; name: string }) =>
      api.patch<TimeParentCategory>(`/api/time/parent-categories/${vars.id}`, {
        name: vars.name,
      }),
    onSuccess: () => {
      invalidate();
      setRenameTarget(null);
      setRenameValue("");
      toast({ title: t("time.catalogCategoryRenamed") });
    },
    onError: () => toast({ title: t("time.catalogSaveError"), variant: "destructive" }),
  });

  const renameProject = useMutation({
    mutationFn: (vars: { id: string; name: string }) =>
      api.patch<TimeProject>(`/api/time/projects/${vars.id}`, { name: vars.name }),
    onSuccess: () => {
      invalidate();
      setRenameTarget(null);
      setRenameValue("");
      toast({ title: t("time.catalogProjectRenamed") });
    },
    onError: () => toast({ title: t("time.catalogSaveError"), variant: "destructive" }),
  });

  const openRename = (kind: "category" | "project", id: string, name: string) => {
    setRenameTarget({ kind, id, name });
    setRenameValue(name);
  };

  const submitRename = () => {
    const next = renameValue.trim();
    if (!renameTarget || !next || next === renameTarget.name) return;
    if (renameTarget.kind === "category") {
      renameCategory.mutate({ id: renameTarget.id, name: next });
      return;
    }
    renameProject.mutate({ id: renameTarget.id, name: next });
  };

  const linkProject = useMutation({
    mutationFn: (vars: {
      type: "event" | "tour" | "project";
      id: string;
      timeParentCategoryId: string | null;
    }) =>
      api.patch("/api/time/parent-category-link", {
        type: vars.type,
        id: vars.id,
        timeParentCategoryId: vars.timeParentCategoryId,
      }),
    onSuccess: (_data, vars) => {
      invalidate();
      setSelectedCategoryId(vars.timeParentCategoryId ?? "__unassigned__");
      toast({ title: t("time.catalogProjectMovedToCategory") });
    },
    onError: () => toast({ title: t("time.catalogSaveError"), variant: "destructive" }),
  });

  const canMoveSelectedProject =
    Boolean(selectedProject) &&
    !selectedProject?.systemKey?.startsWith("leave_") &&
    categories.length > 0;

  const selectedProjectCategoryChanged = Boolean(
    selectedProject &&
      moveToCategoryId &&
      (selectedProject.timeParentCategoryId ?? "__none__") !== moveToCategoryId
  );

  const moveTargets = useMemo(() => {
    const excludeId = selectedProjectId ?? deleteProjectId;
    return allProjects.filter((p) => p.id !== excludeId && !p.isArchived);
  }, [allProjects, selectedProjectId, deleteProjectId]);

  const moveAllEntries = useMutation({
    mutationFn: (vars: { fromId: string; toProjectId: string }) =>
      api.post<{
        ok: boolean;
        reassignedEntries: number;
        reassignedTravelClaims: number;
        reassignedMileageClaims: number;
      }>(`/api/time/projects/${vars.fromId}/reassign-entries`, {
        toProjectId: vars.toProjectId,
      }),
    onSuccess: (data) => {
      invalidate();
      setMoveToProjectId("");
      toast({
        title: t("time.catalogEntriesMoved"),
        description: t("time.catalogProjectReassigned", {
          count:
            data.reassignedEntries + data.reassignedTravelClaims + data.reassignedMileageClaims,
        }),
      });
    },
    onError: () => toast({ title: t("time.catalogSaveError"), variant: "destructive" }),
  });

  const deleteProject = useMutation({
    mutationFn: (vars: { id: string; reassignToProjectId?: string }) =>
      api.deleteWithBody<{
        ok: boolean;
        reassignedEntries: number;
        reassignedTravelClaims: number;
        reassignedMileageClaims: number;
      }>(`/api/time/projects/${vars.id}`, {
        ...(vars.reassignToProjectId
          ? { reassignToProjectId: vars.reassignToProjectId }
          : {}),
      }),
    onSuccess: (data) => {
      invalidate();
      if (selectedProjectId === deleteProjectId) setSelectedProjectId(null);
      setDeleteProjectId(null);
      setReassignToProjectId("");
      const moved =
        data.reassignedEntries + data.reassignedTravelClaims + data.reassignedMileageClaims;
      toast({
        title: t("time.catalogProjectDeleted"),
        ...(moved > 0
          ? { description: t("time.catalogProjectReassigned", { count: moved }) }
          : {}),
      });
    },
    onError: () => toast({ title: t("time.catalogSaveError"), variant: "destructive" }),
  });

  if (!canManage) {
    return <Navigate to="/time" replace />;
  }

  const deleteTarget = allProjects.find((p) => p.id === deleteProjectId) ?? null;
  const deleteTargetHasEntries =
    (deleteUsage?.count ?? deleteTarget?.entryCount ?? 0) > 0;
  const selectedHasEntries =
    (projectEntries?.totalCount ?? selectedProject?.entryCount ?? 0) > 0;

  const renderProjectRow = (p: CatalogProject) => {
    const isSelected = selectedProjectId === p.id;
    const kindLabel = p.eventId
      ? t("time.parentCategoryAutoEvent")
      : p.tourId
        ? t("time.parentCategoryLinkedTour")
        : p.systemKey === "unassigned_hours"
          ? t("time.catalogUnassignedHoursProject")
          : t("time.parentCategoryStandaloneProject");
    return (
      <li key={p.id}>
        <button
          type="button"
          onClick={() => setSelectedProjectId(p.id)}
          className={cn(
            "flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
            isSelected
              ? "border-indigo-400/40 bg-indigo-500/15 text-white"
              : "border-white/10 bg-white/[0.03] text-white/85 hover:bg-white/[0.06]"
          )}
        >
          <span
            className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/15"
            style={{ backgroundColor: displayHex(p.color, p.id) }}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{p.name}</span>
            <span className="mt-0.5 block text-[10px] text-white/45">
              {kindLabel} · {p.entryCount} {t("time.catalogEntryCount")} ·{" "}
              {formatMinutes(p.totalMinutes)}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          to="/time"
          className="mb-2 inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white/70"
        >
          <ArrowLeft size={14} />
          {t("time.backToTime")}
        </Link>
        <h1 className="text-xl font-semibold text-white">{t("time.parentCategoryPageTitle")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-white/50">{t("time.parentCategoryPageHint")}</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-white/45">{t("time.parentCategoryLoading")}</p>
      ) : (
        <div className="grid min-h-[32rem] gap-4 lg:grid-cols-[minmax(0,15rem)_minmax(0,18rem)_minmax(0,1fr)]">
          {/* Categories */}
          <aside className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
              {t("time.parentCategoriesHeading")}
            </Label>
            <div className="mt-2 flex gap-2">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder={t("time.parentCategoryPlaceholder")}
                className="h-9 border-white/10 bg-white/5 text-white"
              />
              <Button
                type="button"
                size="icon"
                className="h-9 w-9 shrink-0 bg-indigo-700 hover:bg-indigo-600"
                disabled={!newCategoryName.trim() || addCategory.isPending}
                onClick={() => addCategory.mutate(newCategoryName.trim())}
              >
                <Plus size={16} />
              </Button>
            </div>
            <ul className="mt-3 space-y-1">
              {categories.map((cat) => {
                const count = allProjects.filter((p) => p.timeParentCategoryId === cat.id).length;
                const isActive = activeCategoryId === cat.id && selectedCategoryId !== "__unassigned__";
                return (
                  <li key={cat.id} className="group flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCategoryId(cat.id);
                        setSelectedProjectId(null);
                      }}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors",
                        isActive
                          ? "border-white/25 bg-white/[0.08] text-white"
                          : "border-transparent text-white/70 hover:bg-white/[0.04]"
                      )}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/15"
                        style={{ backgroundColor: displayHex(cat.color, cat.id) }}
                      />
                      <span className="min-w-0 flex-1 truncate">{cat.name}</span>
                      <span className="shrink-0 tabular-nums text-[10px] text-white/40">{count}</span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-white/40 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
                      title={t("time.catalogRenameCategory")}
                      onClick={() => openRename("category", cat.id, cat.name)}
                    >
                      <Pencil size={14} />
                    </Button>
                  </li>
                );
              })}
              {unassignedProjects.length > 0 ? (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategoryId("__unassigned__");
                      setSelectedProjectId(null);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors",
                      selectedCategoryId === "__unassigned__"
                        ? "border-amber-400/35 bg-amber-500/10 text-amber-50"
                        : "border-transparent text-amber-100/70 hover:bg-amber-500/[0.06]"
                    )}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400/70" />
                    <span className="min-w-0 flex-1 truncate">
                      {t("time.parentCategoryUnassignedHeading")}
                    </span>
                    <span className="shrink-0 tabular-nums text-[10px] text-white/40">
                      {unassignedProjects.length}
                    </span>
                  </button>
                </li>
              ) : null}
            </ul>
          </aside>

          {/* Projects in category */}
          <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            {selectedCategoryId === "__unassigned__" ? (
              <>
                <h2 className="text-sm font-medium text-white">
                  {t("time.parentCategoryUnassignedHeading")}
                </h2>
                <p className="mt-1 text-xs text-white/45">{t("time.parentCategoryUnassignedHint")}</p>
                <ul className="mt-3 space-y-1.5">
                  {unassignedProjects.map(renderProjectRow)}
                </ul>
                {activeCategoryId && activeCategoryId !== "__unassigned__" ? null : (
                  <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
                      {t("time.parentCategoryLinkProject")}
                    </p>
                    {unassignedProjects.length > 0 && categories.length > 0 ? (
                      <p className="text-[11px] text-white/40">
                        {t("time.catalogAssignFromUnassignedHint")}
                      </p>
                    ) : null}
                  </div>
                )}
              </>
            ) : selectedCategory ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-sm font-medium text-white">{selectedCategory.name}</h2>
                    <p className="mt-1 text-xs text-white/45">{t("time.parentCategoryProjectsHint")}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-white/45 hover:bg-white/10 hover:text-white"
                    title={t("time.catalogRenameCategory")}
                    onClick={() =>
                      openRename("category", selectedCategory.id, selectedCategory.name)
                    }
                  >
                    <Pencil size={14} />
                  </Button>
                </div>
                <div className="mt-3 flex gap-2">
                  <Input
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder={t("time.projectPlaceholder")}
                    className="h-9 border-white/10 bg-white/5 text-white"
                  />
                  <Button
                    type="button"
                    className="shrink-0 bg-indigo-700 hover:bg-indigo-600"
                    disabled={!newProjectName.trim() || addProject.isPending}
                    onClick={() => {
                      if (!activeCategoryId) return;
                      addProject.mutate({
                        name: newProjectName.trim(),
                        timeParentCategoryId: activeCategoryId,
                      });
                    }}
                  >
                    {t("time.add")}
                  </Button>
                </div>
                {unassignedProjects.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Select
                      value=""
                      onValueChange={(projectId) => {
                        if (!projectId || !activeCategoryId) return;
                        linkProject.mutate({
                          type: "project",
                          id: projectId,
                          timeParentCategoryId: activeCategoryId,
                        });
                      }}
                    >
                      <SelectTrigger className="h-9 w-full border-white/10 bg-white/5 text-white">
                        <SelectValue placeholder={t("time.parentCategorySelectUnassignedProject")} />
                      </SelectTrigger>
                      <SelectContent className="border-white/10 bg-[#16161f] text-white">
                        {unassignedProjects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <ul className="mt-3 space-y-1.5">
                  {projectsInCategory.length === 0 ? (
                    <li className="text-sm text-white/35">{t("time.parentCategoryNoProjects")}</li>
                  ) : (
                    projectsInCategory.map(renderProjectRow)
                  )}
                </ul>
              </>
            ) : (
              <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-2 text-center">
                <FolderKanban className="h-10 w-10 text-white/20" />
                <p className="text-sm text-white/45">{t("time.parentCategorySelectPrompt")}</p>
              </div>
            )}
          </section>

          {/* Project detail / entries */}
          <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            {!selectedProject ? (
              <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-2 text-center">
                <p className="text-sm text-white/45">{t("time.catalogSelectProjectPrompt")}</p>
              </div>
            ) : (
              <div className="flex h-full flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h2 className="truncate text-base font-semibold text-white">
                        {selectedProject.name}
                      </h2>
                      {!selectedProject.systemKey?.startsWith("leave_") ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-white/45 hover:bg-white/10 hover:text-white"
                          title={t("time.catalogRenameProject")}
                          onClick={() =>
                            openRename("project", selectedProject.id, selectedProject.name)
                          }
                        >
                          <Pencil size={14} />
                        </Button>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-white/45">
                      {projectEntries
                        ? `${projectEntries.totalCount} ${t("time.catalogEntryCount")} · ${formatMinutes(projectEntries.totalMinutes)}`
                        : `${selectedProject.entryCount} ${t("time.catalogEntryCount")}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-white/15 text-white"
                      onClick={() => {
                        setDeleteProjectId(selectedProject.id);
                        setReassignToProjectId("");
                      }}
                      disabled={Boolean(selectedProject.systemKey?.startsWith("leave_"))}
                    >
                      <Trash2 size={14} className="mr-1.5" />
                      {t("time.catalogDeleteProjectTitle")}
                    </Button>
                  </div>
                </div>

                {canMoveSelectedProject ? (
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
                    <div className="text-xs font-medium text-white/70">
                      {t("time.catalogMoveProjectToCategory")}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Select value={moveToCategoryId} onValueChange={setMoveToCategoryId}>
                        <SelectTrigger className="h-9 min-w-[12rem] flex-1 border-white/10 bg-white/5 text-white">
                          <SelectValue placeholder={t("time.catalogMoveProjectCategoryPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent className="border-white/10 bg-[#16161f] text-white">
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                          <SelectItem value="__none__">
                            {t("time.parentCategoryUnassignedHeading")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        className="bg-indigo-700 hover:bg-indigo-600"
                        disabled={
                          !selectedProjectCategoryChanged || linkProject.isPending
                        }
                        onClick={() => {
                          if (!selectedProject || !moveToCategoryId) return;
                          const timeParentCategoryId =
                            moveToCategoryId === "__none__" ? null : moveToCategoryId;
                          if (selectedProject.eventId) {
                            linkProject.mutate({
                              type: "event",
                              id: selectedProject.eventId,
                              timeParentCategoryId,
                            });
                            return;
                          }
                          if (selectedProject.tourId) {
                            linkProject.mutate({
                              type: "tour",
                              id: selectedProject.tourId,
                              timeParentCategoryId,
                            });
                            return;
                          }
                          linkProject.mutate({
                            type: "project",
                            id: selectedProject.id,
                            timeParentCategoryId,
                          });
                        }}
                      >
                        {t("time.catalogMoveProjectConfirm")}
                      </Button>
                    </div>
                  </div>
                ) : null}

                {selectedHasEntries ? (
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-white/70">
                      <ArrowRightLeft size={14} />
                      {t("time.catalogMoveAllEntries")}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Select value={moveToProjectId} onValueChange={setMoveToProjectId}>
                        <SelectTrigger className="h-9 min-w-[12rem] flex-1 border-white/10 bg-white/5 text-white">
                          <SelectValue placeholder={t("time.catalogReassignPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent className="border-white/10 bg-[#16161f] text-white">
                          {moveTargets.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        className="bg-indigo-700 hover:bg-indigo-600"
                        disabled={
                          !moveToProjectId || moveAllEntries.isPending || moveTargets.length === 0
                        }
                        onClick={() => {
                          if (!selectedProjectId || !moveToProjectId) return;
                          moveAllEntries.mutate({
                            fromId: selectedProjectId,
                            toProjectId: moveToProjectId,
                          });
                        }}
                      >
                        {t("time.catalogMoveAllConfirm")}
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="min-h-0 flex-1 overflow-auto">
                  {entriesLoading ? (
                    <p className="text-sm text-white/45">{t("time.parentCategoryLoading")}</p>
                  ) : !projectEntries || projectEntries.entries.length === 0 ? (
                    <p className="text-sm text-white/35">{t("time.catalogNoEntries")}</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {projectEntries.entries.map((e) => (
                        <li
                          key={e.id}
                          className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-2"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-sm text-white/90">{e.personName}</p>
                            <p className="tabular-nums text-[11px] text-white/50">
                              {formatMinutes(e.durationMinutes)}
                              {e.isLocked ? ` · ${t("time.lockedShort")}` : ""}
                            </p>
                          </div>
                          <p className="mt-0.5 text-[11px] text-white/50">
                            {format(parseISO(e.startsAt), "d MMM yyyy HH:mm")} –{" "}
                            {format(parseISO(e.endsAt), "HH:mm")} ·{" "}
                            {t(timeCategoryMessageId(e.category as TimeCategory) as never)}
                          </p>
                          {e.note ? (
                            <p className="mt-0.5 truncate text-[11px] text-white/40">{e.note}</p>
                          ) : null}
                        </li>
                      ))}
                      {projectEntries.totalCount > projectEntries.entries.length ? (
                        <li className="px-1 py-2 text-[11px] text-white/40">
                          {t("time.catalogEntriesTruncated", {
                            shown: projectEntries.entries.length,
                            total: projectEntries.totalCount,
                          })}
                        </li>
                      ) : null}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {renameTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-white/15 bg-[#16161f] p-5 shadow-xl">
            <div>
              <h2 className="text-base font-semibold text-white">
                {renameTarget.kind === "category"
                  ? t("time.catalogRenameCategory")
                  : t("time.catalogRenameProject")}
              </h2>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-white/70">{t("time.catalogRenameNameLabel")}</Label>
              <Input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitRename();
                  }
                }}
                className="h-9 border-white/10 bg-white/5 text-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/15 text-white"
                onClick={() => {
                  setRenameTarget(null);
                  setRenameValue("");
                }}
              >
                {t("time.cancelDelete")}
              </Button>
              <Button
                type="button"
                className="bg-indigo-700 hover:bg-indigo-600"
                disabled={
                  !renameValue.trim() ||
                  renameValue.trim() === renameTarget.name ||
                  renameCategory.isPending ||
                  renameProject.isPending
                }
                onClick={submitRename}
              >
                {t("time.catalogRenameSave")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteProjectId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-white/15 bg-[#16161f] p-5 shadow-xl">
            <div>
              <h2 className="text-base font-semibold text-white">
                {t("time.catalogDeleteProjectTitle")}
              </h2>
              <p className="mt-1 text-sm text-white/55">
                {deleteTargetHasEntries
                  ? t("time.catalogDeleteProjectHint")
                  : t("time.catalogDeleteEmptyProjectHint")}
              </p>
              {deleteTarget ? (
                <p className="mt-2 truncate text-sm font-medium text-white/80">
                  {deleteTarget.name}
                </p>
              ) : null}
            </div>
            {deleteTargetHasEntries ? (
              <div className="space-y-1.5">
                <Label className="text-xs text-white/70">{t("time.catalogReassignToProject")}</Label>
                <Select value={reassignToProjectId} onValueChange={setReassignToProjectId}>
                  <SelectTrigger className="h-9 border-white/10 bg-white/5 text-white">
                    <SelectValue placeholder={t("time.catalogReassignPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#16161f] text-white">
                    {allProjects
                      .filter((p) => p.id !== deleteProjectId)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/15 text-white"
                onClick={() => {
                  setDeleteProjectId(null);
                  setReassignToProjectId("");
                }}
              >
                {t("time.cancelDelete")}
              </Button>
              <Button
                type="button"
                className="bg-red-700 hover:bg-red-600"
                disabled={
                  deleteProject.isPending ||
                  (deleteTargetHasEntries && !reassignToProjectId)
                }
                onClick={() => {
                  if (!deleteProjectId) return;
                  if (deleteTargetHasEntries) {
                    if (!reassignToProjectId) return;
                    deleteProject.mutate({
                      id: deleteProjectId,
                      reassignToProjectId,
                    });
                    return;
                  }
                  deleteProject.mutate({ id: deleteProjectId });
                }}
              >
                {deleteTargetHasEntries
                  ? t("time.catalogDeleteAndReassign")
                  : t("time.catalogDeleteConfirmAction")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
