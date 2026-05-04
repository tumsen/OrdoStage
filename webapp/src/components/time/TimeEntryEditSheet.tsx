import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { useI18n } from "@/lib/i18n";
import { usePreferences } from "@/hooks/usePreferences";
import type { TimeEntry, TimeProject, TimeTag } from "@/contracts/backendTypes";
import type { TimeCategory } from "@/contracts/backendTypes";
import type { TimeFormat } from "@/lib/preferences";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type PatchBody = {
  note: string | null;
  timeProjectId: string | null;
  tagIds: string[];
  category: TimeCategory;
};

export function TimeEntryEditSheet(props: {
  entry: TimeEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: TimeProject[];
  tags: TimeTag[];
  onSave: (id: string, body: PatchBody) => void;
  saving: boolean;
  onDelete: (id: string) => void;
  deleting: boolean;
  entrySummary?: string | null;
}) {
  const { t } = useI18n();
  const { effective } = usePreferences();
  const timeFormat: TimeFormat = effective?.timeFormat ?? "24h";
  const {
    entry,
    open,
    onOpenChange,
    projects,
    tags,
    onSave,
    saving,
    onDelete,
    deleting,
    entrySummary,
  } = props;

  const [note, setNote] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState<TimeCategory>("work");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const activeProjects = useMemo(
    () =>
      [...projects]
        .filter((p) => !p.isArchived)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [projects]
  );

  const sortedTags = useMemo(
    () => [...tags].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [tags]
  );

  useEffect(() => {
    if (!entry || !open) return;
    setNote(entry.note ?? "");
    setProjectId(entry.timeProjectId);
    setSelectedTags(new Set(entry.tagIds));
    setCategory((entry.category as TimeCategory) ?? "work");
    setConfirmDelete(false);
  }, [entry, open]);

  const timeRangeLabel = useMemo(() => {
    if (!entry) return "";
    const start = parseISO(entry.startsAt);
    const end = parseISO(entry.endsAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return "";
    const dateLabel = format(start, "EEE d MMM");
    const tf = timeFormat === "24h" ? "HH:mm" : "h:mm a";
    return `${dateLabel} · ${format(start, tf)} – ${format(end, tf)}`;
  }, [entry, timeFormat]);

  function toggleTag(id: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave() {
    if (!entry) return;
    onSave(entry.id, {
      note: note.trim() ? note.trim() : null,
      timeProjectId: projectId,
      tagIds: [...selectedTags],
      category,
    });
  }

  function handleDelete() {
    if (!entry) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(entry.id);
  }

  const categoryOptions: { value: TimeCategory; label: string; color: string }[] = [
    { value: "work", label: t("time.categoryWork"), color: "text-blue-300" },
    { value: "vacation", label: t("time.categoryVacation"), color: "text-emerald-300" },
    { value: "sick", label: t("time.categorySick"), color: "text-orange-300" },
    { value: "holiday", label: t("time.categoryHoliday"), color: "text-purple-300" },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-[#0d0d14] border-white/10 text-white w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-white">{t("time.editEntry")}</SheetTitle>
          <SheetDescription className="text-white/55">
            {timeRangeLabel}
            {entrySummary ? (
              <span className="block mt-1 text-white/70">{entrySummary}</span>
            ) : null}
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label className="text-white/80">{t("time.categoryLabel")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {categoryOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCategory(opt.value)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm font-medium transition-colors text-left",
                    category === opt.value
                      ? "border-ordo-yellow bg-ordo-yellow/10 text-white"
                      : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.07]"
                  )}
                >
                  <span className={cn("block text-xs mb-0.5", opt.color)}>
                    {opt.value === "work" ? "●" : opt.value === "vacation" ? "●" : opt.value === "sick" ? "●" : "●"}
                  </span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label className="text-white/80">{t("time.projectLabel")}</Label>
            <Select
              value={projectId ?? "none"}
              onValueChange={(v) => setProjectId(v === "none" ? null : v)}
            >
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue placeholder={t("time.noProject")} />
              </SelectTrigger>
              <SelectContent className="bg-[#16161f] border-white/10 text-white max-h-60">
                <SelectItem value="none">{t("time.noProject")}</SelectItem>
                {activeProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label className="text-white/80">{t("time.tagsLabel")}</Label>
            <div className="max-h-40 overflow-y-auto rounded-md border border-white/10 bg-white/[0.03] p-2 space-y-2">
              {sortedTags.length === 0 ? (
                <p className="text-xs text-white/45">{t("time.tagsEmpty")}</p>
              ) : (
                sortedTags.map((tag) => (
                  <label
                    key={tag.id}
                    className="flex items-center gap-2 text-sm text-white/85 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedTags.has(tag.id)}
                      onCheckedChange={() => toggleTag(tag.id)}
                      className="border-white/30 data-[state=checked]:bg-ordo-yellow data-[state=checked]:border-ordo-yellow data-[state=checked]:text-[#0d0d14]"
                    />
                    <span>{tag.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
          <div className="grid gap-2">
            <Label className="text-white/80">{t("time.noteLabel")}</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("time.notePlaceholder")}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/35 min-h-[100px]"
            />
          </div>
        </div>
        <SheetFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            className="w-full bg-ordo-yellow text-[#0d0d14] hover:bg-ordo-yellow/90"
            disabled={saving || !entry}
            onClick={handleSave}
          >
            {saving ? t("time.saving") : t("time.saveEntry")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "w-full border-white/15",
              confirmDelete ? "border-red-400/50 text-red-300 hover:bg-red-950/50" : "text-white/70"
            )}
            disabled={deleting || !entry}
            onClick={handleDelete}
          >
            {confirmDelete ? t("time.deleteEntryConfirm") : t("time.deleteEntry")}
          </Button>
          {confirmDelete ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full text-white/60"
              onClick={() => setConfirmDelete(false)}
            >
              {t("time.cancelDelete")}
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
