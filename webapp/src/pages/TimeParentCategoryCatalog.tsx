import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, FolderKanban, Plus, RotateCcw, Trash2, X } from "lucide-react";

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
import type {
  TimeParentCategory,
  TimeParentCategoryCatalog,
  TimeProject,
} from "@/contracts/backendTypes";

type CatalogEvent = TimeParentCategoryCatalog["events"][number];
type CatalogTour = TimeParentCategoryCatalog["tours"][number];

function MemberRow({
  label,
  sublabel,
  onRemove,
  removing,
}: {
  label: string;
  sublabel?: string;
  onRemove: () => void;
  removing?: boolean;
}) {
  return (
    <li className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-white/90">{label}</p>
        {sublabel ? <p className="truncate text-[10px] text-white/40">{sublabel}</p> : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-white/35 hover:text-red-400"
        disabled={removing}
        onClick={onRemove}
        aria-label="Remove"
      >
        <X size={14} />
      </Button>
    </li>
  );
}

function LinkedResourceRow({
  label,
  sublabel,
  href,
}: {
  label: string;
  sublabel?: string;
  href: string;
}) {
  return (
    <li className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-2">
      <Link to={href} className="block min-w-0 hover:text-white">
        <p className="truncate text-sm text-white/90">{label}</p>
        {sublabel ? <p className="truncate text-[10px] text-white/40">{sublabel}</p> : null}
      </Link>
    </li>
  );
}

export default function TimeParentCategoryCatalog() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { canAction } = usePermissions();
  const canManage = canAction("time.manage_catalog");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [pickEventId, setPickEventId] = useState("");
  const [pickTourId, setPickTourId] = useState("");
  const [pickProjectId, setPickProjectId] = useState("");
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [reassignToProjectId, setReassignToProjectId] = useState("");

  const { data: catalog, isLoading } = useQuery({
    queryKey: ["time-parent-category-catalog"],
    queryFn: () => api.get<TimeParentCategoryCatalog>("/api/time/parent-category-catalog"),
    enabled: canManage,
  });

  const categories = catalog?.categories ?? [];
  const selected =
    categories.find((c) => c.id === selectedId) ??
    (categories[0] ?? null);

  const activeId = selected?.id ?? null;
  const [categoryNameDraft, setCategoryNameDraft] = useState("");

  useEffect(() => {
    setCategoryNameDraft(selected?.name ?? "");
  }, [selected?.id, selected?.name]);

  const members = useMemo(() => {
    if (!catalog || !activeId) {
      return { events: [] as CatalogEvent[], tours: [] as CatalogTour[], projects: [] as TimeProject[] };
    }
    return {
      events: catalog.events.filter((e) => e.timeParentCategoryId === activeId),
      tours: catalog.tours.filter((tour) => tour.timeParentCategoryId === activeId),
      projects: catalog.standaloneProjects.filter((p) => p.timeParentCategoryId === activeId),
    };
  }, [catalog, activeId]);

  const unassignedEvents = useMemo(
    () => (catalog?.events ?? []).filter((e) => !e.timeParentCategoryId),
    [catalog]
  );
  const unassignedTours = useMemo(
    () => (catalog?.tours ?? []).filter((tour) => !tour.timeParentCategoryId),
    [catalog]
  );
  const unassignedProjects = useMemo(
    () =>
      (catalog?.standaloneProjects ?? []).filter(
        (p) => !p.timeParentCategoryId && !(p.systemKey?.startsWith("leave_") ?? false)
      ),
    [catalog]
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["time-parent-category-catalog"] });
    queryClient.invalidateQueries({ queryKey: ["time-projects"] });
  };

  const addCategory = useMutation({
    mutationFn: (name: string) => api.post<TimeParentCategory>("/api/time/parent-categories", { name }),
    onSuccess: (row) => {
      invalidate();
      setSelectedId(row.id);
      setNewCategoryName("");
      toast({ title: t("time.parentCategoryAdded") });
    },
    onError: () => toast({ title: t("time.catalogSaveError"), variant: "destructive" }),
  });

  const patchCategory = useMutation({
    mutationFn: (vars: { id: string; name?: string; color?: string | null }) =>
      api.patch(`/api/time/parent-categories/${vars.id}`, {
        ...(vars.name !== undefined ? { name: vars.name } : {}),
        ...(vars.color !== undefined ? { color: vars.color } : {}),
      }),
    onSuccess: invalidate,
    onError: () => toast({ title: t("time.catalogSaveError"), variant: "destructive" }),
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => api.delete(`/api/time/parent-categories/${id}`),
    onSuccess: () => {
      invalidate();
      setSelectedId(null);
      toast({ title: t("time.catalogRemoved") });
    },
    onError: () => toast({ title: t("time.catalogSaveError"), variant: "destructive" }),
  });

  const linkItem = useMutation({
    mutationFn: (body: {
      type: "event" | "tour" | "project";
      id: string;
      timeParentCategoryId: string | null;
    }) => api.patch("/api/time/parent-category-link", body),
    onSuccess: () => {
      invalidate();
      setPickEventId("");
      setPickTourId("");
      setPickProjectId("");
    },
    onError: () => toast({ title: t("time.catalogSaveError"), variant: "destructive" }),
  });

  const addProject = useMutation({
    mutationFn: (vars: { name: string; timeParentCategoryId: string }) =>
      api.post("/api/time/projects", vars),
    onSuccess: () => {
      invalidate();
      setNewProjectName("");
      toast({ title: t("time.catalogProjectAdded") });
    },
    onError: () => toast({ title: t("time.catalogSaveError"), variant: "destructive" }),
  });

  const reassignTargets = useMemo(() => {
    const all = catalog?.standaloneProjects ?? [];
    return all.filter(
      (p) =>
        p.id !== deleteProjectId &&
        !p.isArchived &&
        !(p.systemKey?.startsWith("leave_") ?? false)
    );
  }, [catalog, deleteProjectId]);

  const deleteProject = useMutation({
    mutationFn: (vars: { id: string; reassignToProjectId: string }) =>
      api.deleteWithBody<{
        ok: boolean;
        reassignedEntries: number;
        reassignedTravelClaims: number;
        reassignedMileageClaims: number;
      }>(`/api/time/projects/${vars.id}`, {
        reassignToProjectId: vars.reassignToProjectId,
      }),
    onSuccess: (data) => {
      invalidate();
      setDeleteProjectId(null);
      setReassignToProjectId("");
      toast({
        title: t("time.catalogProjectDeleted"),
        description: t("time.catalogProjectReassigned", {
          count: data.reassignedEntries + data.reassignedTravelClaims + data.reassignedMileageClaims,
        }),
      });
    },
    onError: () => toast({ title: t("time.catalogSaveError"), variant: "destructive" }),
  });

  if (!canManage) {
    return <Navigate to="/time" replace />;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/time"
            className="mb-2 inline-flex items-center gap-1.5 text-xs text-white/45 hover:text-white/70"
          >
            <ArrowLeft size={14} />
            {t("time.backToTime")}
          </Link>
          <h1 className="text-xl font-semibold text-white">{t("time.parentCategoryPageTitle")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-white/50">{t("time.parentCategoryPageHint")}</p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-white/45">{t("time.parentCategoryLoading")}</p>
      ) : (
        <div className="grid min-h-[28rem] gap-4 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
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
              {categories.length === 0 ? (
                <li className="text-sm text-white/40">{t("time.parentCategoryEmpty")}</li>
              ) : (
                categories.map((cat) => (
                  <li key={cat.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(cat.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors",
                        (activeId === cat.id)
                          ? "border-white/25 bg-white/[0.08] text-white"
                          : "border-transparent text-white/70 hover:bg-white/[0.04]"
                      )}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/15"
                        style={{ backgroundColor: displayHex(cat.color, cat.id) }}
                      />
                      <span className="truncate">{cat.name}</span>
                      {cat.systemKey ? (
                        <span className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/35 ring-1 ring-white/10">
                          {t("time.parentCategorySystemBadge")}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </aside>

          <main className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            {!selected ? (
              <div className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-2 text-center">
                <FolderKanban className="h-10 w-10 text-white/20" />
                <p className="text-sm text-white/45">{t("time.parentCategorySelectPrompt")}</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <input
                      type="color"
                      aria-label={t("time.catalogColorLabel")}
                      className="mt-1 h-10 w-12 shrink-0 cursor-pointer rounded border border-white/15 bg-transparent p-0"
                      value={displayHex(selected.color, selected.id)}
                      onChange={(e) =>
                        patchCategory.mutate({ id: selected.id, color: e.target.value })
                      }
                    />
                    <Input
                      value={categoryNameDraft}
                      onChange={(e) => setCategoryNameDraft(e.target.value)}
                      onBlur={() => {
                        const trimmed = categoryNameDraft.trim();
                        if (!trimmed || trimmed === selected.name) return;
                        patchCategory.mutate({ id: selected.id, name: trimmed });
                      }}
                      className="h-10 max-w-md border-white/10 bg-white/5 text-lg font-medium text-white"
                    />
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-white/45 hover:text-white/80"
                      title={t("time.catalogColorReset")}
                      disabled={selected.color == null}
                      onClick={() => patchCategory.mutate({ id: selected.id, color: null })}
                    >
                      <RotateCcw size={14} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-red-400/70 hover:text-red-400"
                      disabled={Boolean(selected.systemKey)}
                      title={
                        selected.systemKey
                          ? t("time.parentCategoryCannotDeleteSystem")
                          : undefined
                      }
                      onClick={() => {
                        if (selected.systemKey) return;
                        if (!confirm(t("time.parentCategoryDeleteConfirm"))) return;
                        deleteCategory.mutate(selected.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>

                <section className="space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-white/45">
                    {t("time.parentCategoryProjectsHeading")}
                  </h2>
                  <p className="text-xs text-white/40">{t("time.parentCategoryProjectsHint")}</p>
                  <div className="flex gap-2">
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
                        if (!activeId) return;
                        addProject.mutate({
                          name: newProjectName.trim(),
                          timeParentCategoryId: activeId,
                        });
                      }}
                    >
                      {t("time.add")}
                    </Button>
                  </div>
                  {unassignedProjects.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      <Select value={pickProjectId} onValueChange={setPickProjectId}>
                        <SelectTrigger className="h-9 w-full max-w-sm border-white/10 bg-white/5 text-white">
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
                      <Button
                        type="button"
                        variant="outline"
                        className="border-white/15 text-white hover:bg-white/5"
                        disabled={!pickProjectId || linkItem.isPending}
                        onClick={() => {
                          if (!activeId || !pickProjectId) return;
                          linkItem.mutate({
                            type: "project",
                            id: pickProjectId,
                            timeParentCategoryId: activeId,
                          });
                        }}
                      >
                        {t("time.parentCategoryLinkProject")}
                      </Button>
                    </div>
                  ) : null}
                  <ul className="space-y-1.5">
                    {members.projects.map((p) => (
                      <MemberRow
                        key={p.id}
                        label={p.name}
                        sublabel={t("time.parentCategoryStandaloneProject")}
                        onRemove={() => {
                          setDeleteProjectId(p.id);
                          setReassignToProjectId("");
                        }}
                        removing={deleteProject.isPending}
                      />
                    ))}
                    {members.projects.length === 0 ? (
                      <li className="text-sm text-white/35">{t("time.parentCategoryNoProjects")}</li>
                    ) : null}
                  </ul>
                </section>

                <section className="space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-white/45">
                    {t("time.parentCategoryEventsHeading")}
                  </h2>
                  <p className="text-xs text-white/40">{t("time.parentCategoryEventsHint")}</p>
                  {unassignedEvents.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      <Select value={pickEventId} onValueChange={setPickEventId}>
                        <SelectTrigger className="h-9 w-full max-w-sm border-white/10 bg-white/5 text-white">
                          <SelectValue placeholder={t("time.selectEventPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent className="border-white/10 bg-[#16161f] text-white">
                          {unassignedEvents.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-white/15 text-white hover:bg-white/5"
                        disabled={!pickEventId || linkItem.isPending}
                        onClick={() => {
                          if (!activeId || !pickEventId) return;
                          linkItem.mutate({
                            type: "event",
                            id: pickEventId,
                            timeParentCategoryId: activeId,
                          });
                        }}
                      >
                        {t("time.parentCategoryLinkEvent")}
                      </Button>
                    </div>
                  ) : null}
                  <ul className="space-y-1.5">
                    {members.events.map((e) => (
                      <LinkedResourceRow
                        key={e.id}
                        label={e.title}
                        sublabel={t("time.parentCategoryAutoEvent")}
                        href={`/events/${e.id}`}
                      />
                    ))}
                    {members.events.length === 0 ? (
                      <li className="text-sm text-white/35">{t("time.parentCategoryNoEvents")}</li>
                    ) : null}
                  </ul>
                </section>

                <section className="space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-white/45">
                    {t("time.parentCategoryToursHeading")}
                  </h2>
                  <p className="text-xs text-white/40">{t("time.parentCategoryToursHint")}</p>
                  {unassignedTours.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      <Select value={pickTourId} onValueChange={setPickTourId}>
                        <SelectTrigger className="h-9 w-full max-w-sm border-white/10 bg-white/5 text-white">
                          <SelectValue placeholder={t("time.parentCategorySelectTour")} />
                        </SelectTrigger>
                        <SelectContent className="border-white/10 bg-[#16161f] text-white">
                          {unassignedTours.map((tour) => (
                            <SelectItem key={tour.id} value={tour.id}>
                              {tour.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-white/15 text-white hover:bg-white/5"
                        disabled={!pickTourId || linkItem.isPending}
                        onClick={() => {
                          if (!activeId || !pickTourId) return;
                          linkItem.mutate({
                            type: "tour",
                            id: pickTourId,
                            timeParentCategoryId: activeId,
                          });
                        }}
                      >
                        {t("time.parentCategoryLinkTour")}
                      </Button>
                    </div>
                  ) : null}
                  <ul className="space-y-1.5">
                    {members.tours.map((tour) => (
                      <LinkedResourceRow
                        key={tour.id}
                        label={tour.name}
                        sublabel={t("time.parentCategoryLinkedTour")}
                        href={`/tours/${tour.id}`}
                      />
                    ))}
                    {members.tours.length === 0 ? (
                      <li className="text-sm text-white/35">{t("time.parentCategoryNoTours")}</li>
                    ) : null}
                  </ul>
                </section>
              </div>
            )}
          </main>
        </div>
      )}

      {!isLoading &&
      (unassignedEvents.length > 0 || unassignedTours.length > 0 || unassignedProjects.length > 0) ? (
        <section className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-5 space-y-4">
          <div>
            <h2 className="text-sm font-medium text-amber-100/90">{t("time.parentCategoryUnassignedHeading")}</h2>
            <p className="mt-1 text-xs text-white/45">{t("time.parentCategoryUnassignedHint")}</p>
          </div>
          {unassignedProjects.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
                {t("time.parentCategoryUnassignedProjects")} ({unassignedProjects.length})
              </p>
              <ul className="space-y-1.5">
                {unassignedProjects.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-white/90">{p.name}</span>
                    <div className="flex items-center gap-1.5">
                      <Select
                        value=""
                        onValueChange={(categoryId) => {
                          if (!categoryId) return;
                          linkItem.mutate({
                            type: "project",
                            id: p.id,
                            timeParentCategoryId: categoryId,
                          });
                        }}
                      >
                        <SelectTrigger className="h-8 w-44 border-white/10 bg-white/5 text-xs text-white">
                          <SelectValue placeholder={t("time.parentCategorySelectPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent className="border-white/10 bg-[#16161f] text-white">
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-white/35 hover:text-red-400"
                        onClick={() => {
                          setDeleteProjectId(p.id);
                          setReassignToProjectId("");
                        }}
                        aria-label={t("time.catalogDeleteConfirm")}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {unassignedEvents.length > 0 ? (
            <ul className="space-y-1.5">
              {unassignedEvents.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-2"
                >
                  <Link to={`/events/${e.id}`} className="min-w-0 flex-1 truncate text-sm text-white/90 hover:text-white">
                    {e.title}
                  </Link>
                  <Select
                    value=""
                    onValueChange={(categoryId) => {
                      if (!categoryId) return;
                      linkItem.mutate({
                        type: "event",
                        id: e.id,
                        timeParentCategoryId: categoryId,
                      });
                    }}
                  >
                    <SelectTrigger className="h-8 w-44 border-white/10 bg-white/5 text-xs text-white">
                      <SelectValue placeholder={t("time.parentCategorySelectPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#16161f] text-white">
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
          ) : null}
          {unassignedTours.length > 0 ? (
            <ul className="space-y-1.5">
              {unassignedTours.map((tour) => (
                <li
                  key={tour.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-2"
                >
                  <Link to={`/tours/${tour.id}`} className="min-w-0 flex-1 truncate text-sm text-white/90 hover:text-white">
                    {tour.name}
                  </Link>
                  <Select
                    value=""
                    onValueChange={(categoryId) => {
                      if (!categoryId) return;
                      linkItem.mutate({
                        type: "tour",
                        id: tour.id,
                        timeParentCategoryId: categoryId,
                      });
                    }}
                  >
                    <SelectTrigger className="h-8 w-44 border-white/10 bg-white/5 text-xs text-white">
                      <SelectValue placeholder={t("time.parentCategorySelectPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent className="border-white/10 bg-[#16161f] text-white">
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {deleteProjectId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/15 bg-[#16161f] p-5 shadow-xl space-y-4">
            <div>
              <h2 className="text-base font-semibold text-white">{t("time.catalogDeleteProjectTitle")}</h2>
              <p className="mt-1 text-sm text-white/55">{t("time.catalogDeleteProjectHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs">{t("time.catalogReassignToProject")}</Label>
              <Select value={reassignToProjectId} onValueChange={setReassignToProjectId}>
                <SelectTrigger className="h-9 border-white/10 bg-white/5 text-white">
                  <SelectValue placeholder={t("time.catalogReassignPlaceholder")} />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#16161f] text-white">
                  {reassignTargets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                disabled={!reassignToProjectId || deleteProject.isPending || reassignTargets.length === 0}
                onClick={() => {
                  if (!deleteProjectId || !reassignToProjectId) return;
                  deleteProject.mutate({
                    id: deleteProjectId,
                    reassignToProjectId,
                  });
                }}
              >
                {t("time.catalogDeleteAndReassign")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
