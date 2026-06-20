import { useState } from "react";
import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EventDetail, Person, TimeCategory, TourDetail, Venue } from "../../../../backend/src/types";
import {
  ORDO_STAGE_BRAND_COLORS,
  YEAR_DISC_MAX_RINGS,
  YEAR_DISC_RING_PALETTE,
  createYearDiscRing,
  hasCustomYearDiscRingColors,
  matchSourceOption,
  resetYearDiscRingColors,
  ringNeedsEntityPicker,
  yearDiscRingColor,
  yearDiscRingLabel,
  yearDiscSourceOptions,
  type YearDiscConfig,
  type YearDiscResolveContext,
  type YearDiscRingConfig,
  type YearDiscRingSource,
} from "@/components/schedule/yearDiscConfig";

function sourceSelectValue(source: YearDiscRingSource): string {
  const options = yearDiscSourceOptions();
  const match = options.find((opt) => matchSourceOption(source, opt.value));
  if (match) {
    if (source.type === "time_person" && source.categories?.length === 1) {
      return `time_person:${source.categories[0]}`;
    }
    if (source.type === "time_person" && !source.categories?.length) {
      return "time_person:all";
    }
    return matchSourceOption(source, match.value) ? `${match.group}:${JSON.stringify(match.value)}` : "custom";
  }
  return "custom";
}

function parseSourceSelectValue(value: string): YearDiscRingSource | null {
  if (value === "time_person:all") {
    return { type: "time_person", personId: "", categories: [] };
  }
  const personCat = /^time_person:(work|vacation|sick|holiday|travel_allowance)$/.exec(value);
  if (personCat) {
    return { type: "time_person", personId: "", categories: [personCat[1] as TimeCategory] };
  }
  try {
    const idx = value.indexOf(":");
    if (idx === -1) return null;
    const json = value.slice(idx + 1);
    return JSON.parse(json) as YearDiscRingSource;
  } catch {
    return null;
  }
}

function sourceSelectOptions(): Array<{ value: string; label: string; group: string }> {
  const out: Array<{ value: string; label: string; group: string }> = [];
  for (const opt of yearDiscSourceOptions()) {
    if (opt.value.type === "time_person" && !opt.value.categories?.length) {
      out.push({ value: "time_person:all", label: opt.label, group: opt.group });
      continue;
    }
    if (opt.value.type === "time_person" && opt.value.categories?.length === 1) {
      out.push({
        value: `time_person:${opt.value.categories[0]}`,
        label: opt.label,
        group: opt.group,
      });
      continue;
    }
    out.push({
      value: `${opt.group}:${JSON.stringify(opt.value)}`,
      label: opt.label,
      group: opt.group,
    });
  }
  return out;
}

const SOURCE_OPTIONS = sourceSelectOptions();

function mergeSourceWithEntity(
  source: YearDiscRingSource,
  entityType: ReturnType<typeof ringNeedsEntityPicker>,
  entityId: string
): YearDiscRingSource {
  if (entityType === "event" && source.type === "specific_event") {
    return { ...source, eventId: entityId };
  }
  if (entityType === "tour" && source.type === "specific_tour") {
    return { ...source, tourId: entityId };
  }
  if (entityType === "venue" && source.type === "venue") {
    return { ...source, venueId: entityId };
  }
  if (entityType === "person" && source.type === "time_person") {
    return { ...source, personId: entityId };
  }
  if (entityType === "person" && source.type === "time_category") {
    return { ...source, personId: entityId };
  }
  return source;
}

function entityIdFromSource(source: YearDiscRingSource): string {
  if (source.type === "specific_event") return source.eventId;
  if (source.type === "specific_tour") return source.tourId;
  if (source.type === "venue") return source.venueId;
  if (source.type === "time_person") return source.personId;
  if (source.type === "time_category") return source.personId ?? "";
  return "";
}

function updateRing(config: YearDiscConfig, ringId: string, patch: Partial<YearDiscRingConfig>): YearDiscConfig {
  return {
    rings: config.rings.map((ring) => (ring.id === ringId ? { ...ring, ...patch } : ring)),
  };
}

