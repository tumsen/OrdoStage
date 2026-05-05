import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronsUpDown, Lock, LockOpen } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { usePreferences } from "@/hooks/usePreferences";
import type { TimeEntry, TimeProject, TimeTag } from "@/contracts/backendTypes";
import type { TimeCategory } from "@/contracts/backendTypes";
import type { TimeFormat } from "@/lib/preferences";
import { TIME_SNAP_MINUTES } from "@/lib/timeGrid";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { displayHex, hexToRgba } from "@/lib/timeCatalogColors";

type PatchBody = {
  note: string | null;
  timeProjectId: string | null;
  tagIds: string[];
  category: TimeCategory;
  startsAt: string;
  endsAt: string;
  isLocked?: boolean;
};

function hmFromDate(d: Date): string {
  return format(d, "HH:mm");
}

/** Snap minutes-within-day and apply to the calendar day of `base`. */
function applySnappedHm(base: Date, hm: string): Date {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return base;
  let mins = Number(m[1]) * 60 + Number(m[2]);
  if (!Number.isFinite(mins)) return base;
  mins = Math.round(mins / TIME_SNAP_MINUTES) * TIME_SNAP_MINUTES;
  const cap = 24 * 60 - TIME_SNAP_MINUTES;
  mins = Math.min(Math.max(0, mins), cap);
  const out = new Date(base.getTime());
  out.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return out;
}

