import { format, parseISO } from "date-fns";
import { ExternalLink } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  foodRateCentsForYear,
  mealReductionCentsForDay,
  mealReductionLabel,
  SKAT_TRAVEL_ALLOWANCE_URL,
} from "@/lib/danishTravelAllowance";

export type TravelDayLine = {
  date: string;
  city: string;
  hotel: string;
  breakfastProvided: boolean;
  lunchProvided: boolean;
  dinnerProvided: boolean;
  lodgingCovered: boolean;
  lodgingByReceipt: boolean;
};

function money(cents: number): string {
  return `${(cents / 100).toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.`;
}

export function TravelDayMealsTable({
  dayLines,
  allowanceType,
  allowanceDays,
  foodCoveredByReceipts,
  onUpdateLine,
}: {
  dayLines: TravelDayLine[];
  allowanceType: "standard" | "tour_driver_denmark" | "tour_driver_abroad";
  /** Days that count toward SKAT meal allowance (from trip duration). */
  allowanceDays: number;
  foodCoveredByReceipts: boolean;
  onUpdateLine: (date: string, patch: Partial<TravelDayLine>) => void;
}) {
  const foodRateCents = foodRateCentsForYear(2026, allowanceType);
  const showMealReductions = allowanceType === "standard" && !foodCoveredByReceipts;

  const totalReduction = showMealReductions
    ? dayLines
        .slice(0, allowanceDays)
        .reduce((sum, line) => sum + mealReductionCentsForDay(foodRateCents, line), 0)
    : 0;

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 sm:p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-white">Travel days — meals covered by employer</p>
          <p className="mt-0.5 text-[10px] text-white/45 leading-snug max-w-2xl">
            For each calendar day, mark meals that were{" "}
            <strong className="font-medium text-white/55">included or paid by the employer</strong>. SKAT
            reduces the tax-free food allowance: breakfast 15%, lunch 30%, dinner 30% (max 75% per day).
          </p>
          <a
            href={SKAT_TRAVEL_ALLOWANCE_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[10px] text-blue-300 hover:text-blue-200"
          >
            SKAT: skattefri rejsegodtgørelse (diæter)
            <ExternalLink size={10} />
          </a>
        </div>
        <p className="shrink-0 text-[10px] text-white/35">
          {dayLines.length} day{dayLines.length === 1 ? "" : "s"}
          {allowanceDays > 0 ? ` · ${allowanceDays} allowance day${allowanceDays === 1 ? "" : "s"}` : ""}
        </p>
      </div>

      {showMealReductions && totalReduction > 0 ? (
        <p className="mt-2 rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white/55">
          Total meal reduction: <span className="font-medium text-white/80">−{money(totalReduction)}</span>
        </p>
      ) : null}

      {foodCoveredByReceipts ? (
        <p className="mt-2 rounded-md border border-amber-400/20 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100">
          Meals are claimed by receipt — SKAT pays 25% of the food allowance; per-meal reductions do not apply.
        </p>
      ) : allowanceType !== "standard" ? (
        <p className="mt-2 rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white/45">
          Tour-driver rates use fixed daily amounts without per-meal reductions.
        </p>
      ) : null}

      <div className="mt-2 overflow-x-auto rounded-md border border-white/10">
        <table className="w-full min-w-[44rem] border-collapse text-left text-[11px]">
          <thead>
            <tr className="border-b border-white/10 bg-black/25 text-[10px] font-medium uppercase tracking-wide text-white/40">
              <th className="whitespace-nowrap px-2 py-1.5">Date</th>
              <th className="min-w-[5rem] px-1 py-1.5">City</th>
              <th className="min-w-[5rem] px-1 py-1.5">Hotel</th>
              <th className="min-w-[7rem] px-1 py-1.5">Breakfast</th>
              <th className="min-w-[7rem] px-1 py-1.5">Lunch</th>
              <th className="min-w-[7rem] px-1 py-1.5">Dinner</th>
              {showMealReductions ? <th className="min-w-[6rem] px-2 py-1.5">Reduction</th> : null}
              <th className="min-w-[5rem] px-1 py-1.5">Lodging</th>
            </tr>
          </thead>
          <tbody>
            {dayLines.map((line, index) => {
              const countsForAllowance = index < allowanceDays;
              const reduction = showMealReductions && countsForAllowance
                ? mealReductionCentsForDay(foodRateCents, line)
                : 0;
              const reductionNote = mealReductionLabel(line);

              return (
                <tr
                  key={line.date}
                  className={`border-t border-white/10 ${countsForAllowance ? "hover:bg-white/[0.02]" : "opacity-50"}`}
                >
                  <td className="whitespace-nowrap px-2 py-1.5 text-white/70 tabular-nums">
                    <div>{format(parseISO(line.date), "EEE d MMM")}</div>
                    {!countsForAllowance ? (
                      <div className="text-[9px] text-white/30">Outside allowance</div>
                    ) : null}
                  </td>
                  <td className="p-1">
                    <Input
                      value={line.city}
                      onChange={(e) => onUpdateLine(line.date, { city: e.target.value })}
                      placeholder="City"
                      className="h-7 border-white/10 bg-white/5 px-2 py-0 text-[11px] text-white"
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      value={line.hotel}
                      onChange={(e) => onUpdateLine(line.date, { hotel: e.target.value })}
                      placeholder="Hotel"
                      className="h-7 border-white/10 bg-white/5 px-2 py-0 text-[11px] text-white"
                    />
                  </td>
                  {(
                    [
                      ["breakfastProvided", "Breakfast included or paid"],
                      ["lunchProvided", "Lunch included or paid"],
                      ["dinnerProvided", "Dinner included or paid"],
                    ] as const
                  ).map(([key, ariaLabel]) => (
                    <td key={key} className="p-1 align-middle">
                      <label className="flex items-center gap-1.5 text-[10px] text-white/55 cursor-pointer">
                        <Checkbox
                          checked={Boolean(line[key])}
                          disabled={!showMealReductions || !countsForAllowance}
                          onCheckedChange={(checked) =>
                            onUpdateLine(line.date, { [key]: checked === true } as Partial<TravelDayLine>)
                          }
                          aria-label={ariaLabel}
                        />
                        <span className="hidden xl:inline">Employer</span>
                      </label>
                    </td>
                  ))}
                  {showMealReductions ? (
                    <td className="px-2 py-1.5 text-white/50">
                      {reduction > 0 ? (
                        <span title={reductionNote ?? undefined}>−{money(reduction)}</span>
                      ) : (
                        <span className="text-white/25">—</span>
                      )}
                    </td>
                  ) : null}
                  <td className="p-1 align-middle">
                    <div className="flex flex-col gap-1">
                      <label className="flex items-center gap-1.5 text-[10px] text-white/55 cursor-pointer">
                        <Checkbox
                          checked={line.lodgingCovered}
                          onCheckedChange={(checked) =>
                            onUpdateLine(line.date, { lodgingCovered: checked === true })
                          }
                          aria-label="Free lodging provided"
                        />
                        Free lodging
                      </label>
                      <label className="flex items-center gap-1.5 text-[10px] text-white/55 cursor-pointer">
                        <Checkbox
                          checked={line.lodgingByReceipt}
                          onCheckedChange={(checked) =>
                            onUpdateLine(line.date, { lodgingByReceipt: checked === true })
                          }
                          aria-label="Lodging paid by receipt"
                        />
                        By receipt
                      </label>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
