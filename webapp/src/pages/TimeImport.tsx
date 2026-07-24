import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileUp, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type MappingAction = "map" | "create" | "skip";

type PreviewData = {
  source: string;
  fileName: string | null;
  entryCount: number;
  skippedSummaryRows: number;
  invalidRowCount: number;
  dateRange: { from: string; to: string } | null;
  externalPeople: {
    name: string;
    entryCount: number;
    suggestedPersonId: string | null;
  }[];
  externalProjects: {
    name: string;
    entryCount: number;
    suggestedProjectId: string | null;
  }[];
  externalTags: {
    name: string;
    entryCount: number;
    suggestedTagId: string | null;
  }[];
  orgPeople: { id: string; name: string; email: string | null }[];
  orgProjects: { id: string; name: string }[];
  orgTags: { id: string; name: string }[];
  sampleEntries: {
    rowIndex: number;
    project: string;
    dateIso: string;
    personName: string;
    loggedHours: number;
    tags: string[];
    note: string;
    timeRange: { start: string; end: string } | null;
  }[];
};

type ImportBatch = {
  id: string;
  source: string;
  fileName: string | null;
  entryCount: number;
  createdAt: string;
};

type ProjectMappingState = Record<
  string,
  { action: MappingAction; timeProjectId: string; newProjectName: string }
>;
type TagMappingState = Record<
  string,
  { action: MappingAction; timeTagId: string; newTagName: string }
>;
type PersonMappingState = Record<string, string>;

