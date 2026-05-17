import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { InputWithUnitSuffix } from "@/components/pricing/TieredSeatPricingCalculator";
import type { FixedPlanPricingConfig } from "@/lib/fixedPlanPricingConfig";
import type { TieredSeatModel } from "@/lib/tieredSeatPricing";

function parseMoney(s: string, fallback: number): number {
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) ? v : fallback;
}

function CompactField({
  id,
  label,
  suffix,
  value,
  onChange,
  onBlur,
  inputMode = "decimal",
  accent,
}: {
  id: string;
  label: string;
  suffix: "EUR" | "Days" | "%" | "Users";
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  inputMode?: "decimal" | "numeric";
  accent?: "flex" | "fixed" | "neutral";
}) {
  const border =
    accent === "flex"
      ? "border-ordo-magenta/35 bg-ordo-magenta/5"
      : accent === "fixed"
        ? "border-ordo-violet/35 bg-ordo-violet/5"
        : "border-white/10 bg-white/[0.03]";
  return (
    <div className={cn("flex min-w-[7.25rem] max-w-[9.5rem] shrink-0 flex-col rounded-lg border px-2.5 py-2", border)}>
      <Label htmlFor={id} className="text-[10px] font-medium leading-snug text-white/55 line-clamp-2 min-h-[2rem]">
        {label}
      </Label>
      <div className="mt-1.5">
        <InputWithUnitSuffix
          id={id}
          suffix={suffix}
          inputMode={inputMode}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          className="[&_input]:h-8 [&_input]:text-sm"
        />
      </div>
    </div>
  );
}

function PlanSettingsRow({
  title,
  accentClass,
  children,
}: {
  title: string;
  accentClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className={cn("text-[11px] font-semibold uppercase tracking-wide", accentClass)}>{title}</p>
      <div className="flex flex-nowrap items-stretch gap-2 overflow-x-auto pb-0.5">{children}</div>
    </div>
  );
}

export function FlexSeatModelRow({
  model,
  onChange,
}: {
  model: TieredSeatModel;
  onChange: (m: TieredSeatModel) => void;
}) {
  const [baseDraft, setBaseDraft] = useState(String(model.base));
  const [startDraft, setStartDraft] = useState(String(model.start));
  const [floorAtDraft, setFloorAtDraft] = useState(String(model.floorAt));
  const [floorDraft, setFloorDraft] = useState(String(model.floor));

  useEffect(() => setBaseDraft(String(model.base)), [model.base]);
  useEffect(() => setStartDraft(String(model.start)), [model.start]);
  useEffect(() => setFloorAtDraft(String(model.floorAt)), [model.floorAt]);
  useEffect(() => setFloorDraft(String(model.floor)), [model.floor]);

  return (
    <PlanSettingsRow title="Flex · monthly postpaid" accentClass="text-ordo-magenta/90">
      <CompactField
        id="flex-base"
        label="1st seat base"
        suffix="EUR"
        accent="flex"
        value={baseDraft}
        onChange={setBaseDraft}
        onBlur={() => {
          const n = parseMoney(baseDraft, model.base);
          onChange({ ...model, base: Math.max(0, n) });
        }}
      />
      <CompactField
        id="flex-seat2"
        label="2nd seat marginal"
        suffix="EUR"
        accent="flex"
        value={startDraft}
        onChange={setStartDraft}
        onBlur={() => {
          const n = parseMoney(startDraft, model.start);
          onChange({ ...model, start: Math.max(1, n) });
        }}
      />
      <CompactField
        id="flex-floor-at"
        label="Floor from seat"
        suffix="Users"
        inputMode="numeric"
        accent="flex"
        value={floorAtDraft}
        onChange={setFloorAtDraft}
        onBlur={() => {
          const n = parseInt(floorAtDraft, 10);
          const clamped = Number.isFinite(n) ? Math.min(150, Math.max(3, n)) : model.floorAt;
          onChange({ ...model, floorAt: clamped });
        }}
      />
      <CompactField
        id="flex-floor"
        label="Floor marginal"
        suffix="EUR"
        accent="flex"
        value={floorDraft}
        onChange={setFloorDraft}
        onBlur={() => {
          const n = parseMoney(floorDraft, model.floor);
          onChange({ ...model, floor: Math.max(1, n) });
        }}
      />
    </PlanSettingsRow>
  );
}

