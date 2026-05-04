import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
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
import { toast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import type { TimeProject, TimeTag } from "@/contracts/backendTypes";

type CatalogEventRow = {
  id: string;
  title: string;
  shows: { id: string; showDate: string; showTime: string; status: string }[];
};

const WHOLE_EVENT_VALUE = "__whole__";

export function TimeCatalogSettings() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [tagName, setTagName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [linkEventId, setLinkEventId] = useState<string>("");
  const [linkShowScope, setLinkShowScope] = useState<string>(WHOLE_EVENT_VALUE);

  const { data: tags } = useQuery({
    queryKey: ["time-tags"],
    queryFn: () => api.get<TimeTag[]>("/api/time/tags"),
  });

  const { data: projects } = useQuery({
    queryKey: ["time-projects"],
    queryFn: () => api.get<TimeProject[]>("/api/time/projects"),
  });

  const { data: catalogEvents } = useQuery({
    queryKey: ["time-catalog-event-options"],
    queryFn: () => api.get<CatalogEventRow[]>("/api/time/catalog-event-options"),
  });

  const selectedLinkEvent = useMemo(
    () => (catalogEvents ?? []).find((e) => e.id === linkEventId),
    [catalogEvents, linkEventId]
  );

  useEffect(() => {
    setLinkShowScope(WHOLE_EVENT_VALUE);
  }, [linkEventId]);

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

  const addLinkedProject = useMutation({
    mutationFn: async () => {
      if (!selectedLinkEvent) throw new Error("missing event");
      const ev = selectedLinkEvent;
      if (linkShowScope !== WHOLE_EVENT_VALUE) {
        const show = ev.shows.find((s) => s.id === linkShowScope);
        if (!show) throw new Error("missing show");
        const dateLabel = format(parseISO(show.showDate), "d MMM yyyy");
        const name = `${ev.title} · ${dateLabel} ${show.showTime}`;
        return api.post<TimeProject>("/api/time/projects", {
          name,
          eventId: ev.id,
          eventShowId: show.id,
        });
      }
      return api.post<TimeProject>("/api/time/projects", {
        name: ev.title,
        eventId: ev.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-projects"] });
      toast({ title: t("time.catalogProjectAdded") });
      setLinkEventId("");
      setLinkShowScope(WHOLE_EVENT_VALUE);
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

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 space-y-3">
        <Label className="text-white/70 text-xs uppercase tracking-wide">{t("time.linkFromEventsHeading")}</Label>
        <p className="text-xs text-white/45">{t("time.linkFromEventsHint")}</p>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1 grid gap-2 sm:grid-cols-2">
            <Select value={linkEventId} onValueChange={setLinkEventId}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue placeholder={t("time.selectEventPlaceholder")} />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white max-h-56">
                {(catalogEvents ?? []).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={linkShowScope}
              onValueChange={setLinkShowScope}
              disabled={!selectedLinkEvent}
            >
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue placeholder={t("time.selectShowPlaceholder")} />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white max-h-56">
                <SelectItem value={WHOLE_EVENT_VALUE}>{t("time.wholeEventProject")}</SelectItem>
                {(selectedLinkEvent?.shows ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {format(parseISO(s.showDate), "EEE d MMM")} · {s.showTime}
                    {s.status === "cancelled" ? ` (${t("time.showCancelled")})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            className="shrink-0 bg-violet-700 hover:bg-violet-600"
            disabled={!linkEventId || addLinkedProject.isPending}
            onClick={() => addLinkedProject.mutate()}
          >
            {t("time.addLinkedProject")}
          </Button>
        </div>
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
                <span className="text-white/85 min-w-0">
                  {x.name}
                  {x.eventShowId ? (
                    <span className="block text-[10px] text-white/40 truncate">{t("time.projectLinkedShow")}</span>
                  ) : x.eventId ? (
                    <span className="block text-[10px] text-white/40 truncate">{t("time.projectLinkedEvent")}</span>
                  ) : null}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:text-red-300 shrink-0"
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