function buildDefaultProjectMappings(preview: PreviewData): ProjectMappingState {
  const out: ProjectMappingState = {};
  for (const p of preview.externalProjects) {
    out[p.name] = {
      action: p.suggestedProjectId ? "map" : p.name.startsWith("#") ? "skip" : "create",
      timeProjectId: p.suggestedProjectId ?? "",
      newProjectName: p.name.replace(/^#+\s*/, ""),
    };
  }
  return out;
}

function buildDefaultTagMappings(preview: PreviewData): TagMappingState {
  const out: TagMappingState = {};
  for (const t of preview.externalTags) {
    out[t.name] = {
      action: t.suggestedTagId ? "map" : "create",
      timeTagId: t.suggestedTagId ?? "",
      newTagName: t.name,
    };
  }
  return out;
}

function buildDefaultPersonMappings(preview: PreviewData): PersonMappingState {
  const out: PersonMappingState = {};
  for (const p of preview.externalPeople) {
    out[p.name] = p.suggestedPersonId ?? preview.orgPeople[0]?.id ?? "";
  }
  return out;
}

export default function TimeImport() {
  const { t } = useI18n();
  const { canAction } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const readAll = canAction("time.read_all");

  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [personMappings, setPersonMappings] = useState<PersonMappingState>({});
  const [projectMappings, setProjectMappings] = useState<ProjectMappingState>({});
  const [tagMappings, setTagMappings] = useState<TagMappingState>({});
  const [remapBatchId, setRemapBatchId] = useState("");
  const [importProgress, setImportProgress] = useState<{ imported: number; total: number } | null>(
    null
  );
  const [importResult, setImportResult] = useState<{
    batchId: string;
    imported: number;
    skipped: number;
    skippedDuplicates: number;
    shiftedOverlaps: number;
    droppedLunchBreaks: number;
    replacedExisting: number;
  } | null>(null);

  const { data: batches } = useQuery({
    queryKey: ["time-import-batches"],
    queryFn: () => api.get<ImportBatch[]>("/api/time/import/batches"),
    enabled: readAll,
  });

  const { data: remapExternals } = useQuery({
    queryKey: ["time-import-externals", remapBatchId],
    queryFn: () =>
      api.get<{
        externalProjects: { name: string; entryCount: number }[];
        externalTags: { name: string; entryCount: number }[];
      }>(`/api/time/import/externals${remapBatchId ? `?batchId=${encodeURIComponent(remapBatchId)}` : ""}`),
    enabled: readAll,
  });

  const { data: orgCatalog } = useQuery({
    queryKey: ["time-import-catalog"],
    queryFn: async () => {
      const [projects, tags, people] = await Promise.all([
        api.get<{ id: string; name: string }[]>("/api/time/projects"),
        api.get<{ id: string; name: string }[]>("/api/time/tags"),
        api.get<{ id: string; name: string }[]>("/api/people"),
      ]);
      return { projects, tags, people };
    },
    enabled: readAll,
  });

  const onFile = useCallback((file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setCsvText(text);
      setPreview(null);
    };
    reader.readAsText(file, "UTF-8");
  }, []);

  const previewMutation = useMutation({
    mutationFn: () =>
      api.post<PreviewData>("/api/time/import/preview", { csvText, fileName: fileName || undefined }),
    onSuccess: (data) => {
      setPreview(data);
      setPersonMappings(buildDefaultPersonMappings(data));
      setProjectMappings(buildDefaultProjectMappings(data));
      setTagMappings(buildDefaultTagMappings(data));
    },
    onError: (e: Error) => {
      toast({ title: t("time.importPreviewError"), description: e.message, variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        csvText,
        fileName: fileName || undefined,
        personMappings: Object.entries(personMappings).map(([externalName, personId]) => ({
          externalName,
          personId,
        })),
        projectMappings: Object.entries(projectMappings).map(([externalName, m]) => ({
          externalName,
          action: m.action,
          ...(m.action === "map" ? { timeProjectId: m.timeProjectId } : {}),
          ...(m.action === "create" ? { newProjectName: m.newProjectName || externalName } : {}),
        })),
        tagMappings: Object.entries(tagMappings).map(([externalName, m]) => ({
          externalName,
          action: m.action,
          ...(m.action === "map" ? { timeTagId: m.timeTagId } : {}),
          ...(m.action === "create" ? { newTagName: m.newTagName || externalName } : {}),
        })),
      };

      for (const [, m] of Object.entries(projectMappings)) {
        if (m.action === "map" && !m.timeProjectId) {
          throw new Error(t("time.importMapProjectRequired"));
        }
      }
      for (const [, m] of Object.entries(tagMappings)) {
        if (m.action === "map" && !m.timeTagId) {
          throw new Error(t("time.importMapTagRequired"));
        }
      }

      let batchId: string | undefined;
      let offset = 0;
      let totalImported = 0;
      let totalSkipped = 0;
      let totalSkippedDuplicates = 0;
      let totalShiftedOverlaps = 0;
      let totalDroppedLunch = 0;
      let totalReplacedExisting = 0;
      const limit = 200;

      setImportProgress({ imported: 0, total: preview?.entryCount ?? 0 });

      while (true) {
        const data = await api.post<{
          batchId: string;
          imported: number;
          skipped: number;
          skippedDuplicates: number;
          shiftedOverlaps?: number;
          droppedLunchBreaks?: number;
          replacedExisting?: number;
          done: boolean;
          nextOffset: number;
          totalSlots: number;
        }>("/api/time/import/run", {
          ...payload,
          batchId,
          offset,
          limit,
        });
        batchId = data.batchId;
        totalImported += data.imported;
        totalSkipped += data.skipped;
        totalSkippedDuplicates += data.skippedDuplicates ?? 0;
        totalShiftedOverlaps += data.shiftedOverlaps ?? 0;
        totalDroppedLunch += data.droppedLunchBreaks ?? 0;
        totalReplacedExisting += data.replacedExisting ?? 0;
        setImportProgress({ imported: totalImported, total: data.totalSlots });
        if (data.done) {
          return {
            batchId: data.batchId,
            imported: totalImported,
            skipped: totalSkipped,
            skippedDuplicates: totalSkippedDuplicates,
            shiftedOverlaps: totalShiftedOverlaps,
            droppedLunchBreaks: totalDroppedLunch,
            replacedExisting: totalReplacedExisting,
          };
        }
        offset = data.nextOffset;
      }
    },
    onSuccess: (data) => {
      setImportResult(data);
      setImportProgress(null);
      queryClient.invalidateQueries({ queryKey: ["time-import-batches"] });
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      const dupPart =
        data.skippedDuplicates > 0
          ? `, ${data.skippedDuplicates} ${t("time.importEntriesSkippedDuplicates")}`
          : "";
      const shiftPart =
        data.shiftedOverlaps > 0
          ? `, ${data.shiftedOverlaps} ${t("time.importEntriesShiftedOverlaps")}`
          : "";
      const lunchPart =
        data.droppedLunchBreaks > 0
          ? `, ${data.droppedLunchBreaks} ${t("time.importEntriesDroppedLunch")}`
          : "";
      const replacedPart =
        data.replacedExisting > 0
          ? `, ${data.replacedExisting} ${t("time.importEntriesReplacedExisting")}`
          : "";
      toast({
        title: t("time.importDone"),
        description: `${data.imported} ${t("time.importEntriesImported")}${dupPart}${shiftPart}${lunchPart}${replacedPart}`,
      });
    },
    onError: (e: Error) => {
      setImportProgress(null);
      toast({ title: t("time.importRunError"), description: e.message, variant: "destructive" });
    },
  });

  const remapMutation = useMutation({
    mutationFn: () =>
      api.post<{ projectsUpdated: number; tagsUpdated: number }>("/api/time/import/remap", {
        batchId: remapBatchId || undefined,
        projectMappings: Object.entries(projectMappings).map(([externalName, m]) => ({
          externalName,
          action: m.action,
          ...(m.action === "map" ? { timeProjectId: m.timeProjectId } : {}),
          ...(m.action === "create" ? { newProjectName: m.newProjectName || externalName } : {}),
        })),
        tagMappings: Object.entries(tagMappings).map(([externalName, m]) => ({
          externalName,
          action: m.action,
          ...(m.action === "map" ? { timeTagId: m.timeTagId } : {}),
          ...(m.action === "create" ? { newTagName: m.newTagName || externalName } : {}),
        })),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      toast({
        title: t("time.importRemapDone"),
        description: `${data.projectsUpdated} proj · ${data.tagsUpdated} rækker`,
      });
    },
    onError: (e: Error) => {
      toast({ title: t("time.importRemapError"), description: e.message, variant: "destructive" });
    },
  });

  const canPreview = csvText.trim().length > 0;
  const canImport = preview != null && Object.values(personMappings).every(Boolean);

  const mappingSummary = useMemo(() => {
    if (!preview) return null;
    const mappedProjects = Object.values(projectMappings).filter((m) => m.action !== "skip").length;
    const skippedProjects = Object.values(projectMappings).filter((m) => m.action === "skip").length;
    return { mappedProjects, skippedProjects };
  }, [preview, projectMappings]);

  if (!readAll) {
    return (
      <div className="p-6 text-white/60 text-sm">
        {t("time.importNoAccess")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="text-white/60 hover:text-white">
          <Link to="/time">
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t("time.title")}
          </Link>
        </Button>
        <div>
          <h1 className="text-lg font-semibold text-white">{t("time.importTitle")}</h1>
          <p className="text-xs text-white/45">{t("time.importSubtitle")}</p>
        </div>
      </div>

      <Tabs defaultValue="import" className="space-y-4">
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="import">{t("time.importTabImport")}</TabsTrigger>
          <TabsTrigger value="remap">{t("time.importTabRemap")}</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
            <Label className="text-white/55 text-xs">{t("time.importFileLabel")}</Label>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                type="file"
                accept=".csv,text/csv"
                className="max-w-sm bg-white/5 border-white/10 text-white text-xs file:text-white/70"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              {fileName ? (
                <span className="text-xs text-white/40 flex items-center gap-1">
                  <FileUp className="h-3.5 w-3.5" />
                  {fileName}
                </span>
              ) : null}
            </div>
            <p className="text-[11px] text-white/35">{t("time.importFileHint")}</p>
            <Button
              type="button"
              size="sm"
              className="bg-white/10 hover:bg-white/15 text-white"
              disabled={!canPreview || previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              {previewMutation.isPending ? "…" : t("time.importPreview")}
            </Button>
          </div>

          {preview ? (
            <>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 text-xs text-white/60 space-y-1">
                <p>
                  <span className="text-emerald-300 font-medium">{preview.entryCount}</span>{" "}
                  {t("time.importEntriesReady")}
                  {preview.dateRange ? (
                    <span className="text-white/40">
                      {" "}
                      ({preview.dateRange.from} → {preview.dateRange.to})
                    </span>
                  ) : null}
                </p>
                <p className="text-white/35">
                  {preview.skippedSummaryRows} {t("time.importSummaryRowsSkipped")}
                  {preview.invalidRowCount > 0 ? ` · ${preview.invalidRowCount} invalid` : ""}
                </p>
                {mappingSummary ? (
                  <p className="text-white/35">
                    {mappingSummary.mappedProjects} {t("time.importProjectsMapped")} ·{" "}
                    {mappingSummary.skippedProjects} {t("time.importProjectsSkipped")}
                  </p>
                ) : null}
              </div>

              <section className="space-y-2">
                <h2 className="text-xs font-medium uppercase tracking-wide text-white/40">
                  {t("time.importPeopleHeading")}
                </h2>
                <div className="rounded-lg border border-white/10 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/[0.03] text-white/40">
                      <tr>
                        <th className="px-3 py-2">{t("time.importColExternal")}</th>
                        <th className="px-3 py-2">{t("time.importColCount")}</th>
                        <th className="px-3 py-2">{t("time.importColPerson")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.externalPeople.map((p) => (
                        <tr key={p.name} className="border-t border-white/5">
                          <td className="px-3 py-2 text-white/75">{p.name}</td>
                          <td className="px-3 py-2 tabular-nums text-white/45">{p.entryCount}</td>
                          <td className="px-3 py-2">
                            <Select
                              value={personMappings[p.name] ?? ""}
                              onValueChange={(v) =>
                                setPersonMappings((s) => ({ ...s, [p.name]: v }))
                              }
                            >
                              <SelectTrigger className="h-8 bg-white/5 border-white/10 text-white">
                                <SelectValue placeholder="…" />
                              </SelectTrigger>
                              <SelectContent className="bg-[#16161f] border-white/10 text-white">
                                {preview.orgPeople.map((op) => (
                                  <SelectItem key={op.id} value={op.id}>
                                    {op.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-2">
                <h2 className="text-xs font-medium uppercase tracking-wide text-white/40">
                  {t("time.importProjectsHeading")}
                </h2>
                <div className="rounded-lg border border-white/10 overflow-hidden max-h-[min(50vh,24rem)] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-[#12121a] text-white/40">
                      <tr>
                        <th className="px-3 py-2">{t("time.importColExternal")}</th>
                        <th className="px-3 py-2">{t("time.importColCount")}</th>
                        <th className="px-3 py-2">{t("time.importColAction")}</th>
                        <th className="px-3 py-2">{t("time.importColTarget")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.externalProjects.map((p) => {
                        const m = projectMappings[p.name] ?? {
                          action: "create" as const,
                          timeProjectId: "",
                          newProjectName: p.name,
                        };
                        return (
                          <tr key={p.name} className="border-t border-white/5">
                            <td className="px-3 py-2 text-white/75 max-w-[200px] truncate" title={p.name}>
                              {p.name}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-white/45">{p.entryCount}</td>
                            <td className="px-3 py-2">
                              <Select
                                value={m.action}
                                onValueChange={(v) =>
                                  setProjectMappings((s) => ({
                                    ...s,
                                    [p.name]: { ...m, action: v as MappingAction },
                                  }))
                                }
                              >
                                <SelectTrigger className="h-8 w-[7rem] bg-white/5 border-white/10 text-white">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#16161f] border-white/10 text-white">
                                  <SelectItem value="map">{t("time.importActionMap")}</SelectItem>
                                  <SelectItem value="create">{t("time.importActionCreate")}</SelectItem>
                                  <SelectItem value="skip">{t("time.importActionSkip")}</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-2">
                              {m.action === "map" ? (
                                <Select
                                  value={m.timeProjectId}
                                  onValueChange={(v) =>
                                    setProjectMappings((s) => ({
                                      ...s,
                                      [p.name]: { ...m, timeProjectId: v },
                                    }))
                                  }
                                >
                                  <SelectTrigger className="h-8 bg-white/5 border-white/10 text-white">
                                    <SelectValue placeholder="…" />
                                  </SelectTrigger>
                                  <SelectContent className="bg-[#16161f] border-white/10 text-white max-h-60">
                                    {preview.orgProjects.map((op) => (
                                      <SelectItem key={op.id} value={op.id}>
                                        {op.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : m.action === "create" ? (
                                <Input
                                  value={m.newProjectName}
                                  onChange={(e) =>
                                    setProjectMappings((s) => ({
                                      ...s,
                                      [p.name]: { ...m, newProjectName: e.target.value },
                                    }))
                                  }
                                  className="h-8 bg-white/5 border-white/10 text-white"
                                />
                              ) : (
                                <span className="text-white/30">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-2">
                <h2 className="text-xs font-medium uppercase tracking-wide text-white/40">
                  {t("time.importTagsHeading")}
                </h2>
                <div className="rounded-lg border border-white/10 overflow-hidden max-h-[min(40vh,20rem)] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-[#12121a] text-white/40">
                      <tr>
                        <th className="px-3 py-2">{t("time.importColExternal")}</th>
                        <th className="px-3 py-2">{t("time.importColCount")}</th>
                        <th className="px-3 py-2">{t("time.importColAction")}</th>
                        <th className="px-3 py-2">{t("time.importColTarget")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.externalTags.map((tg) => {
                        const m = tagMappings[tg.name] ?? {
                          action: "create" as const,
                          timeTagId: "",
                          newTagName: tg.name,
                        };
                        return (
                          <tr key={tg.name} className="border-t border-white/5">
                            <td className="px-3 py-2 text-white/75">{tg.name}</td>
                            <td className="px-3 py-2 tabular-nums text-white/45">{tg.entryCount}</td>
                            <td className="px-3 py-2">
                              <Select
                                value={m.action}
                                onValueChange={(v) =>
                                  setTagMappings((s) => ({
                                    ...s,
                                    [tg.name]: { ...m, action: v as MappingAction },
                                  }))
                                }
                              >
                                <SelectTrigger className="h-8 w-[7rem] bg-white/5 border-white/10 text-white">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#16161f] border-white/10 text-white">
                                  <SelectItem value="map">{t("time.importActionMap")}</SelectItem>
                                  <SelectItem value="create">{t("time.importActionCreate")}</SelectItem>
                                  <SelectItem value="skip">{t("time.importActionSkip")}</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-2">
                              {m.action === "map" ? (
                                <Select
                                  value={m.timeTagId}
                                  onValueChange={(v) =>
                                    setTagMappings((s) => ({
                                      ...s,
                                      [tg.name]: { ...m, timeTagId: v },
                                    }))
                                  }
                                >
                                  <SelectTrigger className="h-8 bg-white/5 border-white/10 text-white">
                                    <SelectValue placeholder="…" />
                                  </SelectTrigger>
                                  <SelectContent className="bg-[#16161f] border-white/10 text-white max-h-60">
                                    {preview.orgTags.map((ot) => (
                                      <SelectItem key={ot.id} value={ot.id}>
                                        {ot.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : m.action === "create" ? (
                                <Input
                                  value={m.newTagName}
                                  onChange={(e) =>
                                    setTagMappings((s) => ({
                                      ...s,
                                      [tg.name]: { ...m, newTagName: e.target.value },
                                    }))
                                  }
                                  className="h-8 bg-white/5 border-white/10 text-white"
                                />
                              ) : (
                                <span className="text-white/30">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {importProgress ? (
                <p className="text-xs text-white/50 tabular-nums">
                  {t("time.importProgress")}: {importProgress.imported} / {importProgress.total}
                </p>
              ) : null}

              <Button
                type="button"
                className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2"
                disabled={!canImport || importMutation.isPending}
                onClick={() => importMutation.mutate()}
              >
                <Upload className="h-4 w-4" />
                {importMutation.isPending ? "…" : t("time.importRun")}
              </Button>

              {importResult ? (
                <p className="text-xs text-emerald-300/80">
                  {t("time.importDone")}: {importResult.imported} {t("time.importEntriesImported")}
                  {importResult.skippedDuplicates > 0
                    ? `, ${importResult.skippedDuplicates} ${t("time.importEntriesSkippedDuplicates")}`
                    : ""}
                  {importResult.shiftedOverlaps > 0
                    ? `, ${importResult.shiftedOverlaps} ${t("time.importEntriesShiftedOverlaps")}`
                    : ""}
                  {importResult.droppedLunchBreaks > 0
                    ? `, ${importResult.droppedLunchBreaks} ${t("time.importEntriesDroppedLunch")}`
                    : ""}
                  {importResult.replacedExisting > 0
                    ? `, ${importResult.replacedExisting} ${t("time.importEntriesReplacedExisting")}`
                    : ""}
                  {importResult.skipped > importResult.skippedDuplicates
                    ? `, ${
                        importResult.skipped - importResult.skippedDuplicates
                      } ${t("time.importEntriesSkippedOther")}`
                    : ""}{" "}
                  (batch {importResult.batchId.slice(0, 8)}…)
                </p>
              ) : null}
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="remap" className="space-y-4">
          <p className="text-xs text-white/45">{t("time.importRemapHint")}</p>
          <div className="space-y-2 max-w-md">
            <Label className="text-white/55 text-xs">{t("time.importRemapBatch")}</Label>
            <Select value={remapBatchId || "__all__"} onValueChange={(v) => setRemapBatchId(v === "__all__" ? "" : v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white">
                <SelectItem value="__all__">{t("time.importRemapAllBatches")}</SelectItem>
                {(batches ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.fileName ?? b.source} · {b.entryCount} · {b.createdAt.slice(0, 10)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {remapExternals && orgCatalog ? (
            <div className="space-y-4">
              <p className="text-xs text-white/40">
                {remapExternals.externalProjects.length} {t("time.importProjectsHeading").toLowerCase()} ·{" "}
                {remapExternals.externalTags.length} tags
              </p>
              <div className="rounded-lg border border-white/10 overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[#12121a] text-white/40">
                    <tr>
                      <th className="px-3 py-2">{t("time.importColExternal")}</th>
                      <th className="px-3 py-2">{t("time.importColAction")}</th>
                      <th className="px-3 py-2">{t("time.importColTarget")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {remapExternals.externalProjects.map((p) => {
                      const m = projectMappings[p.name] ?? {
                        action: "map" as const,
                        timeProjectId: "",
                        newProjectName: p.name,
                      };
                      return (
                        <tr key={p.name} className="border-t border-white/5">
                          <td className="px-3 py-2 text-white/75 truncate max-w-[180px]" title={p.name}>
                            {p.name} <span className="text-white/30">({p.entryCount})</span>
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              value={m.action}
                              onValueChange={(v) =>
                                setProjectMappings((s) => ({
                                  ...s,
                                  [p.name]: { ...m, action: v as MappingAction },
                                }))
                              }
                            >
                              <SelectTrigger className="h-8 w-[7rem] bg-white/5 border-white/10 text-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-[#16161f] border-white/10 text-white">
                                <SelectItem value="map">{t("time.importActionMap")}</SelectItem>
                                <SelectItem value="create">{t("time.importActionCreate")}</SelectItem>
                                <SelectItem value="skip">{t("time.importActionSkip")}</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-2">
                            {m.action === "map" ? (
                              <Select
                                value={m.timeProjectId}
                                onValueChange={(v) =>
                                  setProjectMappings((s) => ({
                                    ...s,
                                    [p.name]: { ...m, timeProjectId: v },
                                  }))
                                }
                              >
                                <SelectTrigger className="h-8 bg-white/5 border-white/10 text-white">
                                  <SelectValue placeholder="…" />
                                </SelectTrigger>
                                <SelectContent className="bg-[#16161f] border-white/10 text-white max-h-60">
                                  {orgCatalog.projects.map((op) => (
                                    <SelectItem key={op.id} value={op.id}>
                                      {op.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : m.action === "create" ? (
                              <Input
                                value={m.newProjectName}
                                onChange={(e) =>
                                  setProjectMappings((s) => ({
                                    ...s,
                                    [p.name]: { ...m, newProjectName: e.target.value },
                                  }))
                                }
                                className="h-8 bg-white/5 border-white/10 text-white"
                              />
                            ) : (
                              <span className="text-white/30">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Button
                type="button"
                variant="outline"
                className="border-white/15 text-white/70"
                disabled={remapMutation.isPending}
                onClick={() => remapMutation.mutate()}
              >
                {remapMutation.isPending ? "…" : t("time.importRemapRun")}
              </Button>
            </div>
          ) : (
            <p className="text-[11px] text-white/35">{t("time.importRemapLoading")}</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
