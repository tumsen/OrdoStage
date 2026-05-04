import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import type { TimeProject, TimeTag } from "@/contracts/backendTypes";

export function TimeCatalogSettings() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [tagName, setTagName] = useState("");
  const [projectName, setProjectName] = useState("");

  const { data: tags } = useQuery({
    queryKey: ["time-tags"],
    queryFn: () => api.get<TimeTag[]>("/api/time/tags"),
  });

  const { data: projects } = useQuery({
    queryKey: ["time-projects"],
    queryFn: () => api.get<TimeProject[]>("/api/time/projects"),
  });

  const addTag = useMutation({
    mutationFn: (name: string) => api.post("/api/time/tags", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-tags"] });
      toast({ title: t("time.catalogTagAdded") });
      setTagName("");
    },
    onError: () => toast({ title: t("time.catalogSaveError"), variant: "destructive" }),
  });

  const addProject = useMutation({
    mutationFn: (name: string) => api.post("/api/time/projects", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-projects"] });
      toast({ title: t("time.catalogProjectAdded") });
      setProjectName("");
    },
    onError: () => toast({ title: t("time.catalogSaveError"), variant: "destructive" }),
  });

  const delTag = useMutation({
    mutationFn: (id: string) => api.delete(`/api/time/tags/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-tags"] });
      toast({ title: t("time.catalogRemoved") });
    },
    onError: () => toast({ title: t("time.catalogSaveError"), variant: "destructive" }),
  });

  const delProject = useMutation({
    mutationFn: (id: string) => api.delete(`/api/time/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-projects"] });
      toast({ title: t("time.catalogRemoved") });
    },
    onError: () => toast({ title: t("time.catalogSaveError"), variant: "destructive" }),
  });

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-6">
      <div>
        <p className="text-sm font-medium text-white">{t("time.catalogTitle")}</p>
        <p className="text-xs text-white/50 mt-1">{t("time.catalogHint")}</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <Label className="text-white/70 text-xs uppercase tracking-wide">{t("time.tagsHeading")}</Label>
          <div className="flex gap-2">
            <Input
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              placeholder={t("time.tagPlaceholder")}
              className="bg-white/5 border-white/10 text-white"
            />
            <Button
              type="button"
              className="shrink-0 bg-indigo-700 hover:bg-indigo-600"
              disabled={!tagName.trim() || addTag.isPending}
              onClick={() => addTag.mutate(tagName.trim())}
            >
              {t("time.add")}
            </Button>
          </div>
          <ul className="space-y-1.5 text-sm">
            {(tags ?? []).map((x) => (
              <li
                key={x.id}
                className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5"
              >
                <span className="text-white/85">{x.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-300"
                  disabled={delTag.isPending}
                  onClick={() => {
                    if (!confirm(t("time.catalogDeleteConfirm"))) return;
                    delTag.mutate(x.id);
                  }}
                >
                  {t("time.remove")}
                </Button>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <Label className="text-white/70 text-xs uppercase tracking-wide">{t("time.projectsHeading")}</Label>
          <div className="flex gap-2">
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder={t("time.projectPlaceholder")}
              className="bg-white/5 border-white/10 text-white"
            />
            <Button
              type="button"
              className="shrink-0 bg-indigo-700 hover:bg-indigo-600"
              disabled={!projectName.trim() || addProject.isPending}
              onClick={() => addProject.mutate(projectName.trim())}
            >
              {t("time.add")}
            </Button>
          </div>
          <ul className="space-y-1.5 text-sm">
            {(projects ?? []).map((x) => (
              <li
                key={x.id}
                className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5"
              >
                <span className="text-white/85">{x.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-300"
                  disabled={delProject.isPending}
                  onClick={() => {
                    if (!confirm(t("time.catalogDeleteConfirm"))) return;
                    delProject.mutate(x.id);
                  }}
                >
                  {t("time.remove")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
