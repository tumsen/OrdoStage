import { format, parseISO } from "date-fns";
import { ExternalLink } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  computeTravelLinePayouts,
  describeSkatKostgodtgorelse,
  foodRateCentsForYear,
  formatAllowanceDayUnits,
  formatMoneyDkk,
  mealReductionCentsForDay,
  mealReductionLabel,
  describeSkatLogigodtgorelse,
  SKAT_KOSTGODTGORELSE_SUMMARY,
  SKAT_LOGIGODTGORELSE_SUMMARY,
  SKAT_TRAVEL_ALLOWANCE_URL,
  travelAllowanceDayUnits,
} from "@/lib/danishTravelAllowance";
import type { TimeProject } from "@/contracts/backendTypes";

export type TravelDayLine = {
  date: string;
  city: string;
  hotel: string;
  breakfastProvided: boolean;
  lunchProvided: boolean;
  dinnerProvided: boolean;
  lodgingCovered: boolean;
  lodgingByReceipt: boolean;
  timeProjectId: string;
};

export function TravelDayMealsTable({
  dayLines,
  startsAt,
  endsAt,
  allowanceType,
  allowanceHours,
  foodCoveredByReceipts,
  lodgingAllowance,
  lodgingByReceipt,
  transportsPeopleOrGoods,
  projects,
  onUpdateLine,
  readOnly = false,
}: {
  dayLines: TravelDayLine[];
  startsAt: Date;
  endsAt: Date;
  allowanceType: "standard" | "tour_driver_denmark" | "tour_driver_abroad";
  /** Commenced travel hours (diæt uses hours ÷ 24, not calendar days). */
  allowanceHours: number;
  foodCoveredByReceipts: boolean;
  lodgingAllowance: boolean;
  lodgingByReceipt: boolean;
  transportsPeopleOrGoods: boolean;
  projects: TimeProject[];
  onUpdateLine: (date: string, patch: Partial<TravelDayLine>) => void;
  readOnly?: boolean;
}) {
  const foodRateCents = foodRateCentsForYear(2026, allowanceType);
  const showMealReductions = allowanceType === "standard" && !foodCoveredByReceipts;
  const allowanceDayUnits = travelAllowanceDayUnits(allowanceHours);
  const linePayouts = computeTravelLinePayouts({
    startsAt,
    endsAt,
    dayLines,
    allowanceType,
    foodCoveredByReceipts,
    lodgingAllowance,
    lodgingByReceipt,
    transportsPeopleOrGoods,
  });
  const payoutByDate = new Map(linePayouts.map((row) => [row.date, row]));
  const totalPayoutCents = linePayouts.reduce((sum, row) => sum + row.payoutCents, 0);

  const totalReduction = showMealReductions
    ? dayLines.reduce((sum, line) => sum + mealReductionCentsForDay(foodRateCents, line), 0)
    : 0;
  const kostgodtgorelseNote = describeSkatKostgodtgorelse({
    hours: allowanceHours,
    foodRateCents,
    foodCoveredByReceipts,
  });
  const foodOnlyTotalCents = linePayouts.reduce((sum, row) => sum + row.foodNetCents, 0);
  const lodgingTotalCents = linePayouts.reduce((sum, row) => sum + row.lodgingCents, 0);
  const logigodtgorelseNote = describeSkatLogigodtgorelse({
    startsAt,
    endsAt,
    dayLines,
    lodgingAllowance,
    lodgingByReceipt,
    transportsPeopleOrGoods,
  });

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 sm:p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-white">Rejsedage — måltider dækket af arbejdsgiver</p>
          <p className="mt-0.5 text-[10px] text-white/45 leading-snug max-w-2xl">
            Kalenderlinjer bruges til måltidsfradrag pr. dato. Kostgodtgørelse beregnes af påbegyndte rejsetimer
            (÷ 24), ikke antal kalenderdage. Projekt/event på første dag gælder alle dage — kan ændres enkeltvis.
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
        <p className="shrink-0 text-[10px] text-white/35 text-right leading-snug">
          {dayLines.length} kalenderdag{dayLines.length === 1 ? "" : "e"}
          {allowanceHours > 0 ? (
            <>
              <br />
              {allowanceHours} t · {formatAllowanceDayUnits(allowanceDayUnits)} døgnenhed
              {allowanceDayUnits === 1 ? "" : "er"}
            </>
          ) : null}
        </p>
      </div>

      <details className="mt-2 rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white/55">
        <summary className="cursor-pointer font-medium text-white/70">Udbetaling af kostgodtgørelse (SKAT)</summary>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 leading-snug">
          {SKAT_KOSTGODTGORELSE_SUMMARY.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>

      <details className="mt-2 rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white/55">
        <summary className="cursor-pointer font-medium text-white/70">Logigodtgørelse (SKAT)</summary>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 leading-snug">
          {SKAT_LOGIGODTGORELSE_SUMMARY.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>

      {allowanceHours >= 24 ? (
        <p className="mt-2 rounded-md border border-blue-400/15 bg-blue-500/10 px-2 py-1.5 text-[11px] text-blue-100/90 leading-snug">
          <span className="font-medium text-blue-50">Kostgodtgørelse (brutto): </span>
          {kostgodtgorelseNote}
          {showMealReductions && totalReduction > 0 ? (
            <>
              {" "}
              − måltidsfradrag {formatMoneyDkk(totalReduction)} ={" "}
              <span className="font-medium text-blue-50">{formatMoneyDkk(foodOnlyTotalCents)}</span>
            </>
          ) : null}
        </p>
      ) : null}

      {allowanceHours >= 24 && lodgingAllowance && !lodgingByReceipt && !transportsPeopleOrGoods ? (
        <p className="mt-2 rounded-md border border-emerald-400/15 bg-emerald-500/10 px-2 py-1.5 text-[11px] text-emerald-100/90 leading-snug">
          <span className="font-medium text-emerald-50">Logigodtgørelse: </span>
          {logigodtgorelseNote ??
            "Markér logigodtgørelse og lad logi-felter stå tomme, når du selv betaler uden kvitteringsudlæg."}
          {lodgingTotalCents > 0 ? (
            <>
              {" "}
              (i alt <span className="font-medium text-emerald-50">{formatMoneyDkk(lodgingTotalCents)}</span> i
              udbetaling)
            </>
          ) : null}
        </p>
      ) : null}

      {lodgingByReceipt ? (
        <p className="mt-2 rounded-md border border-amber-400/20 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100">
          Logi dækkes som udlæg efter regning — der udbetales ikke skattefri logigodtgørelse (268 kr./døgn).
        </p>
      ) : null}

      {foodCoveredByReceipts ? (
        <p className="mt-2 rounded-md border border-amber-400/20 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-100">
          Kost dækkes efter regning — SKAT giver op til 25% af kostsatsen; måltidsfradrag gælder ikke.
        </p>
      ) : allowanceType !== "standard" ? (
        <p className="mt-2 rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-white/45">
          Tour-driver rates use fixed daily amounts without per-meal reductions.
        </p>
      ) : null}

      <div className="mt-2 overflow-x-auto rounded-md border border-white/10">
        <table className="w-full min-w-[52rem] border-collapse text-left text-[11px]">
          <thead>
            <tr className="border-b border-white/10 bg-black/25 text-[10px] font-medium uppercase tracking-wide text-white/40">
              <th className="whitespace-nowrap px-2 py-1.5">Date</th>
              <th className="min-w-[8rem] px-1 py-1.5">Project / event</th>
              <th className="min-w-[5rem] px-1 py-1.5">City</th>
              <th className="min-w-[5rem] px-1 py-1.5">Hotel</th>
              <th className="min-w-[7rem] px-1 py-1.5">Breakfast</th>
              <th className="min-w-[7rem] px-1 py-1.5">Lunch</th>
              <th className="min-w-[7rem] px-1 py-1.5">Dinner</th>
              {showMealReductions ? <th className="min-w-[6rem] px-2 py-1.5">Reduction</th> : null}
              <th className="min-w-[5rem] px-1 py-1.5">Logi</th>
              <th className="min-w-[5.5rem] px-2 py-1.5 text-right">Udbetaling</th>
            </tr>
          </thead>
          <tbody>
            {dayLines.map((line, lineIndex) => {
              const reduction = showMealReductions ? mealReductionCentsForDay(foodRateCents, line) : 0;
              const reductionNote = mealReductionLabel(line);
              const payout = payoutByDate.get(line.date);

              return (
                <tr key={line.date} className="border-t border-white/10 hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-2 py-1.5 text-white/70 tabular-nums">
                    <div>{format(parseISO(line.date), "EEE d MMM")}</div>
                  </td>
                  <td className="p-1">
                    <Select
                      value={line.timeProjectId}
                      onValueChange={(timeProjectId) => onUpdateLine(line.date, { timeProjectId })}
                      disabled={readOnly}
                    >
                      <SelectTrigger
                        className="h-7 border-white/10 bg-white/5 px-2 text-[11px] text-white disabled:cursor-default disabled:opacity-100"
                        title={lineIndex === 0 ? "Gælder alle dage indtil du ændrer dem enkeltvis" : undefined}
                      >
                        <SelectValue placeholder="No project" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72 border-white/10 bg-[#16161f] text-white">
                        <SelectItem value="__none__">No project</SelectItem>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-1">
                    <Input
                      value={line.city}
                      onChange={(e) => onUpdateLine(line.date, { city: e.target.value })}
                      placeholder="City"
                      readOnly={readOnly}
                      className="h-7 border-white/10 bg-white/5 px-2 py-0 text-[11px] text-white read-only:cursor-default read-only:opacity-100"
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      value={line.hotel}
                      onChange={(e) => onUpdateLine(line.date, { hotel: e.target.value })}
                      placeholder="Hotel"
                      readOnly={readOnly}
                      className="h-7 border-white/10 bg-white/5 px-2 py-0 text-[11px] text-white read-only:cursor-default read-only:opacity-100"
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
                      <label
                        className={`flex items-center gap-1.5 text-[10px] text-white/55 ${readOnly ? "cursor-default" : "cursor-pointer"}`}
                      >
                        <Checkbox
                          checked={Boolean(line[key])}
                          disabled={!showMealReductions || readOnly}
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
                        <span title={reductionNote ?? undefined}>−{formatMoneyDkk(reduction)}</span>
                      ) : (
                        <span className="text-white/25">—</span>
                      )}
                    </td>
                  ) : null}
                  <td className="p-1 align-middle">
                    <div className="flex flex-col gap-1">
                      <label
                        className={`flex items-center gap-1.5 text-[10px] text-white/55 ${readOnly ? "cursor-default" : "cursor-pointer"}`}
                      >
                        <Checkbox
                          checked={line.lodgingCovered}
                          disabled={readOnly}
                          onCheckedChange={(checked) =>
                            onUpdateLine(line.date, { lodgingCovered: checked === true })
                          }
                          aria-label="Frit logi stillet til rådighed"
                        />
                        Frit logi
                      </label>
                      <label
                        className={`flex items-center gap-1.5 text-[10px] text-white/55 ${readOnly ? "cursor-default" : "cursor-pointer"}`}
                      >
                        <Checkbox
                          checked={line.lodgingByReceipt}
                          disabled={readOnly}
                          onCheckedChange={(checked) =>
                            onUpdateLine(line.date, { lodgingByReceipt: checked === true })
                          }
                          aria-label="Logi dækket som udlæg efter regning"
                        />
                        Udlæg (kvittering)
                      </label>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {payout && payout.payoutCents > 0 ? (
                      <span
                        className="font-medium text-white/85"
                        title={
                          payout.lodgingCents > 0
                            ? `Diæt ${formatMoneyDkk(payout.foodNetCents)} + logi ${formatMoneyDkk(payout.lodgingCents)}`
                            : payout.mealReductionCents > 0
                              ? `Brutto ${formatMoneyDkk(payout.foodGrossCents)} − måltider ${formatMoneyDkk(payout.mealReductionCents)}`
                              : undefined
                        }
                      >
                        {formatMoneyDkk(payout.payoutCents)}
                      </span>
                    ) : (
                      <span className="text-white/25">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {allowanceHours >= 24 ? (
            <tfoot>
              <tr className="border-t border-white/15 bg-black/20 text-white/70">
                <td
                  colSpan={showMealReductions ? 9 : 8}
                  className="px-2 py-1.5 text-right text-[10px] font-medium uppercase tracking-wide text-white/40"
                >
                  Total udbetaling
                </td>
                <td className="px-2 py-1.5 text-right font-semibold text-white tabular-nums">
                  {formatMoneyDkk(totalPayoutCents)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
