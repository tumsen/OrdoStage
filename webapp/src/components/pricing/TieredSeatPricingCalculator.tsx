import { Children, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  annualInvoiceTotalMajor,
  annualSavingMajor,
  fixedAnnualMonthlyEquivMajor,
  fixedMonthlyEquivMajor,
} from "@/lib/flexFixedPricing";
import {
  DEFAULT_FIXED_PLAN_PRICING,
  type FixedPlanPricingConfig,
} from "@/lib/fixedPlanPricingConfig";
import {
  annualMonthlyMultiplier,
  calcMonthlyTotal,
  DEFAULT_TIERED_SEAT_MODEL,
  perUserRate,
  TIERED_SEAT_MAX_USERS,
  type TieredSeatModel,
} from "@/lib/tieredSeatPricing";

const CHART_TOTAL = "#ff006e";
const CHART_FIXED = "#a855f7";
const CHART_FIXED_ANNUAL = "#22c55e";
const CHART_PER_USER = "#3a86ff";
const CHART_GRID = "rgba(255,255,255,0.06)";
const CHART_AXIS = "rgba(255,255,255,0.38)";

type Props = {
  /** Owner admin: editable model inputs. Public: fixed defaults. */
  showModelControls?: boolean;
  /** When true with showModelControls, curve inputs are read-only (e.g. mirroring global admin defaults). */
  disableModelControls?: boolean;
  className?: string;
  /** When false, hides the marketing trial chip (e.g. internal org billing). */
  showTrialBadge?: boolean;
  /** Global or org defaults for annual price reduction (0–100). */
  yearlyDiscountPercent?: number;
  yearlyDiscountEnabled?: boolean;
  /** Show percent + master switch for annual discount (admin / org pricing). */
  showYearlyDiscountControls?: boolean;
  onYearlyDiscountPercentChange?: (percent: number) => void;
  onYearlyDiscountEnabledChange?: (enabled: boolean) => void;
  /** Controlled seat curve (organisation overrides). */
  seatModel?: TieredSeatModel;
  onSeatModelChange?: (m: TieredSeatModel) => void;
  /** Rendered after the model price/floor cards (e.g. admin invoice timing fields). */
  afterModelControls?: ReactNode;
  /** Chart Flex postpaid vs Fixed monthly and annual equivalents on one graph. */
  compareFlexFixedPlans?: boolean;
  /** Admin: Flex curve fields rendered outside the calculator. */
  hideInlineModelControls?: boolean;
  fixedPlanPricing?: FixedPlanPricingConfig;
  fixedAnnualRoundToTen?: boolean;
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Admin/org % input: use draft while typing so annual preview matches the field (parent updates on blur). */
function percentFromDraftOrProp(showYearlyDiscountControls: boolean, draft: string, prop: number): number {
  if (!showYearlyDiscountControls) return prop;
  const t = draft.trim();
  if (t === "") return clampInt(Math.round(prop), 0, 100);
  const n = parseInt(t.replace(/\s/g, ""), 10);
  return Number.isFinite(n) ? clampInt(n, 0, 100) : clampInt(Math.round(prop), 0, 100);
}

function parseMoney(s: string, fallback: number): number {
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) ? v : fallback;
}

/** Right-aligned unit chip next to numeric inputs (EUR, Days, %, Users). */
export function InputWithUnitSuffix({
  id,
  value,
  onChange,
  onBlur,
  inputMode = "decimal",
  suffix,
  highlight,
  className,
  disabled,
  "aria-describedby": ariaDescribedBy,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  inputMode?: "decimal" | "numeric" | "text";
  suffix: "EUR" | "Days" | "%" | "Users";
  highlight?: boolean;
  className?: string;
  "aria-describedby"?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex shrink-0 gap-1.5", className)}>
      <Input
        id={id}
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        aria-describedby={ariaDescribedBy}
        className={cn(
          "h-9 min-w-0 flex-1 border-white/15 bg-black/30 text-white tabular-nums",
          highlight && "border-emerald-500/30 focus-visible:ring-emerald-500/40",
        )}
      />
      <span
        className="flex h-9 min-w-[2.85rem] max-w-[3.5rem] shrink-0 items-center justify-center rounded-md border border-white/15 bg-black/45 px-1 text-[10px] font-semibold uppercase leading-tight tracking-wide text-white/55"
        aria-hidden
      >
        {suffix}
      </span>
    </div>
  );
}

