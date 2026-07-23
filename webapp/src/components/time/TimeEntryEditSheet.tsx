import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { format, parseISO } from "date-fns";
import { Copy, ChevronsUpDown, Lock, LockOpen } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api";
import { usePreferences } from "@/hooks/usePreferences";
import type { TimeEntry, TimeParentCategory, TimeProject, TimeTag } from "@/contracts/backendTypes";
import type { TimeCategory } from "@/contracts/backendTypes";
import type { TimeFormat } from "@/lib/preferences";
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
import { isDayOffCategory, isLeaveAutoProjectCategory, isVacationNoteOnlyCategory, leaveCategoryFromSystemKey } from "@/lib/timeCategoryI18n";
import { isTimesheetSettlementFillEntry, timeEntryUserVisibleNote } from "@/lib/timeEntryNotes";
import {
  clampDayOffDurationMinutes,
  formatWorkDayDuration,
} from "@/lib/leaveNorms";
import { useAutoSaveDraft } from "@/hooks/useAutoSaveDraft";
import { AutoSaveStatus } from "@/components/AutoSaveStatus";
import { displayHex, hexToRgba } from "@/lib/timeCatalogColors";
import {
  SplitDurationHhMmInput,
  SplitTimeInput,
} from "@/components/SplitTimeField";

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

/** Apply wall-clock HH:mm to the calendar day of `base` (no grid snapping — edit sheet allows any minute). */
function applyExactHm(base: Date, hm: string): Date {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return base;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return base;
  const h = Math.min(23, Math.max(0, hh));
  const min = Math.min(59, Math.max(0, mm));
  const out = new Date(base.getTime());
  out.setHours(h, min, 0, 0);
  return out;
}

function endHmFromStartAndDuration(
  startBase: Date,
  startHm: string,
  durationMin: number
): string {
  const start = applyExactHm(startBase, startHm);
  const end = new Date(start.getTime() + durationMin * 60_000);
  return hmFromDate(end);
}