export function TimeEntryEditSheet(props: {
  entry: TimeEntry | null;
  /** While dragging this entry on the week grid, reflects live start/end (ISO). */
  liveRange?: { startsAt: string; endsAt: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: TimeProject[];
  tags: TimeTag[];
  onSave: (id: string, body: PatchBody) => void;
  onToggleLock: (id: string, locked: boolean) => void;
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
    liveRange = null,
    open,
    onOpenChange,
    projects,
    tags,
    onSave,
    onToggleLock,
    saving,
    onDelete,
    deleting,
    entrySummary,
  } = props;

  const liveRangeRef = useRef(liveRange);
  liveRangeRef.current = liveRange;

  const [note, setNote] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectOpen, setProjectOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState<TimeCategory>("work");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [startHm, setStartHm] = useState("09:00");
  const [endHm, setEndHm] = useState("10:00");

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

  const selectedProjectLabel = useMemo(() => {
    if (!projectId) return t("time.noProject");
    return activeProjects.find((p) => p.id === projectId)?.name ?? t("time.noProject");
  }, [projectId, activeProjects, t]);

  const selectedProjectColor = useMemo(() => {
    if (!projectId) return null;
    const p = activeProjects.find((x) => x.id === projectId);
    return p ? displayHex(p.color, p.id) : null;
  }, [projectId, activeProjects]);

  useEffect(() => {
    if (!entry || !open) return;
    setNote(entry.note ?? "");
    setProjectId(entry.timeProjectId);
    setSelectedTags(new Set(entry.tagIds));
    setCategory((entry.category as TimeCategory) ?? "work");
    setConfirmDelete(false);
    if (!liveRangeRef.current) {
      const s = parseISO(entry.startsAt);
      const e = parseISO(entry.endsAt);
      setStartHm(Number.isFinite(s.getTime()) ? hmFromDate(s) : "09:00");
      setEndHm(Number.isFinite(e.getTime()) ? hmFromDate(e) : "10:00");
    }
  }, [entry, open]);

  useEffect(() => {
    if (!liveRange || !open) return;
    const s = parseISO(liveRange.startsAt);
    const e = parseISO(liveRange.endsAt);
    if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return;
    setStartHm(hmFromDate(s));
    setEndHm(hmFromDate(e));
  }, [liveRange, open]);

  const timeRangeLabel = useMemo(() => {
    if (!entry) return "";
    const start = parseISO(liveRange?.startsAt ?? entry.startsAt);
    const end = parseISO(liveRange?.endsAt ?? entry.endsAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return "";
    const dateLabel = format(start, "EEE d MMM");
    const tf = timeFormat === "24h" ? "HH:mm" : "h:mm a";
    const sSnap = applySnappedHm(start, hmFromDate(start));
    const eSnap = applySnappedHm(end, hmFromDate(end));
    const rawDur = (end.getTime() - start.getTime()) / 60000;
    const durMin = Math.max(
      TIME_SNAP_MINUTES,
      Math.round(rawDur / TIME_SNAP_MINUTES) * TIME_SNAP_MINUTES
    );
    const durH = Math.floor(durMin / 60);
    const durM = durMin % 60;
    const durStr =
      durMin < 60 ? `${durMin} min` : durM > 0 ? `${durH}h ${durM}m` : `${durH}h`;
    return `${dateLabel} · ${format(sSnap, tf)} – ${format(eSnap, tf)} · ${durStr}`;
  }, [entry, timeFormat, liveRange]);

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
    const startBase = parseISO(entry.startsAt);
    const endBase = parseISO(entry.endsAt);
    const newStart = applySnappedHm(startBase, startHm);
    let newEnd = applySnappedHm(endBase, endHm);
    if (newEnd.getTime() <= newStart.getTime()) {
      newEnd = new Date(newEnd.getTime() + 24 * 60 * 60 * 1000);
    }
    onSave(entry.id, {
      note: note.trim() ? note.trim() : null,
      timeProjectId: projectId,
      tagIds: [...selectedTags],
      category,
      startsAt: newStart.toISOString(),
      endsAt: newEnd.toISOString(),
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
          <div className="rounded-md border border-white/10 bg-white/[0.03] p-2.5 flex items-center justify-between gap-2">
            <div className="text-xs text-white/65">
              {entry?.isLocked ? t("time.lockedEntryHint") : t("time.unlockedEntryHint")}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-white/15 text-white/80 bg-transparent"
              disabled={saving || !entry}
              onClick={() => {
                if (!entry) return;
                onToggleLock(entry.id, !entry.isLocked);
              }}
            >
              {entry?.isLocked ? (
                <>
                  <LockOpen className="h-3.5 w-3.5 mr-1" />
                  {t("time.unlockEntry")}
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5 mr-1" />
                  {t("time.lockEntry")}
                </>
              )}
            </Button>
          </div>
          <div className="grid gap-2">
            <Label className="text-white/80">{t("time.categoryLabel")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {categoryOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={entry?.isLocked}
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

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label className="text-white/80">{t("time.startTimeLabel")}</Label>
              <input
                type="time"
                step={300}
                value={startHm}
                onChange={(e) => setStartHm(e.target.value)}
                disabled={entry?.isLocked}
                className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white [color-scheme:dark]"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-white/80">{t("time.endTimeLabel")}</Label>
              <input
                type="time"
                step={300}
                value={endHm}
                onChange={(e) => setEndHm(e.target.value)}
                disabled={entry?.isLocked}
                className="h-10 rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white [color-scheme:dark]"
              />
            </div>
          </div>
          <p className="text-[11px] text-white/40 -mt-1">{t("time.fiveMinuteGridHint")}</p>

          <div className="grid gap-2">
            <Label className="text-white/80">{t("time.projectLabel")}</Label>
            <Popover open={projectOpen} onOpenChange={setProjectOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  aria-expanded={projectOpen}
                  disabled={entry?.isLocked}
                  className="w-full justify-between bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white font-normal"
                >
                  <span className="flex min-w-0 items-center gap-2 truncate text-left">
                    {selectedProjectColor ? (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/20"
                        style={{ backgroundColor: selectedProjectColor }}
                        aria-hidden
                      />
                    ) : null}
                    <span className="truncate">{selectedProjectLabel}</span>
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] p-0 bg-[#16161f] border-white/10 text-white"
                align="start"
              >
                <Command className="bg-[#16161f] text-white [&_[cmdk-input-wrapper]]:border-white/10">
                  <CommandInput
                    placeholder={t("time.searchProjects")}
                    className="text-white placeholder:text-white/35"
                  />
                  <CommandList>
                    <CommandEmpty className="text-white/50 py-4 text-sm">{t("time.noProjectMatches")}</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__none__ none"
                        onSelect={() => {
                          setProjectId(null);
                          setProjectOpen(false);
                        }}
                        className="text-white aria-selected:bg-white/10"
                      >
                        {t("time.noProject")}
                      </CommandItem>
                      {activeProjects.map((p) => {
                        const c = displayHex(p.color, p.id);
                        return (
                          <CommandItem
                            key={p.id}
                            value={`${p.name} ${p.id}`}
                            onSelect={() => {
                              setProjectId(p.id);
                              setProjectOpen(false);
                            }}
                            className="text-white aria-selected:bg-white/10"
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/20"
                                style={{ backgroundColor: c }}
                                aria-hidden
                              />
                              <span className="truncate">{p.name}</span>
                            </span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid gap-2">
            <Label className="text-white/80">{t("time.tagsLabel")}</Label>
            <div className="max-h-40 overflow-y-auto rounded-md border border-white/10 bg-white/[0.03] p-2 space-y-2">
              {sortedTags.length === 0 ? (
                <p className="text-xs text-white/45">{t("time.tagsEmpty")}</p>
              ) : (
                sortedTags.map((tag) => {
                  const c = displayHex(tag.color, tag.id);
                  return (
                    <label
                      key={tag.id}
                      className="flex items-center gap-2 text-sm cursor-pointer rounded-md px-1 py-0.5 -mx-1"
                      style={{ backgroundColor: hexToRgba(c, 0.12) }}
                    >
                      <Checkbox
                        checked={selectedTags.has(tag.id)}
                        disabled={entry?.isLocked}
                        onCheckedChange={() => toggleTag(tag.id)}
                        className="border-white/30 data-[state=checked]:bg-ordo-yellow data-[state=checked]:border-ordo-yellow data-[state=checked]:text-[#0d0d14]"
                      />
                      <span
                        className="text-white font-medium rounded px-1.5 py-0.5 text-xs"
                        style={{
                          backgroundColor: hexToRgba(c, 0.4),
                          boxShadow: `inset 0 0 0 1px ${hexToRgba(c, 0.25)}`,
                        }}
                      >
                        {tag.name}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <div className="grid gap-2">
            <Label className="text-white/80">{t("time.noteLabel")}</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("time.notePlaceholder")}
              disabled={entry?.isLocked}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/35 min-h-[100px]"
            />
          </div>
        </div>
        <SheetFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            className="w-full bg-ordo-yellow text-[#0d0d14] hover:bg-ordo-yellow/90"
            disabled={saving || !entry || entry.isLocked}
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
            disabled={deleting || !entry || entry.isLocked}
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
