import { useEffect, useMemo, useState } from "react";
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
  annualMonthlyMultiplier,
  calcMonthlyTotal,
  DEFAULT_TIERED_SEAT_MODEL,
  perUserRate,
  TIERED_SEAT_MAX_USERS,
  type TieredSeatModel,
} from "@/lib/tieredSeatPricing";

const CHART_TOTAL = "#ff006e";
const CHART_PER_USER = "#3a86ff";
const CHART_GRID = "rgba(255,255,255,0.06)";
const CHART_AXIS = "rgba(255,255,255,0.38)";

type Props = {
  /** Owner admin: editable model inputs. Public: fixed defaults. */
  showModelControls?: boolean;
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
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function parseMoney(s: string, fallback: number): number {
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) ? v : fallback;
}

export function TieredSeatPricingCalculator({
  showModelControls = false,
  className,
  showTrialBadge = true,
  yearlyDiscountPercent = 15,
  yearlyDiscountEnabled = true,
  showYearlyDiscountControls = false,
  onYearlyDiscountPercentChange,
  onYearlyDiscountEnabledChange,
  seatModel: controlledSeatModel,
  onSeatModelChange,
}: Props) {
  const [users, setUsers] = useState(20);
  const [annual, setAnnual] = useState(false);
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

  const [yearlyPercentDraft, setYearlyPercentDraft] = useState(String(yearlyDiscountPercent));
  useEffect(() => {
    setYearlyPercentDraft(String(yearlyDiscountPercent));
  }, [yearlyDiscountPercent]);

  const floorAtSafe = Math.max(3, Math.floor(model.floorAt));
  const monthlyList = useMemo(() => monthlyAtUsers(model), [model]);
  const mult = annualMonthlyMultiplier(yearlyDiscountPercent, yearlyDiscountEnabled);
  const chartRows = useMemo(
    () =>
      Array.from({ length: TIERED_SEAT_MAX_USERS }, (_, i) => {
        const u = i + 1;
        return {
          users: u,
          total: monthlyList[u - 1] ?? 0,
          perUser: perUserRate(u, model.start, model.floor, floorAtSafe),
        };
      }),
    [monthlyList, model.start, model.floor, floorAtSafe],
  );

  const baseMonthly = monthlyList[users - 1] ?? 0;
  const discountedMonthly = annual ? baseMonthly * mult : baseMonthly;
  const annualTotal = discountedMonthly * 12;
  const perUserEffective = users > 0 ? discountedMonthly / users : 0;
  const thisRate = perUserRate(users, model.start, model.floor, floorAtSafe);
  const stepDen = floorAtSafe - 2;
  const step = stepDen > 0 ? (model.start - model.floor) / stepDen : 0;
  const annualSavingsYear = annual ? Math.round((baseMonthly - discountedMonthly) * 12) : 0;

  const annualSub =
    annual && yearlyDiscountEnabled
      ? `billed annually (${yearlyDiscountPercent}% off)`
      : annual
        ? "billed annually (no discount)"
        : "billed monthly";
  const annualTotalSub =
    annual && yearlyDiscountEnabled ? `${yearlyDiscountPercent}% saved vs monthly` : annual ? "per year" : "per year";

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

  return (
    <div className={cn("space-y-6 text-white", className)}>
      {showTrialBadge ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-md border border-ordo-blue/35 bg-ordo-blue/10 px-2.5 py-1 text-[11px] font-medium text-sky-200/95">
            30-day free trial · No credit card required
          </span>
        </div>
      ) : null}

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
          max={TIERED_SEAT_MAX_USERS}
          step={1}
          value={users}
          onChange={(e) => setUsers(clampInt(Number(e.target.value), 1, TIERED_SEAT_MAX_USERS))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-ordo-magenta [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/80 [&::-webkit-slider-thumb]:bg-ordo-magenta [&::-webkit-slider-thumb]:shadow-md"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
        <Switch
          id="annual-billing"
          checked={annual}
          onCheckedChange={setAnnual}
          className="data-[state=checked]:bg-ordo-magenta data-[state=unchecked]:bg-white/20"
        />
        <Label htmlFor="annual-billing" className="cursor-pointer text-sm text-white/70">
          Annual billing
        </Label>
        {annual && yearlyDiscountEnabled && yearlyDiscountPercent > 0 ? (
          <span className="rounded-md border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-200/95">
            Save €{annualSavingsYear.toLocaleString()}/yr
          </span>
        ) : null}
      </div>

      {showYearlyDiscountControls ? (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-white/50">Annual discount (%)</Label>
            <Input
              type="text"
              inputMode="numeric"
              value={yearlyPercentDraft}
              onChange={(e) => setYearlyPercentDraft(e.target.value)}
              onBlur={commitYearlyPercentDraft}
              className="h-9 border-white/15 bg-black/30 text-white tabular-nums"
            />
            <p className="text-[10px] text-white/40">Applied when “Annual billing” is on above.</p>
          </div>
          <div className="flex items-center gap-3 pt-5 sm:pt-6">
            <Switch
              id="yearly-discount-enabled"
              checked={yearlyDiscountEnabled}
              onCheckedChange={(v) => onYearlyDiscountEnabledChange?.(v)}
              className="data-[state=checked]:bg-ordo-magenta data-[state=unchecked]:bg-white/20"
            />
            <Label htmlFor="yearly-discount-enabled" className="cursor-pointer text-sm text-white/70">
              Apply annual discount
            </Label>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <MetricCard label="Monthly total" value={`€${Math.round(discountedMonthly).toLocaleString()}`} sub={annualSub} />
        <MetricCard label="Annual total" value={`€${Math.round(annualTotal).toLocaleString()}`} sub={annualTotalSub} />
        <MetricCard label="Effective per user" value={`€${perUserEffective.toFixed(2)}`} sub="per active user/mo" />
      </div>

      {showModelControls ? (
        <>
          <p className="text-xs font-medium uppercase tracking-wide text-white/45">Model settings (illustrative EUR)</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <ModelInput
              label="Base fee (1 user) €"
              value={String(model.base)}
              onChange={(v) => setModel((m) => ({ ...m, base: Math.max(0, parseMoney(v, m.base)) }))}
            />
            <ModelInput
              label="User 2 price €"
              value={String(model.start)}
              onChange={(v) => setModel((m) => ({ ...m, start: Math.max(1, parseMoney(v, m.start)) }))}
            />
            <ModelInput
              label="Floor reached at user #"
              highlight
              value={floorAtDraft}
              onChange={setFloorAtDraft}
              onBlur={commitFloorAtDraft}
            />
            <ModelInput
              label="Floor price €"
              highlight
              value={String(model.floor)}
              onChange={(v) => setModel((m) => ({ ...m, floor: Math.max(1, parseMoney(v, m.floor)) }))}
            />
          </div>
        </>
      ) : null}

      <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white/65 sm:flex-row sm:items-center sm:justify-between">
        <span>
          User <strong className="font-medium text-white">{users}</strong> costs{" "}
          <strong className="font-medium text-white">{users === 1 ? "(base only)" : `€${thisRate.toFixed(2)}`}</strong>
        </span>
        <span>
          Discount step per user:{" "}
          <strong className="font-medium text-white">€{step.toFixed(2)}</strong>
        </span>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-white/45">Price curve</p>
        <div className="flex flex-wrap gap-4 text-[11px] text-white/55">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#ff006e]" aria-hidden />
            Total monthly cost
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#3a86ff]" aria-hidden />
            Per-user rate
          </span>
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
              <Tooltip
                contentStyle={{
                  background: "#16161f",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "8px",
                  color: "#fff",
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) => {
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

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 md:p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-white md:text-2xl">{value}</p>
      <p className="mt-0.5 text-[11px] text-white/45">{sub}</p>
    </div>
  );
}

function ModelInput({
  label,
  value,
  onChange,
  onBlur,
  highlight,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5",
        highlight ? "border-emerald-500/40 bg-emerald-500/10" : "border-white/10 bg-white/[0.03]",
      )}
    >
      <Label className={cn("text-[11px] font-medium", highlight ? "text-emerald-200/90" : "text-white/50")}>{label}</Label>
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={cn(
          "mt-1.5 h-9 border-white/15 bg-black/30 text-white tabular-nums",
          highlight && "border-emerald-500/30 focus-visible:ring-emerald-500/40",
        )}
      />
    </div>
  );
}