export function FixedPlanSettingsRow({
  onCommit,
  fixedAnnualRoundToTen,
  onFixedAnnualRoundToTenChange,
  drafts,
  setDrafts,
}: {
  onCommit: () => FixedPlanPricingConfig;
  fixedAnnualRoundToTen: boolean;
  onFixedAnnualRoundToTenChange: (v: boolean) => void;
  drafts: {
    firstSeat: string;
    monthlyDiscMin: string;
    monthlyDiscMax: string;
    annualDiscMin: string;
    annualDiscMax: string;
    discCap: string;
    maxSeats: string;
    passEnabled: boolean;
    passDays: string;
    passPricePerSeat: string;
  };
  setDrafts: React.Dispatch<
    React.SetStateAction<{
      firstSeat: string;
      monthlyDiscMin: string;
      monthlyDiscMax: string;
      annualDiscMin: string;
      annualDiscMax: string;
      discCap: string;
      maxSeats: string;
      passEnabled: boolean;
      passDays: string;
      passPricePerSeat: string;
    }>
  >;
}) {
  return (
    <PlanSettingsRow title="Yearly · annual prepay" accentClass="text-ordo-violet/90">
      <CompactField
        id="fixed-first-seat"
        label="1st seat €/mo"
        suffix="EUR"
        accent="fixed"
        value={drafts.firstSeat}
        onChange={(v) => setDrafts((d) => ({ ...d, firstSeat: v }))}
        onBlur={onCommit}
      />
      <CompactField
        id="fixed-monthly-disc-min"
        label="Monthly disc. min"
        suffix="%"
        inputMode="numeric"
        accent="fixed"
        value={drafts.monthlyDiscMin}
        onChange={(v) => setDrafts((d) => ({ ...d, monthlyDiscMin: v }))}
        onBlur={onCommit}
      />
      <CompactField
        id="fixed-monthly-disc-max"
        label="Monthly disc. max"
        suffix="%"
        inputMode="numeric"
        accent="fixed"
        value={drafts.monthlyDiscMax}
        onChange={(v) => setDrafts((d) => ({ ...d, monthlyDiscMax: v }))}
        onBlur={onCommit}
      />
      <CompactField
        id="fixed-annual-disc-min"
        label="Annual disc. min"
        suffix="%"
        inputMode="numeric"
        accent="fixed"
        value={drafts.annualDiscMin}
        onChange={(v) => setDrafts((d) => ({ ...d, annualDiscMin: v }))}
        onBlur={onCommit}
      />
      <CompactField
        id="fixed-annual-disc-max"
        label="Annual disc. max"
        suffix="%"
        inputMode="numeric"
        accent="fixed"
        value={drafts.annualDiscMax}
        onChange={(v) => setDrafts((d) => ({ ...d, annualDiscMax: v }))}
        onBlur={onCommit}
      />
      <CompactField
        id="fixed-disc-cap"
        label="Disc. cap seats"
        suffix="Users"
        inputMode="numeric"
        accent="fixed"
        value={drafts.discCap}
        onChange={(v) => setDrafts((d) => ({ ...d, discCap: v }))}
        onBlur={onCommit}
      />
      <CompactField
        id="fixed-max-seats"
        label="Max self-serve"
        suffix="Users"
        inputMode="numeric"
        accent="fixed"
        value={drafts.maxSeats}
        onChange={(v) => setDrafts((d) => ({ ...d, maxSeats: v }))}
        onBlur={onCommit}
      />
      <CompactField
        id="fixed-pass-days"
        label="Short pass days"
        suffix="Days"
        inputMode="numeric"
        accent="fixed"
        value={drafts.passDays}
        onChange={(v) => setDrafts((d) => ({ ...d, passDays: v }))}
        onBlur={onCommit}
      />
      <CompactField
        id="fixed-pass-price"
        label="Pass €/seat"
        suffix="EUR"
        accent="fixed"
        value={drafts.passPricePerSeat}
        onChange={(v) => setDrafts((d) => ({ ...d, passPricePerSeat: v }))}
        onBlur={onCommit}
      />
      <div className="flex min-w-[7.25rem] shrink-0 flex-col justify-center gap-2 rounded-lg border border-ordo-violet/35 bg-ordo-violet/5 px-2.5 py-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="fixed-pass-enabled"
            checked={drafts.passEnabled}
            onCheckedChange={(v) => {
              setDrafts((d) => ({ ...d, passEnabled: v === true }));
              onCommit();
            }}
          />
          <Label htmlFor="fixed-pass-enabled" className="text-[10px] text-white/60 cursor-pointer leading-snug">
            Short-term pass
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="fixed-round-ten"
            checked={fixedAnnualRoundToTen}
            onCheckedChange={(v) => onFixedAnnualRoundToTenChange(v === true)}
          />
          <Label htmlFor="fixed-round-ten" className="text-[10px] text-white/60 cursor-pointer leading-snug">
            Round annual to €10
          </Label>
        </div>
      </div>
    </PlanSettingsRow>
  );
}

export function BillingOpsRow({
  paymentDueDays,
  onPaymentDueDaysChange,
  billingTrialDays,
  onBillingTrialDaysChange,
  billingGraceDaysAfterDue,
  onBillingGraceDaysAfterDueChange,
}: {
  paymentDueDays: string;
  onPaymentDueDaysChange: (v: string) => void;
  billingTrialDays: string;
  onBillingTrialDaysChange: (v: string) => void;
  billingGraceDaysAfterDue: string;
  onBillingGraceDaysAfterDueChange: (v: string) => void;
}) {
  return (
    <PlanSettingsRow title="Billing operations" accentClass="text-white/50">
      <CompactField
        id="admin-invoice-due-days"
        label="Invoice due"
        suffix="Days"
        inputMode="numeric"
        accent="neutral"
        value={paymentDueDays}
        onChange={onPaymentDueDaysChange}
      />
      <CompactField
        id="admin-billing-trial-days"
        label="Trial length"
        suffix="Days"
        inputMode="numeric"
        accent="neutral"
        value={billingTrialDays}
        onChange={onBillingTrialDaysChange}
      />
      <CompactField
        id="admin-billing-grace-days"
        label="Grace after due"
        suffix="Days"
        inputMode="numeric"
        accent="neutral"
        value={billingGraceDaysAfterDue}
        onChange={onBillingGraceDaysAfterDueChange}
      />
    </PlanSettingsRow>
  );
}