function resolveEntryRange(
  entry: TimeEntry,
  startHm: string,
  endHm: string,
  category: TimeCategory,
  dayOffDurationMin: number,
  workDayDurationMinutes: number
): { start: Date; end: Date; durationMin: number } {
  const startBase = parseISO(entry.startsAt);
  const endBase = parseISO(entry.endsAt);
  const newStart = applyExactHm(startBase, startHm);
  if (isDayOffCategory(category) && workDayDurationMinutes > 0) {
    const dur = clampDayOffDurationMinutes(dayOffDurationMin, workDayDurationMinutes);
    const newEnd = new Date(newStart.getTime() + dur * 60_000);
    return { start: newStart, end: newEnd, durationMin: dur };
  }
  let newEnd = applyExactHm(endBase, endHm);
  if (newEnd.getTime() <= newStart.getTime()) {
    newEnd = new Date(newEnd.getTime() + 24 * 60 * 60 * 1000);
  }
  const durationMin = Math.max(1, Math.round((newEnd.getTime() - newStart.getTime()) / 60000));
  return { start: newStart, end: newEnd, durationMin };
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
  /** Enter copy mode with this entry (parent pastes on next day click). */
  onCopy?: (entry: TimeEntry) => void;
  entrySummary?: string | null;
  leaveManagementEnabled?: boolean;
  /** One vacation/sick day in minutes (weekly contract ÷ 5). */
  workDayDurationMinutes?: number;
}) {
  const { t } = useI18n();
  const isMobile = useIsMobile();
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
    onCopy,
    entrySummary,
    leaveManagementEnabled = false,
    workDayDurationMinutes = 0,
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
  const [dayOffDurationMin, setDayOffDurationMin] = useState(0);

  const activeProjects = useMemo(
    () =>
      [...projects]
        .filter((p) => {
          if (p.isArchived) return false;
          // Manual projects + Fravær system projects (Ferie / Sygdom / …)
          if (!p.systemKey) return true;
          return p.systemKey.startsWith("leave_");
        })
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [projects]
  );

  const { data: parentCategories = [] } = useQuery({
    queryKey: ["time-parent-categories"],
    queryFn: () => api.get<TimeParentCategory[]>("/api/time/parent-categories"),
    enabled: open,
  });

  const projectsByParentCategory = useMemo(() => {
    const categoryNameById = new Map(parentCategories.map((c) => [c.id, c.name]));
    const groups = new Map<string, { label: string; projects: TimeProject[] }>();
    for (const project of activeProjects) {
      const key = project.timeParentCategoryId ?? "__none__";
      const label = project.timeParentCategoryId
        ? (categoryNameById.get(project.timeParentCategoryId) ?? t("time.parentCategoryNone"))
        : t("time.parentCategoryNone");
      if (!groups.has(key)) groups.set(key, { label, projects: [] });
      groups.get(key)!.projects.push(project);
    }
    const ordered: Array<{ key: string; label: string; projects: TimeProject[] }> = [];
    for (const cat of parentCategories) {
      const group = groups.get(cat.id);
      if (group) ordered.push({ key: cat.id, ...group });
    }
    const uncategorized = groups.get("__none__");
    if (uncategorized) ordered.push({ key: "__none__", ...uncategorized });
    for (const [key, group] of groups) {
      if (key !== "__none__" && !parentCategories.some((c) => c.id === key)) {
        ordered.push({ key, ...group });
      }
    }
    return ordered;
  }, [activeProjects, parentCategories, t]);

  const sortedTags = useMemo(
    () => [...tags].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [tags]
  );

  const selectedProjectLabel = useMemo(() => {
    if (!projectId) return t("time.projectRequiredPlaceholder");
    return activeProjects.find((p) => p.id === projectId)?.name ?? t("time.projectRequiredPlaceholder");
  }, [projectId, activeProjects, t]);

  const selectedProjectColor = useMemo(() => {
    if (!projectId) return null;
    const p = activeProjects.find((x) => x.id === projectId);
    return p ? displayHex(p.color, p.id) : null;
  }, [projectId, activeProjects]);

  useEffect(() => {
    if (!entry || !open) return;
    setNote(timeEntryUserVisibleNote(entry.note));
    setProjectId(entry.timeProjectId);
    setSelectedTags(new Set(entry.tagIds));
    const entryCategory = (entry.category as TimeCategory) ?? "work";
    setCategory(entryCategory);
    setConfirmDelete(false);
    if (!liveRangeRef.current) {
      const s = parseISO(entry.startsAt);
      const e = parseISO(entry.endsAt);
      const startVal = Number.isFinite(s.getTime()) ? hmFromDate(s) : "08:00";
      setStartHm(startVal);
      if (isDayOffCategory(entryCategory) && workDayDurationMinutes > 0) {
        const dur = Math.round((e.getTime() - s.getTime()) / 60000);
        const clamped = clampDayOffDurationMinutes(dur, workDayDurationMinutes);
        setDayOffDurationMin(clamped);
        setEndHm(endHmFromStartAndDuration(s, startVal, clamped));
      } else {
        setEndHm(Number.isFinite(e.getTime()) ? hmFromDate(e) : "10:00");
        setDayOffDurationMin(workDayDurationMinutes);
      }
    }
  }, [entry, open, workDayDurationMinutes]);

  useEffect(() => {
    if (!liveRange || !open) return;
    const s = parseISO(liveRange.startsAt);
    const e = parseISO(liveRange.endsAt);
    if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return;
    const startVal = hmFromDate(s);
    setStartHm(startVal);
    if (isDayOffCategory(category) && workDayDurationMinutes > 0) {
      const dur = clampDayOffDurationMinutes(
        Math.round((e.getTime() - s.getTime()) / 60000),
        workDayDurationMinutes
      );
      setDayOffDurationMin(dur);
      setEndHm(endHmFromStartAndDuration(s, startVal, dur));
    } else {
      setEndHm(hmFromDate(e));
    }
  }, [liveRange, open, category, workDayDurationMinutes]);

  const timeRangeLabel = useMemo(() => {
    if (!entry) return "";
    const startBase = parseISO(liveRange?.startsAt ?? entry.startsAt);
    if (!Number.isFinite(startBase.getTime())) return "";
    const dateLabel = format(startBase, "EEE d MMM");
    const tf = timeFormat === "24h" ? "HH:mm" : "h:mm a";
    const { start: sExact, end: eExact, durationMin: durMin } = resolveEntryRange(
      entry,
      startHm,
      endHm,
      category,
      dayOffDurationMin,
      workDayDurationMinutes
    );
    const durH = Math.floor(durMin / 60);
    const durM = durMin % 60;
    const durStr =
      durMin < 60 ? `${durMin} min` : durM > 0 ? `${durH}h ${durM}m` : `${durH}h`;
    return `${dateLabel} · ${format(sExact, tf)} – ${format(eExact, tf)} · ${durStr}`;
  }, [entry, timeFormat, liveRange, startHm, endHm, category, dayOffDurationMin, workDayDurationMinutes]);

  function toggleTag(id: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function buildPatchBody(): PatchBody | null {
    if (!entry) return null;
    const { start: newStart, end: newEnd } = resolveEntryRange(
      entry,
      startHm,
      endHm,
      category,
      dayOffDurationMin,
      workDayDurationMinutes
    );
    const trimmedNote = note.trim();
    let noteOut: string | null = trimmedNote || null;
    if (!trimmedNote && isTimesheetSettlementFillEntry(entry) && entry.note?.trim()) {
      noteOut = entry.note.trim();
    }
    return {
      note: noteOut,
      timeProjectId: isVacationNoteOnlyCategory(category)
        ? null
        : usesLeaveSystemProject
          ? null
          : projectId,
      tagIds: isVacationNoteOnlyCategory(category) ? [] : [...selectedTags],
      category,
      startsAt: newStart.toISOString(),
      endsAt: newEnd.toISOString(),
    };
  }

  const entryAutoSave = useAutoSaveDraft({
    enabled: open && Boolean(entry) && !entry?.isLocked,
    resetKey: entry?.id,
    getSnapshot: () => ({
      note,
      projectId,
      tagIds: [...selectedTags].sort(),
      category,
      startHm,
      endHm,
      dayOffDurationMin,
    }),
    save: async () => {
      const body = buildPatchBody();
      if (!entry || !body) return;
      onSave(entry.id, body);
    },
  });

  const sheetOnOpenChange = (next: boolean) => {
    if (!next && open) {
      void entryAutoSave.flush().finally(() => onOpenChange(false));
      return;
    }
    onOpenChange(next);
  };

  function handleDelete() {
    if (!entry) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(entry.id);
  }

  const applyWorkDayDuration = (nextCategory: TimeCategory) => {
    if (!workDayDurationMinutes || !isDayOffCategory(nextCategory) || !entry) return;
    setDayOffDurationMin(workDayDurationMinutes);
    setEndHm(
      endHmFromStartAndDuration(parseISO(entry.startsAt), startHm, workDayDurationMinutes)
    );
  };

  const setDayOffDuration = (minutes: number) => {
    if (!entry || workDayDurationMinutes <= 0) return;
    const clamped = clampDayOffDurationMinutes(minutes, workDayDurationMinutes);
    setDayOffDurationMin(clamped);
    setEndHm(endHmFromStartAndDuration(parseISO(entry.startsAt), startHm, clamped));
  };

  const handleStartHmChange = (nextStartHm: string) => {
    setStartHm(nextStartHm);
    if (!entry) return;
    if (isDayOffCategory(category) && workDayDurationMinutes > 0) {
      setEndHm(
        endHmFromStartAndDuration(parseISO(entry.startsAt), nextStartHm, dayOffDurationMin)
      );
    }
  };

  const isDayOff = isDayOffCategory(category);
  const isVacationNoteOnly = isVacationNoteOnlyCategory(category);
  const usesLeaveSystemProject = isLeaveAutoProjectCategory(category);
  const dayOffMaxLabel = formatWorkDayDuration(workDayDurationMinutes);

  const categoryOptions: { value: TimeCategory; label: string; color: string }[] = [
    { value: "work", label: t("time.categoryWork"), color: "text-blue-300" },
    { value: "vacation", label: t("time.categoryVacation"), color: "text-emerald-300" },
    ...(leaveManagementEnabled
      ? [
          { value: "extra_vacation" as const, label: t("time.categoryExtraVacation"), color: "text-teal-300" },
          { value: "comp_time" as const, label: t("time.categoryUnavailable"), color: "text-cyan-300" },
        ]
      : []),
    { value: "sick", label: t("time.categorySick"), color: "text-orange-300" },
    { value: "holiday", label: t("time.categoryHoliday"), color: "text-purple-300" },
    { value: "travel_allowance", label: t("time.categoryTravelAllowance"), color: "text-amber-300" },
  ];

  return (
    <Sheet open={open} onOpenChange={sheetOnOpenChange}>
      <SheetContent
        className={cn(
          "bg-[#0d0d14] border-white/10 text-white w-full sm:max-w-md",
          isMobile
            ? "flex h-[100dvh] max-h-[100dvh] flex-col gap-0 overflow-hidden p-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
            : "overflow-y-auto"
        )}
      >
        <SheetHeader className={cn(isMobile && "shrink-0 space-y-0.5 text-left")}>
          <SheetTitle className={cn("text-white", isMobile && "text-base")}>
            {t("time.editEntry")}
          </SheetTitle>
          <SheetDescription
            className={cn("text-white/55", isMobile && "text-xs leading-snug line-clamp-2")}
          >
            {timeRangeLabel}
            {entrySummary ? (
              <span className="block mt-0.5 text-white/70 truncate">{entrySummary}</span>
            ) : null}
          </SheetDescription>
        </SheetHeader>
        <div
          className={cn(
            "grid gap-4",
            isMobile
              ? "min-h-0 flex-1 grid-rows-[auto_auto_auto_auto_minmax(0,1fr)] gap-2 overflow-hidden py-2"
              : "py-4"
          )}
          onBlurCapture={entryAutoSave.onBlurCapture}
        >
          <div
            className={cn(
              "rounded-md border border-white/10 bg-white/[0.03] flex items-center justify-between gap-2",
              isMobile ? "p-2" : "p-2.5"
            )}
          >
            <div className={cn("text-white/65", isMobile ? "text-[10px] leading-tight" : "text-xs")}>
              {entry?.isLocked ? t("time.lockedEntryHint") : t("time.unlockedEntryHint")}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "border-white/15 text-white/80 bg-transparent shrink-0",
                isMobile && "h-7 px-2 text-[10px]"
              )}
              disabled={saving || !entry}
              onClick={() => {
                if (!entry) return;
                onToggleLock(entry.id, !entry.isLocked);
              }}
            >
              {entry?.isLocked ? (
                <>
                  <LockOpen className={cn("mr-1", isMobile ? "h-3 w-3" : "h-3.5 w-3.5")} />
                  {t("time.unlockEntry")}
                </>
              ) : (
                <>
                  <Lock className={cn("mr-1", isMobile ? "h-3 w-3" : "h-3.5 w-3.5")} />
                  {t("time.lockEntry")}
                </>
              )}
            </Button>
          </div>
          <div className="grid gap-1.5">
            <Label className={cn("text-white/80", isMobile && "text-xs")}>{t("time.categoryLabel")}</Label>
            <div className={cn("grid gap-1.5", isMobile ? "grid-cols-5" : "grid-cols-2 gap-2")}>
              {categoryOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={entry?.isLocked}
                  onClick={() => {
                    setCategory(opt.value);
                    if (isVacationNoteOnlyCategory(opt.value)) {
                      setProjectId(null);
                      setSelectedTags(new Set());
                    } else if (isLeaveAutoProjectCategory(opt.value)) {
                      setProjectId(null);
                    }
                    applyWorkDayDuration(opt.value);
                  }}
                  className={cn(
                    "rounded-md border font-medium transition-colors text-center",
                    isMobile ? "px-1 py-1.5 text-[9px] leading-tight" : "px-3 py-2 text-sm text-left",
                    category === opt.value
                      ? "border-ordo-yellow bg-ordo-yellow/10 text-white"
                      : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.07]"
                  )}
                >
                  {!isMobile ? <span className={cn("block text-xs mb-0.5", opt.color)}>●</span> : null}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {isDayOff && workDayDurationMinutes > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-2 items-end">
                <div className="grid gap-1">
                  <Label className={cn("text-white/80", isMobile && "text-xs")}>
                    {t("time.startTimeLabel")}
                  </Label>
                  <SplitTimeInput
                    value={startHm}
                    onChange={handleStartHmChange}
                    disabled={entry?.isLocked}
                    aria-label={t("time.startTimeLabel")}
                    className={isMobile ? "h-8" : undefined}
                  />
                </div>
                <div className="grid gap-1">
                  <Label className={cn("text-white/80", isMobile && "text-xs")}>
                    {t("time.dayOffDurationLabel")}{" "}
                    <span className="text-white/40 font-normal">
                      ({t("time.dayOffDurationMax", { max: dayOffMaxLabel })})
                    </span>
                  </Label>
                  <SplitDurationHhMmInput
                    valueMinutes={dayOffDurationMin}
                    onChangeMinutes={(mins) => setDayOffDuration(mins)}
                    disabled={entry?.isLocked}
                    aria-label={t("time.dayOffDurationLabel")}
                    className={isMobile ? "h-8" : undefined}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2 items-end">
              <div className="grid gap-1">
                <Label className={cn("text-white/80", isMobile && "text-xs")}>{t("time.startTimeLabel")}</Label>
                <SplitTimeInput
                  value={startHm}
                  onChange={setStartHm}
                  disabled={entry?.isLocked}
                  aria-label={t("time.startTimeLabel")}
                  className={isMobile ? "h-8" : undefined}
                />
              </div>
              <div className="grid gap-1">
                <Label className={cn("text-white/80", isMobile && "text-xs")}>{t("time.endTimeLabel")}</Label>
                <SplitTimeInput
                  value={endHm}
                  onChange={setEndHm}
                  disabled={entry?.isLocked}
                  aria-label={t("time.endTimeLabel")}
                  className={isMobile ? "h-8" : undefined}
                />
              </div>
            </div>
          )}
          {isDayOff && workDayDurationMinutes > 0 ? (
            !isMobile ? (
              <p className="text-[11px] text-white/40 -mt-1">{t("time.dayOffEditHint")}</p>
            ) : null
          ) : !isMobile ? (
            <p className="text-[11px] text-white/40 -mt-1">{t("time.editTimePreciseHint")}</p>
          ) : null}

          {!usesLeaveSystemProject && !isVacationNoteOnly ? (
          <div className="grid gap-1.5">
            <Label className={cn("text-white/80", isMobile && "text-xs")}>{t("time.projectLabel")}</Label>
            <Popover open={projectOpen} onOpenChange={setProjectOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  aria-expanded={projectOpen}
                  disabled={entry?.isLocked}
                  className={cn(
                    "w-full justify-between bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white font-normal",
                    isMobile && "h-8 text-xs"
                  )}
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
                    {projectsByParentCategory.map((group) => (
                      <CommandGroup key={group.key} heading={group.label}>
                        {group.projects.map((p) => {
                          const c = displayHex(p.color, p.id);
                          return (
                            <CommandItem
                              key={p.id}
                              value={`${group.label} ${p.name} ${p.id}`}
                              onSelect={() => {
                                setProjectId(p.id);
                                const leaveCat = leaveCategoryFromSystemKey(p.systemKey);
                                if (leaveCat) {
                                  setCategory(leaveCat);
                                  if (isVacationNoteOnlyCategory(leaveCat)) {
                                    setSelectedTags(new Set());
                                  }
                                  applyWorkDayDuration(leaveCat);
                                }
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
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          ) : null}
          {!isVacationNoteOnly ? (
          <div className={cn("grid gap-1.5 min-h-0", isMobile && "overflow-hidden")}>
            <Label className={cn("text-white/80", isMobile && "text-xs")}>{t("time.tagsLabel")}</Label>
            <div
              className={cn(
                "rounded-md border border-white/10 bg-white/[0.03] p-2",
                isMobile
                  ? "flex min-h-0 flex-1 flex-wrap gap-1.5 overflow-hidden content-start"
                  : "max-h-40 space-y-2 overflow-y-auto"
              )}
            >
              {sortedTags.length === 0 ? (
                <p className="text-xs text-white/45">{t("time.tagsEmpty")}</p>
              ) : (
                sortedTags.map((tag) => {
                  const c = displayHex(tag.color, tag.id);
                  return (
                    <label
                      key={tag.id}
                      className={cn(
                        "flex items-center gap-1.5 cursor-pointer rounded-md",
                        isMobile ? "text-[10px] px-1 py-0.5 shrink-0" : "text-sm px-1 py-0.5 -mx-1 gap-2"
                      )}
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
          ) : null}
          <div className={cn("grid gap-1.5", isMobile && "min-h-0")}>
            <Label className={cn("text-white/80", isMobile && "text-xs")}>{t("time.noteLabel")}</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("time.notePlaceholder")}
              disabled={entry?.isLocked}
              className={cn(
                "bg-white/5 border-white/10 text-white placeholder:text-white/35 resize-none",
                isMobile ? "min-h-0 h-14 text-xs" : "min-h-[100px]"
              )}
            />
          </div>
        </div>
        <SheetFooter
          className={cn(
            "flex-col gap-2 sm:flex-col",
            isMobile && "shrink-0 border-t border-white/10 pt-2 mt-0"
          )}
        >
          <AutoSaveStatus
            status={saving ? "saving" : entryAutoSave.status}
            error={entryAutoSave.error}
            className="w-full justify-center"
          />
          {onCopy && entry ? (
            <Button
              type="button"
              variant="outline"
              className="w-full border-white/15 text-white/80"
              disabled={saving || deleting}
              onClick={() => {
                const source = entry;
                void entryAutoSave.flush().finally(() => {
                  onCopy(source);
                  onOpenChange(false);
                });
              }}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              {t("time.copyEntry")}
            </Button>
          ) : null}
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