export function TieredSeatPricingCalculator({
  showModelControls = false,
  disableModelControls = false,
  className,
  showTrialBadge = true,
  yearlyDiscountPercent = 15,
  yearlyDiscountEnabled = true,
  showYearlyDiscountControls = false,
  onYearlyDiscountPercentChange,
  onYearlyDiscountEnabledChange,
  seatModel: controlledSeatModel,
  onSeatModelChange,
  afterModelControls,
  compareFlexFixedPlans = false,
  hideInlineModelControls = false,
  fixedPlanPricing = DEFAULT_FIXED_PLAN_PRICING,
  fixedAnnualRoundToTen = true,
}: Props) {
  const modelInputsLocked = showModelControls && disableModelControls;
  const sliderMax = compareFlexFixedPlans
    ? fixedPlanPricing.selfServeMaxSeats
    : TIERED_SEAT_MAX_USERS;
  /** Admin/org always sees annual controls; public page only when global setting enables annual discount. */
  const publicAnnualOffered = showYearlyDiscountControls || yearlyDiscountEnabled;
  const [users, setUsers] = useState(20);
  const [annual, setAnnual] = useState(() => (showYearlyDiscountControls ? yearlyDiscountEnabled : false));
  const [innerModel, setInnerModel] = useState<TieredSeatModel>({ ...DEFAULT_TIERED_SEAT_MODEL });
  const model = controlledSeatModel ?? innerModel;

  const setModel = (next: TieredSeatModel | ((prev: TieredSeatModel) => TieredSeatModel)) => {
    const resolved = typeof next === "function" ? next(model) : next;
    if (onSeatModelChange) onSeatModelChange(resolved);
    else setInnerModel(resolved);
  };

  const [floorAtDraft, setFloorAtDraft] = useState(String(model.floorAt));
  useEffect(() => {
    setFloorAtDraft(String(model.floorAt));
  }, [model.floorAt]);

  /** Draft strings so partial edits (e.g. clearing the first digit) are not overwritten by parse fallback on every keystroke. */
  const [baseDraft, setBaseDraft] = useState(String(model.base));
  const [startDraft, setStartDraft] = useState(String(model.start));
  const [floorPriceDraft, setFloorPriceDraft] = useState(String(model.floor));
  useEffect(() => {
    setBaseDraft(String(model.base));
  }, [model.base]);
  useEffect(() => {
    setStartDraft(String(model.start));
  }, [model.start]);
  useEffect(() => {
    setFloorPriceDraft(String(model.floor));
  }, [model.floor]);

  const [yearlyPercentDraft, setYearlyPercentDraft] = useState(String(yearlyDiscountPercent));
  useEffect(() => {
    setYearlyPercentDraft(String(yearlyDiscountPercent));
  }, [yearlyDiscountPercent]);

  useEffect(() => {
    if (!showYearlyDiscountControls) return;
    setAnnual(yearlyDiscountEnabled);
  }, [yearlyDiscountEnabled, showYearlyDiscountControls]);

  useEffect(() => {
    if (!publicAnnualOffered) setAnnual(false);
  }, [publicAnnualOffered]);

  const floorAtSafe = Math.max(3, Math.floor(model.floorAt));
  const monthlyList = useMemo(() => monthlyAtUsers(model), [model]);
  const percentForAnnualQuote = percentFromDraftOrProp(showYearlyDiscountControls, yearlyPercentDraft, yearlyDiscountPercent);
  /** Admin/org: quote always uses the (draft) %; public: uses API yearlyDiscountEnabled for whether discount applies. */
  const multWhenPayingAnnual = annualMonthlyMultiplier(
    percentForAnnualQuote,
    showYearlyDiscountControls ? true : yearlyDiscountEnabled,
  );
  const chartRows = useMemo(
    () =>
      Array.from({ length: sliderMax }, (_, i) => {
        const u = i + 1;
        const flexPostpaid = monthlyList[u - 1] ?? 0;
        if (compareFlexFixedPlans) {
          return {
            users: u,
            flexTotal: flexPostpaid,
            fixedMonthlyEquiv: fixedMonthlyEquivMajor(u, fixedPlanPricing),
            fixedAnnualMonthlyEquiv: fixedAnnualMonthlyEquivMajor(u, fixedPlanPricing),
          };
        }
        return {
          users: u,
          total: flexPostpaid,
          perUser: perUserRate(u, model.start, model.floor, floorAtSafe),
        };
      }),
    [monthlyList, model.start, model.floor, floorAtSafe, compareFlexFixedPlans, fixedPlanPricing, sliderMax],
  );

  const baseMonthly = monthlyList[users - 1] ?? 0;
  const annualPlanMonthlyEq = baseMonthly * multWhenPayingAnnual;
  const annualPlanYearTotal = annualPlanMonthlyEq * 12;
  const discountedMonthly = annual ? annualPlanMonthlyEq : baseMonthly;
  const perUserEffective = users > 0 ? discountedMonthly / users : 0;
  const thisRate = perUserRate(users, model.start, model.floor, floorAtSafe);
  const stepDen = floorAtSafe - 2;
  const step = stepDen > 0 ? (model.start - model.floor) / stepDen : 0;
  const annualSavingsYear =
    annual && multWhenPayingAnnual < 1 ? Math.round((baseMonthly - annualPlanMonthlyEq) * 12) : 0;

  const fixedAtSlider = compareFlexFixedPlans
    ? {
        monthlyEquiv: fixedMonthlyEquivMajor(users, fixedPlanPricing),
        annualMonthlyEquiv: fixedAnnualMonthlyEquivMajor(users, fixedPlanPricing),
        annualInvoice: annualInvoiceTotalMajor(users, fixedAnnualRoundToTen, fixedPlanPricing),
        savingYear: annualSavingMajor(users, fixedAnnualRoundToTen, fixedPlanPricing),
      }
    : null;

  const monthlySub =
    annual && multWhenPayingAnnual < 1 && percentForAnnualQuote > 0
      ? `billed annually (${percentForAnnualQuote}% off)`
      : annual
        ? "billed annually (no discount)"
        : "billed monthly";
  const annualTotalSub =
    annual && multWhenPayingAnnual < 1 && percentForAnnualQuote > 0
      ? `${percentForAnnualQuote}% saved vs monthly`
      : annual
        ? "per year"
        : multWhenPayingAnnual < 1 && percentForAnnualQuote > 0
          ? `annual billing at ${percentForAnnualQuote}% off vs monthly`
          : "annual billing at list monthly rate (no discount)";

  function commitFloorAtDraft() {
    const parsed = parseInt(floorAtDraft.replace(/\s/g, ""), 10);
    const fallback = model.floorAt;
    const n = Number.isFinite(parsed) ? parsed : fallback;
    const clamped = clampInt(n, 3, TIERED_SEAT_MAX_USERS);
    setModel((m) => ({ ...m, floorAt: clamped }));
    setFloorAtDraft(String(clamped));
  }

  function commitYearlyPercentDraft() {
    const parsed = parseInt(yearlyPercentDraft.replace(/\s/g, ""), 10);
    const n = Number.isFinite(parsed) ? parsed : yearlyDiscountPercent;
    const clamped = clampInt(n, 0, 100);
    onYearlyDiscountPercentChange?.(clamped);
    setYearlyPercentDraft(String(clamped));
  }

  function commitBaseDraft() {
    const t = baseDraft.trim();
    if (t === "") {
      setBaseDraft(String(model.base));
      return;
    }
    const n = parseMoney(t, model.base);
    const clamped = Math.max(0, n);
    setModel((m) => ({ ...m, base: clamped }));
    setBaseDraft(String(clamped));
  }

  function commitStartDraft() {
    const t = startDraft.trim();
    if (t === "") {
      setStartDraft(String(model.start));
      return;
    }
    const n = parseMoney(t, model.start);
    const clamped = Math.max(1, n);
    setModel((m) => ({ ...m, start: clamped }));
    setStartDraft(String(clamped));
  }

  function commitFloorPriceDraft() {
    const t = floorPriceDraft.trim();
    if (t === "") {
      setFloorPriceDraft(String(model.floor));
      return;
    }
    const n = parseMoney(t, model.floor);
    const clamped = Math.max(1, n);
    setModel((m) => ({ ...m, floor: clamped }));
    setFloorPriceDraft(String(clamped));
  }

  return (
    <div className={cn("space-y-6 text-white", className)}>
      {showTrialBadge ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-md border border-ordo-blue/35 bg-ordo-blue/10 px-2.5 py-1 text-[11px] font-medium text-sky-200/95">
            30-day free trial · No credit card required
          </span>
        </div>
      ) : null}

      {publicAnnualOffered && !showModelControls && !compareFlexFixedPlans ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <Switch
            id="enable-annual-billing"
            checked={annual}
            onCheckedChange={(v) => {
              setAnnual(v);
              if (showYearlyDiscountControls) onYearlyDiscountEnabledChange?.(v);
            }}
            className="data-[state=checked]:bg-ordo-magenta data-[state=unchecked]:bg-white/20"
          />
          <Label htmlFor="enable-annual-billing" className="cursor-pointer text-sm text-white/70">
            Enable annual billing
          </Label>
          {annual && multWhenPayingAnnual < 1 && percentForAnnualQuote > 0 ? (
            <span className="rounded-md border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-200/95">
              Save €{annualSavingsYear.toLocaleString()}/yr
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "grid grid-cols-1 items-stretch gap-3",
          compareFlexFixedPlans
            ? "md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
            : publicAnnualOffered
              ? "md:grid-cols-3"
              : "md:grid-cols-2",
        )}
      >
        {compareFlexFixedPlans && fixedAtSlider ? (
          <>
            <MetricCard
              label="Flex (monthly)"
              hint="Postpaid monthly total at this seat count using the Flex seat curve."
              value={`€${Math.round(baseMonthly).toLocaleString()}`}
              valueSuffix="EUR"
              sub="billed monthly for billable activity"
            />
            <MetricCard
              label="Fixed monthly"
              hint="€/month equivalent using the monthly volume discount on seats 2+."
              value={`€${Math.round(fixedAtSlider.monthlyEquiv).toLocaleString()}`}
              valueSuffix="EUR"
              sub="monthly volume discount curve"
            />
            <MetricCard
              label="Fixed annual (€/mo)"
              hint="€/month equivalent using the annual volume discount (×12 at checkout)."
              value={`€${Math.round(fixedAtSlider.annualMonthlyEquiv).toLocaleString()}`}
              valueSuffix="EUR"
              sub="annual volume discount curve"
              accent="fixedAnnual"
            />
            <MetricCard
              label="Fixed (annual invoice)"
              hint={
                fixedAnnualRoundToTen
                  ? "12× monthly equivalent, rounded to nearest €10 when enabled."
                  : "12× monthly equivalent at this seat count."
              }
              value={`€${Math.round(fixedAtSlider.annualInvoice).toLocaleString()}`}
              valueSuffix="EUR"
              sub="paid upfront for 12 months"
              accent="fixedAnnual"
            />
            <MetricCard
              label="vs Flex (year)"
              hint="Flex postpaid ×12 minus Fixed annual invoice at this seat count."
              value={`€${Math.round(fixedAtSlider.savingYear).toLocaleString()}`}
              valueSuffix="EUR"
              sub="estimated annual saving on Fixed"
            />
          </>
        ) : (
          <>
            <MetricCard
              label="Monthly total"
              hint="Estimated invoice for one month at the slider seat count, using the curve below. All amounts are in euros (EUR)."
              value={`€${Math.round(discountedMonthly).toLocaleString()}`}
              valueSuffix="EUR"
              sub={monthlySub}
            />
            {publicAnnualOffered ? (
              <MetricCard
                label="Annual total"
                hint="If annual billing is on, 12× the discounted monthly equivalent at this seat count. Shown in EUR for comparison with monthly."
                value={`€${Math.round(annualPlanYearTotal).toLocaleString()}`}
                valueSuffix="EUR"
                sub={annualTotalSub}
              />
            ) : null}
            <MetricCard
              label="Effective per user"
              hint="Monthly total divided by active users — a quick average, not a flat per-seat rate on the invoice."
              value={`€${perUserEffective.toFixed(2)}`}
              valueSuffix="EUR"
              sub="per active user / month (EUR)"
            />
          </>
        )}
      </div>

      {showModelControls && !hideInlineModelControls ? (
        <>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-white/45">Model settings (illustrative EUR)</p>
            <p className="max-w-4xl text-[11px] leading-relaxed text-white/50">
              These fields define the published postpaid curve in <strong className="text-white/70">EUR</strong>: the
              first billable seat uses the base fee, the second uses the user-2 marginal, and further seats step down
              until the floor marginal applies from the seat number you set. Invoices sum marginals for each billable
              member in the month.
            </p>
          </div>
          <div className="grid w-full auto-cols-[minmax(7.5rem,1fr)] grid-flow-col gap-2 overflow-x-auto pb-0.5">
            <ModelInput
              fieldId="seat-model-base"
              label="Base fee (1st billable seat)"
              hint="Fixed monthly EUR for the first billable seat before any additional marginals."
              suffix="EUR"
              value={baseDraft}
              onChange={setBaseDraft}
              onBlur={commitBaseDraft}
              disabled={modelInputsLocked}
            />
            <ModelInput
              fieldId="seat-model-user2"
              label="2nd seat marginal"
              hint="EUR added for the second billable seat in a month (marginal, not cumulative with base)."
              suffix="EUR"
              value={startDraft}
              onChange={setStartDraft}
              onBlur={commitStartDraft}
              disabled={modelInputsLocked}
            />
            <ModelInput
              fieldId="seat-model-floor-at"
              label="Floor from seat #"
              hint="From this billable seat count upward, each additional seat uses the floor marginal (EUR) only."
              suffix="Users"
              highlight
              inputMode="numeric"
              value={floorAtDraft}
              onChange={setFloorAtDraft}
              onBlur={commitFloorAtDraft}
              disabled={modelInputsLocked}
            />
            <ModelInput
              fieldId="seat-model-floor-eur"
              label="Floor marginal / seat"
              hint="Minimum EUR per additional billable seat once the floor seat count is reached."
              suffix="EUR"
              highlight
              value={floorPriceDraft}
              onChange={setFloorPriceDraft}
              onBlur={commitFloorPriceDraft}
              disabled={modelInputsLocked}
            />
            {publicAnnualOffered ? (
              <div className="flex min-h-[11.5rem] min-w-0 flex-col rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div className="shrink-0 space-y-2">
                  {showYearlyDiscountControls ? (
                    <Label
                      htmlFor="annual-discount-pct"
                      className="block min-h-[2.5rem] text-[11px] font-medium leading-snug text-white/50 line-clamp-3"
                    >
                      Annual prepay discount
                    </Label>
                  ) : (
                    <span className="block min-h-[2.5rem] text-[11px] font-medium leading-snug text-white/50">
                      Annual billing
                    </span>
                  )}
                  {showYearlyDiscountControls ? (
                    <p className="text-[10px] leading-snug text-white/45">
                      Percent off the monthly total when customers pay annually (0–100%). Shown as <strong className="text-white/60">%</strong>{" "}
                      beside the field; calculator preview uses EUR totals.
                    </p>
                  ) : (
                    <p className="text-[10px] leading-snug text-white/45">
                      Toggle whether annual prepayment is offered. Savings chip is shown in EUR when a discount applies.
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Switch
                      id="enable-annual-billing-model"
                      checked={annual}
                      disabled={modelInputsLocked}
                      onCheckedChange={(v) => {
                        setAnnual(v);
                        if (showYearlyDiscountControls) onYearlyDiscountEnabledChange?.(v);
                      }}
                      className="data-[state=checked]:bg-ordo-magenta data-[state=unchecked]:bg-white/20"
                    />
                    <Label htmlFor="enable-annual-billing-model" className="cursor-pointer text-sm text-white/70">
                      Enable annual billing
                    </Label>
                    {annual && multWhenPayingAnnual < 1 && percentForAnnualQuote > 0 ? (
                      <span className="rounded-md border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-200/95">
                        Save €{annualSavingsYear.toLocaleString()} / yr
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="min-h-0 flex-1" aria-hidden />
                {showYearlyDiscountControls ? (
                  <InputWithUnitSuffix
                    id="annual-discount-pct"
                    inputMode="numeric"
                    suffix="%"
                    value={yearlyPercentDraft}
                    onChange={setYearlyPercentDraft}
                    onBlur={commitYearlyPercentDraft}
                    disabled={modelInputsLocked}
                  />
                ) : (
                  <div className="h-9 shrink-0" aria-hidden />
                )}
              </div>
            ) : null}
            {afterModelControls ? Children.toArray(afterModelControls) : null}
          </div>
        </>
      ) : null}

      <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white/65 sm:flex-row sm:items-center sm:justify-between">
        <span>
          User <strong className="font-medium text-white">{users}</strong> marginal (EUR):{" "}
          <strong className="font-medium text-white">
            {users === 1 ? `€${model.base} EUR (1st seat)` : `€${thisRate.toFixed(2)} EUR marginal`}
          </strong>
        </span>
        <span>
          Discount step / user (EUR):{" "}
          <strong className="font-medium text-white">€{step.toFixed(2)} EUR</strong>
        </span>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-white/45">
          {compareFlexFixedPlans ? "Flex vs Fixed (€/month)" : "Price curve"}
        </p>
        <div className="flex flex-wrap gap-4 text-[11px] text-white/55">
          {compareFlexFixedPlans ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#ff006e]" aria-hidden />
                Flex postpaid
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#a855f7]" aria-hidden />
                Fixed monthly
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_FIXED_ANNUAL }} aria-hidden />
                Fixed annual (€/mo)
              </span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#ff006e]" aria-hidden />
                Total monthly cost
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#3a86ff]" aria-hidden />
                Per-user rate
              </span>
            </>
          )}
        </div>
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="seat-slider" className="text-sm text-white/60">
            Active users
          </Label>
          <span className="text-lg font-semibold tabular-nums text-white">
            {users} <span className="text-sm font-normal text-white/50">users</span>
          </span>
        </div>
        <input
          id="seat-slider"
          type="range"
          min={1}
          max={sliderMax}
          step={1}
          value={users}
          onChange={(e) => setUsers(clampInt(Number(e.target.value), 1, sliderMax))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-ordo-magenta [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/80 [&::-webkit-slider-thumb]:bg-ordo-magenta [&::-webkit-slider-thumb]:shadow-md"
        />
      </div>

        <div className="h-[260px] w-full rounded-xl border border-white/10 bg-black/20 p-2 pt-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartRows} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
              <XAxis
                dataKey="users"
                tick={{ fill: CHART_AXIS, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={9}
                label={{ value: "Active users", position: "insideBottom", offset: -2, fill: CHART_AXIS, fontSize: 11 }}
              />
              <YAxis
                yAxisId="left"
                tick={{ fill: CHART_TOTAL, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={44}
                tickFormatter={(v) => `€${v}`}
                label={{ value: "Total €/mo", angle: -90, position: "insideLeft", fill: CHART_TOTAL, fontSize: 11 }}
              />
              {!compareFlexFixedPlans ? (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: CHART_PER_USER, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tickFormatter={(v) => `€${v}`}
                  label={{ value: "Per-user €", angle: 90, position: "insideRight", fill: CHART_PER_USER, fontSize: 11 }}
                />
              ) : null}
              <Tooltip
                contentStyle={{
                  background: "#16161f",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "8px",
                  color: "#fff",
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) => {
                  if (name === "Flex postpaid") return [`€${Math.round(value).toLocaleString()}/mo`, name];
                  if (name === "Fixed monthly") return [`€${Math.round(value).toLocaleString()}/mo`, name];
                  if (name === "Fixed annual (€/mo)") return [`€${Math.round(value).toLocaleString()}/mo`, name];
                  if (name === "Monthly total") return [`€${Math.round(value).toLocaleString()}/mo`, name];
                  if (name === "Per-user rate") return [`€${Number(value).toFixed(2)}`, name];
                  return [value, name];
                }}
                labelFormatter={(label) => `${label} active users`}
              />
              <ReferenceLine
                x={users}
                yAxisId="left"
                stroke="rgba(255,190,11,0.45)"
                strokeDasharray="4 4"
              />
              {compareFlexFixedPlans ? (
                <>
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="flexTotal"
                    name="Flex postpaid"
                    stroke={CHART_TOTAL}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, fill: CHART_TOTAL }}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="fixedMonthlyEquiv"
                    name="Fixed monthly"
                    stroke={CHART_FIXED}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, fill: CHART_FIXED }}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="fixedAnnualMonthlyEquiv"
                    name="Fixed annual (€/mo)"
                    stroke={CHART_FIXED_ANNUAL}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, fill: CHART_FIXED_ANNUAL }}
                    isAnimationActive={false}
                  />
                </>
              ) : (
                <>
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="total"
                    name="Monthly total"
                    stroke={CHART_TOTAL}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, fill: CHART_TOTAL }}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="perUser"
                    name="Per-user rate"
                    stroke={CHART_PER_USER}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    activeDot={{ r: 4, fill: CHART_PER_USER }}
                    isAnimationActive={false}
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function monthlyAtUsers(m: TieredSeatModel): number[] {
  const floorAt = Math.max(3, Math.floor(m.floorAt));
  return Array.from({ length: TIERED_SEAT_MAX_USERS }, (_, i) =>
    calcMonthlyTotal(i + 1, m.base, m.start, m.floor, floorAt),
  );
}

function MetricCard({
  label,
  hint,
  value,
  valueSuffix,
  sub,
  accent,
}: {
  label: string;
  hint?: string;
  value: string;
  valueSuffix?: string;
  sub: string;
  accent?: "fixedAnnual";
}) {
  const border =
    accent === "fixedAnnual" ? "border-emerald-500/35 bg-emerald-500/10" : "border-white/10 bg-white/[0.04]";
  const labelClass = accent === "fixedAnnual" ? "text-emerald-200/80" : "text-white/45";
  const valueClass = accent === "fixedAnnual" ? "text-emerald-300" : "text-white";
  return (
    <div className={cn("flex min-h-[11rem] flex-col rounded-xl border p-3 md:min-h-[11.5rem] md:p-4", border)}>
      <div className="flex shrink-0 items-start justify-between gap-2">
        <p className={cn("text-[11px] font-medium uppercase leading-snug tracking-wide", labelClass)}>{label}</p>
        {valueSuffix ? (
          <span className="shrink-0 rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white/45">
            {valueSuffix}
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-1.5 shrink-0 text-[10px] leading-snug text-white/45 line-clamp-4">{hint}</p> : null}
      <p className={cn("mt-2 shrink-0 text-xl font-semibold tabular-nums md:text-2xl", valueClass)}>{value}</p>
      <p className="mt-auto text-[11px] leading-snug text-white/45 line-clamp-3">{sub}</p>
    </div>
  );
}

function ModelInput({
  fieldId,
  label,
  hint,
  suffix,
  value,
  onChange,
  onBlur,
  highlight,
  inputMode = "decimal",
  className,
  disabled,
}: {
  fieldId: string;
  label: string;
  hint?: string;
  suffix: "EUR" | "Days" | "%" | "Users";
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  highlight?: boolean;
  inputMode?: "decimal" | "numeric";
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[11.5rem] min-w-0 flex-col rounded-lg border px-3 py-2.5",
        highlight ? "border-emerald-500/40 bg-emerald-500/10" : "border-white/10 bg-white/[0.03]",
        className,
      )}
    >
      <Label
        htmlFor={fieldId}
        className={cn(
          "min-h-[2.5rem] shrink-0 text-[11px] font-medium leading-snug line-clamp-3",
          highlight ? "text-emerald-200/90" : "text-white/50",
        )}
      >
        {label}
      </Label>
      {hint ? (
        <p id={`${fieldId}-hint`} className="mt-1 shrink-0 text-[10px] leading-snug text-white/45 line-clamp-4">
          {hint}
        </p>
      ) : null}
      <div className="min-h-0 flex-1" aria-hidden />
      <InputWithUnitSuffix
        id={fieldId}
        inputMode={inputMode}
        suffix={suffix}
        highlight={highlight}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        aria-describedby={hint ? `${fieldId}-hint` : undefined}
      />
    </div>
  );
}
