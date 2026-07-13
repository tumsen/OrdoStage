import { useEffect, useMemo, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { format, parseISO } from "date-fns";
import { ChevronsUpDown, Lock, LockOpen } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { usePreferences } from "@/hooks/usePreferences";
import type { TimeEntry, TimeProject, TimeTag } from "@/contracts/backendTypes";
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
import { isDayOffCategory } from "@/lib/timeCategoryI18n";
import { isFullWorkDayDuration } from "@/lib/leaveNorms";
import { useAutoSaveDraft } from "@/hooks/useAutoSaveDraft";
import { AutoSaveStatus } from "@/components/AutoSaveStatus";
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
    const startBase = parseISO(liveRange?.startsAt ?? entry.startsAt);
    const endBase = parseISO(liveRange?.endsAt ?? entry.endsAt);
    if (!Number.isFinite(startBase.getTime()) || !Number.isFinite(endBase.getTime())) return "";
    const dateLabel = format(startBase, "EEE d MMM");
    const tf = timeFormat === "24h" ? "HH:mm" : "h:mm a";
    const sExact = applyExactHm(startBase, startHm);
    let eExact = applyExactHm(endBase, endHm);
    if (eExact.getTime() <= sExact.getTime()) {
      eExact = new Date(eExact.getTime() + 24 * 60 * 60 * 1000);
    }
    const durMin = Math.max(1, Math.round((eExact.getTime() - sExact.getTime()) / 60000));
    const durH = Math.floor(durMin / 60);
    const durM = durMin % 60;
    const durStr =
      durMin < 60 ? `${durMin} min` : durM > 0 ? `${durH}h ${durM}m` : `${durH}h`;
    return `${dateLabel} · ${format(sExact, tf)} – ${format(eExact, tf)} · ${durStr}`;
  }, [entry, timeFormat, liveRange, startHm, endHm]);

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
    const startBase = parseISO(entry.startsAt);
    const endBase = parseISO(entry.endsAt);
    const newStart = applyExactHm(startBase, startHm);
    let newEnd = applyExactHm(endBase, endHm);
    if (newEnd.getTime() <= newStart.getTime()) {
      newEnd = new Date(newEnd.getTime() + 24 * 60 * 60 * 1000);
    }
    return {
      note: note.trim() ? note.trim() : null,
      timeProjectId: projectId,
      tagIds: [...selectedTags],
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
    if (!workDayDurationMinutes || !isDayOffCategory(nextCategory)) return;
    setDayOffDurationMinutes(workDayDurationMinutes);
  };

  const setDayOffDurationMinutes = (minutes: number) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(startHm.trim());
    if (!m) return;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return;
    const start = new Date();
    start.setHours(hh, mm, 0, 0);
    const end = new Date(start.getTime() + minutes * 60_000);
    setEndHm(hmFromDate(end));
  };

  const isDayOff = isDayOffCategory(category);
  const dayOffDurationMin = useMemo(() => {
    if (!entry) return 0;
    const startBase = parseISO(entry.startsAt);
    const sExact = applyExactHm(startBase, startHm);
    let eExact = applyExactHm(parseISO(entry.endsAt), endHm);
    if (eExact.getTime() <= sExact.getTime()) {
      eExact = new Date(eExact.getTime() + 24 * 60 * 60 * 1000);
    }
    return Math.max(1, Math.round((eExact.getTime() - sExact.getTime()) / 60000));
  }, [entry, startHm, endHm]);

  const categoryOptions: { value: TimeCategory; label: string; color: string }[] = [
    { value: "work", label: t("time.categoryWork"), color: "text-blue-300" },
    { value: "vacation", label: t("time.categoryVacation"), color: "text-emerald-300" },
    ...(leaveManagementEnabled
      ? [
          { value: "extra_vacation" as const, label: t("time.categoryExtraVacation"), color: "text-teal-300" },
          { value: "comp_time" as const, label: t("time.categoryCompTime"), color: "text-cyan-300" },
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

          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label className={cn("text-white/80", isMobile && "text-xs")}>{t("time.startTimeLabel")}</Label>
              <input
                type="time"
                step={60}
                value={startHm}
                onChange={(e) => setStartHm(e.target.value)}
                disabled={entry?.isLocked}
                className={cn(
                  "rounded-md border border-white/10 bg-white/5 px-2 text-white [color-scheme:dark]",
                  isMobile ? "h-8 text-xs" : "h-10 px-3 text-sm"
                )}
              />
            </div>
            <div className="grid gap-1">
              <Label className={cn("text-white/80", isMobile && "text-xs")}>{t("time.endTimeLabel")}</Label>
              <input
                type="time"
                step={60}
                value={endHm}
                onChange={(e) => setEndHm(e.target.value)}
                disabled={entry?.isLocked}
                className={cn(
                  "rounded-md border border-white/10 bg-white/5 px-2 text-white [color-scheme:dark]",
                  isMobile ? "h-8 text-xs" : "h-10 px-3 text-sm"
                )}
              />
            </div>
          </div>
          {isDayOff && workDayDurationMinutes > 0 ? (
            <div className="flex flex-wrap gap-2 -mt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={entry?.isLocked}
                className={cn(
                  "border-white/15 text-white/75 bg-transparent hover:bg-white/5",
                  isFullWorkDayDuration(dayOffDurationMin, workDayDurationMinutes) &&
                    "border-ordo-yellow/50 bg-ordo-yellow/10 text-white"
                )}
                onClick={() => setDayOffDurationMinutes(workDayDurationMinutes)}
              >
                {t("time.dayOffSetFullDay")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={entry?.isLocked}
                className={cn(
                  "border-white/15 text-white/75 bg-transparent hover:bg-white/5",
                  isFullWorkDayDuration(dayOffDurationMin, Math.round(workDayDurationMinutes / 2)) &&
                    "border-ordo-yellow/50 bg-ordo-yellow/10 text-white"
                )}
                onClick={() =>
                  setDayOffDurationMinutes(Math.round(workDayDurationMinutes / 2))
                }
              >
                {t("time.dayOffSetHalfDay")}
              </Button>
            </div>
          ) : null}
          {!isMobile ? (
            <p className="text-[11px] text-white/40 -mt-1">
              {isDayOff ? t("time.dayOffEditHint") : t("time.editTimePreciseHint")}
            </p>
          ) : null}

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