function moveRing(config: YearDiscConfig, ringId: string, direction: -1 | 1): YearDiscConfig {
  const index = config.rings.findIndex((r) => r.id === ringId);
  if (index < 0) return config;
  const next = index + direction;
  if (next < 0 || next >= config.rings.length) return config;
  const rings = [...config.rings];
  const [item] = rings.splice(index, 1);
  rings.splice(next, 0, item!);
  return { rings };
}

export function YearDiscRingEditor({
  config,
  onChange,
  events,
  tours,
  venues,
  people,
}: {
  config: YearDiscConfig;
  onChange: (config: YearDiscConfig) => void;
  events: EventDetail[];
  tours: TourDetail[];
  venues: Venue[];
  people: Person[];
}) {
  const ctx: YearDiscResolveContext = {
    calendarItems: [],
    events,
    tours,
    venues,
    people,
  };
  const hasCustomColors = hasCustomYearDiscRingColors(config);
  const [open, setOpen] = useState(false);
  const ringSummary = config.rings
    .map((ring) => ring.label?.trim() || yearDiscRingLabel(ring, ctx))
    .join(" · ");

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-white/10 bg-white/[0.02]">
      <div className="flex items-start gap-2 p-3">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-1 py-0.5 text-left hover:bg-white/[0.04]"
          >
            <ChevronDown
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0 text-white/40 transition-transform",
                open && "rotate-180",
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Disc rings</p>
              {!open ? (
                <p className="mt-1 truncate text-[11px] text-white/35">
                  {config.rings.length} {config.rings.length === 1 ? "ring" : "rings"}
                  {ringSummary ? ` · ${ringSummary}` : ""}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-white/35">
                  Outer rings are listed first. Each ring can show schedule or time-tracking data.
                </p>
              )}
            </div>
          </button>
        </CollapsibleTrigger>
        {open ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-white/70 hover:text-white"
              disabled={!hasCustomColors}
              onClick={() => onChange(resetYearDiscRingColors(config))}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset colours
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-white/70 hover:text-white"
              disabled={config.rings.length >= YEAR_DISC_MAX_RINGS}
              onClick={() => onChange({ rings: [...config.rings, createYearDiscRing()] })}
            >
              <Plus className="h-3.5 w-3.5" />
              Add ring
            </Button>
          </div>
        ) : null}
      </div>
      <CollapsibleContent className="border-t border-white/10 px-3 pb-3 pt-3">
      <ul className="space-y-3">
        {config.rings.map((ring, index) => {
          const entityType = ringNeedsEntityPicker(ring.source);
          const entityId = entityIdFromSource(ring.source);
          const selectValue = sourceSelectValue(ring.source);
          return (
            <li key={ring.id} className="rounded-md border border-white/10 bg-white/[0.03] p-2.5">
              <div className="flex items-start gap-2">
                <input
                  type="color"
                  aria-label="Ring color"
                  value={rgbaToHex(yearDiscRingColor(ring, index))}
                  onChange={(e) =>
                    onChange(updateRing(config, ring.id, { color: hexToRgba(e.target.value) }))
                  }
                  className="mt-1 h-8 w-8 shrink-0 cursor-pointer rounded border border-white/10 bg-transparent p-0"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <Input
                    value={ring.label ?? ""}
                    placeholder={yearDiscRingLabel(ring, ctx)}
                    onChange={(e) =>
                      onChange(updateRing(config, ring.id, { label: e.target.value || undefined }))
                    }
                    className="h-8 border-white/10 bg-white/5 text-sm text-white placeholder:text-white/30"
                  />
                  <Select
                    value={selectValue}
                    onValueChange={(value) => {
                      const nextSource = parseSourceSelectValue(value);
                      if (!nextSource) return;
                      const merged = mergeSourceWithEntity(nextSource, ringNeedsEntityPicker(nextSource), entityId);
                      onChange(updateRing(config, ring.id, { source: merged }));
                    }}
                  >
                    <SelectTrigger className="h-8 border-white/10 bg-white/5 text-xs text-white">
                      <SelectValue placeholder="What to show" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72 bg-[#16161f] border-white/10 text-white">
                      <SelectGroup>
                        <SelectLabel className="text-white/40">Schedule</SelectLabel>
                        {SOURCE_OPTIONS.filter((o) => o.group === "schedule").map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel className="text-white/40">Time tracking</SelectLabel>
                        {SOURCE_OPTIONS.filter((o) => o.group === "time").map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-xs">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {entityType === "event" ? (
                    <Select
                      value={entityId || "__none__"}
                      onValueChange={(value) =>
                        onChange(
                          updateRing(config, ring.id, {
                            source: mergeSourceWithEntity(ring.source, "event", value === "__none__" ? "" : value),
                          })
                        )
                      }
                    >
                      <SelectTrigger className="h-8 border-white/10 bg-white/5 text-xs text-white">
                        <SelectValue placeholder="Choose event" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 bg-[#16161f] border-white/10 text-white">
                        <SelectItem value="__none__">Select event…</SelectItem>
                        {events.map((event) => (
                          <SelectItem key={event.id} value={event.id}>
                            {event.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  {entityType === "tour" ? (
                    <Select
                      value={entityId || "__none__"}
                      onValueChange={(value) =>
                        onChange(
                          updateRing(config, ring.id, {
                            source: mergeSourceWithEntity(ring.source, "tour", value === "__none__" ? "" : value),
                          })
                        )
                      }
                    >
                      <SelectTrigger className="h-8 border-white/10 bg-white/5 text-xs text-white">
                        <SelectValue placeholder="Choose tour" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 bg-[#16161f] border-white/10 text-white">
                        <SelectItem value="__none__">Select tour…</SelectItem>
                        {tours.map((tour) => (
                          <SelectItem key={tour.id} value={tour.id}>
                            {tour.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  {entityType === "venue" ? (
                    <Select
                      value={entityId || "__none__"}
                      onValueChange={(value) =>
                        onChange(
                          updateRing(config, ring.id, {
                            source: mergeSourceWithEntity(ring.source, "venue", value === "__none__" ? "" : value),
                          })
                        )
                      }
                    >
                      <SelectTrigger className="h-8 border-white/10 bg-white/5 text-xs text-white">
                        <SelectValue placeholder="Choose venue" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 bg-[#16161f] border-white/10 text-white">
                        <SelectItem value="__none__">Select venue…</SelectItem>
                        {venues.map((venue) => (
                          <SelectItem key={venue.id} value={venue.id}>
                            {venue.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  {entityType === "person" ? (
                    <Select
                      value={entityId || "__none__"}
                      onValueChange={(value) =>
                        onChange(
                          updateRing(config, ring.id, {
                            source: mergeSourceWithEntity(ring.source, "person", value === "__none__" ? "" : value),
                          })
                        )
                      }
                    >
                      <SelectTrigger className="h-8 border-white/10 bg-white/5 text-xs text-white">
                        <SelectValue placeholder="Choose person" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 bg-[#16161f] border-white/10 text-white">
                        <SelectItem value="__none__">Select person…</SelectItem>
                        {people.map((person) => (
                          <SelectItem key={person.id} value={person.id}>
                            {person.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/50 hover:text-white"
                    disabled={index === 0}
                    onClick={() => onChange(moveRing(config, ring.id, -1))}
                    aria-label="Move ring outward"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/50 hover:text-white"
                    disabled={index === config.rings.length - 1}
                    onClick={() => onChange(moveRing(config, ring.id, 1))}
                    aria-label="Move ring inward"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/50 hover:text-red-400"
                    disabled={config.rings.length <= 1}
                    onClick={() =>
                      onChange({ rings: config.rings.filter((r) => r.id !== ring.id) })
                    }
                    aria-label="Remove ring"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-white/30">
                {index === 0 ? "Outermost" : index === config.rings.length - 1 ? "Innermost" : `Ring ${index + 1}`}
              </p>
            </li>
          );
        })}
      </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function rgbaToHex(rgba: string): string {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(rgba);
  if (!m) return ORDO_STAGE_BRAND_COLORS[0];
  const r = Number(m[1]).toString(16).padStart(2, "0");
  const g = Number(m[2]).toString(16).padStart(2, "0");
  const b = Number(m[3]).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

function hexToRgba(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return YEAR_DISC_RING_PALETTE[0]!;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.92)`;
}
