import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRightLeft, Combine } from "lucide-react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TimeProject = { id: string; name: string };
type TimeTag = { id: string; name: string };

const CATEGORY_OPTIONS = [
  { id: "work", label: "Work" },
  { id: "vacation", label: "Vacation" },
  { id: "sick", label: "Sick leave" },
  { id: "holiday", label: "Holiday" },
  { id: "extra_vacation", label: "Extra vacation day" },
] as const;

export default function TimeBulkTools() {
  const { t } = useI18n();
  const { canAction } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canManage = canAction("time.manage_catalog");

  const { data: projects } = useQuery({
    queryKey: ["time-projects"],
    queryFn: () => api.get<TimeProject[]>("/api/time/projects"),
    enabled: canManage,
  });

  const { data: tags } = useQuery({
    queryKey: ["time-tags"],
    queryFn: () => api.get<TimeTag[]>("/api/time/tags"),
    enabled: canManage,
  });

  const [fromProjectId, setFromProjectId] = useState<string>("__any__");
  const [toProjectId, setToProjectId] = useState<string>("__keep__");
  const [toCategory, setToCategory] = useState<string>("__keep__");

  const [fromTagId, setFromTagId] = useState<string>("");
  const [toTagId, setToTagId] = useState<string>("");
  const [deleteFromTag, setDeleteFromTag] = useState(false);

  const projectMutation = useMutation({
    mutationFn: () =>
      api.post<{ updatedCount: number }>("/api/time/bulk-update", {
        filter: {
          ...(fromProjectId === "__any__"
            ? {}
            : { projectId: fromProjectId === "__none__" ? null : fromProjectId }),
        },
        action: {
          ...(toProjectId === "__keep__"
            ? {}
            : { setProjectId: toProjectId === "__none__" ? null : toProjectId }),
          ...(toCategory === "__keep__" ? {} : { setCategory: toCategory }),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      toast({ title: t("time.bulkApplied") });
    },
    onError: (e: Error) => {
      toast({ title: t("time.bulkError"), description: e.message, variant: "destructive" });
    },
  });

  const mergeMutation = useMutation({
    mutationFn: () =>
      api.post<{ mergedEntryCount: number; removedLinks: number }>(
        "/api/time/tags/merge",
        {
          fromTagId,
          toTagId,
          deleteFromTag,
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-tags"] });
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      toast({ title: t("time.bulkMergeDone") });
    },
    onError: (e: Error) => {
      toast({ title: t("time.bulkError"), description: e.message, variant: "destructive" });
    },
  });

  const canApplyProject = useMemo(() => {
    const hasAction = toProjectId !== "__keep__" || toCategory !== "__keep__";
    if (!hasAction) return false;
    if (toProjectId !== "__keep__" && fromProjectId !== "__any__" && toProjectId === fromProjectId) return false;
    return true;
  }, [fromProjectId, toProjectId, toCategory]);

  const canMerge = Boolean(fromTagId && toTagId && fromTagId !== toTagId);

  if (!canManage) {
    return <div className="p-6 text-white/60 text-sm">{t("time.importNoAccess")}</div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="text-white/60 hover:text-white">
          <Link to="/time">
            <ArrowLeft className="h-4 w-4 mr-1" />
            {t("time.title")}
          </Link>
        </Button>
        <div>
          <h1 className="text-lg font-semibold text-white">{t("time.bulkToolsTitle")}</h1>
          <p className="text-xs text-white/45">{t("time.bulkToolsSubtitle")}</p>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-4">
        <div className="flex items-center gap-2 text-white/70">
          <ArrowRightLeft className="h-4 w-4" />
          <p className="text-sm font-medium">{t("time.bulkApply")}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-white/55 text-xs">{t("time.bulkProjectFrom")}</Label>
            <Select value={fromProjectId} onValueChange={setFromProjectId}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white max-h-64">
                <SelectItem value="__any__">Any</SelectItem>
                <SelectItem value="__none__">No project</SelectItem>
                {(projects ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-white/55 text-xs">{t("time.bulkProjectTo")}</Label>
            <Select value={toProjectId} onValueChange={setToProjectId}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white max-h-64">
                <SelectItem value="__keep__">Keep</SelectItem>
                <SelectItem value="__none__">Clear</SelectItem>
                {(projects ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-white/55 text-xs">{t("time.bulkConvertCategory")}</Label>
            <Select value={toCategory} onValueChange={setToCategory}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white">
                <SelectItem value="__keep__">Keep</SelectItem>
                {CATEGORY_OPTIONS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          type="button"
          className="bg-emerald-600 hover:bg-emerald-500 text-white"
          disabled={!canApplyProject || projectMutation.isPending}
          onClick={() => projectMutation.mutate()}
        >
          {projectMutation.isPending ? "…" : t("time.bulkApply")}
        </Button>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-4">
        <div className="flex items-center gap-2 text-white/70">
          <Combine className="h-4 w-4" />
          <p className="text-sm font-medium">{t("time.bulkMergeTags")}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-white/55 text-xs">{t("time.bulkTagFrom")}</Label>
            <Select value={fromTagId || "__none__"} onValueChange={(v) => setFromTagId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white max-h-64">
                <SelectItem value="__none__">Choose…</SelectItem>
                {(tags ?? []).map((tg) => (
                  <SelectItem key={tg.id} value={tg.id}>
                    {tg.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-white/55 text-xs">{t("time.bulkTagTo")}</Label>
            <Select value={toTagId || "__none__"} onValueChange={(v) => setToTagId(v === "__none__" ? "" : v)}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white max-h-64">
                <SelectItem value="__none__">Choose…</SelectItem>
                {(tags ?? []).map((tg) => (
                  <SelectItem key={tg.id} value={tg.id}>
                    {tg.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-white/60">
          <Checkbox checked={deleteFromTag} onCheckedChange={(v) => setDeleteFromTag(v === true)} />
          {t("time.bulkDeleteFromTag")}
        </label>

        <Button
          type="button"
          variant="outline"
          className="border-white/15 text-white/70"
          disabled={!canMerge || mergeMutation.isPending}
          onClick={() => mergeMutation.mutate()}
        >
          {mergeMutation.isPending ? "…" : t("time.bulkMergeTags")}
        </Button>
      </div>
    </div>
  );
}

