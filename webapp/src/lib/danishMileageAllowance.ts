export type MileageVehicleType = "car" | "bicycle";

export const SKAT_MILEAGE_URL =
  "https://skat.dk/erhverv/ansatte-og-loen/koerselsgodtgoerelse/koerselsgodtgoerelse-skattepligtig-og-skattefri";

export const CAR_KM_YEAR_LIMIT = 20_000;

export const SKAT_MILEAGE_RATE_SUMMARY = [
  "Skattefri kørselsgodtgørelse for erhvervsmæssig kørsel i egen bil, motorcykel eller cykel.",
  "Egen bil/motorcykel indtil 20.000 km/år (per arbejdsgiver): 3,94 kr./km (2026).",
  "Egen bil/motorcykel over 20.000 km/år: 2,28 kr./km (2026).",
  "Egen cykel, knallert eller EU-knallert: 0,64 kr./km (2026).",
  "Bro, færge, parkering og motorvej dækkes ikke — kan udbetales som udlæg efter regning.",
] as const;

type MileageRates = {
  rateYear: number;
  rateCentsPerKmHigh: number;
  rateCentsPerKmLow: number;
  bicycleRateCentsPerKm: number;
};

export function ratesForDanishMileage(rateYear: number): MileageRates {
  const year = rateYear === 2025 ? 2025 : 2026;
  if (year === 2025) {
    return {
      rateYear: year,
      rateCentsPerKmHigh: 381,
      rateCentsPerKmLow: 223,
      bicycleRateCentsPerKm: 63,
    };
  }
  return {
    rateYear: year,
    rateCentsPerKmHigh: 394,
    rateCentsPerKmLow: 228,
    bicycleRateCentsPerKm: 64,
  };
}

export function formatMoneyDkk(cents: number): string {
  return `${(cents / 100).toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.`;
}

export function formatKrPerKm(centsPerKm: number): string {
  return `${(centsPerKm / 100).toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr./km`;
}

export type MileagePayoutInput = {
  vehicleType: MileageVehicleType;
  distanceKm: number;
  rateYear?: number;
  carKmYtdBeforeTrip?: number;
  salaryReductionAgreement?: boolean;
  receivesBIncome?: boolean;
};

export type MileagePayoutResult = MileageRates & {
  highRateKm: number;
  lowRateKm: number;
  totalAmountCents: number;
};

export function computeMileagePayout(input: MileagePayoutInput): MileagePayoutResult {
  const rates = ratesForDanishMileage(input.rateYear ?? new Date().getFullYear());
  const eligible = input.salaryReductionAgreement !== true && input.receivesBIncome !== true;
  const distanceKm = Number.isFinite(input.distanceKm) ? Math.max(0, input.distanceKm) : 0;

  if (!eligible || distanceKm <= 0) {
    return { ...rates, highRateKm: 0, lowRateKm: 0, totalAmountCents: 0 };
  }

  if (input.vehicleType === "bicycle") {
    return {
      ...rates,
      highRateKm: 0,
      lowRateKm: 0,
      totalAmountCents: Math.round(distanceKm * rates.bicycleRateCentsPerKm),
    };
  }

  const ytd = Math.max(0, input.carKmYtdBeforeTrip ?? 0);
  const highRemaining = Math.max(0, CAR_KM_YEAR_LIMIT - ytd);
  const highRateKm = Math.min(distanceKm, highRemaining);
  const lowRateKm = distanceKm - highRateKm;
  const totalAmountCents = Math.round(
    highRateKm * rates.rateCentsPerKmHigh + lowRateKm * rates.rateCentsPerKmLow
  );

  return { ...rates, highRateKm, lowRateKm, totalAmountCents };
}

export function describeMileagePayout(input: MileagePayoutInput): string {
  const result = computeMileagePayout(input);
  if (result.totalAmountCents <= 0) return "Ingen skattefri kørselsgodtgørelse med nuværende oplysninger.";

  if (input.vehicleType === "bicycle") {
    return `${input.distanceKm.toLocaleString("da-DK")} km × ${formatKrPerKm(result.bicycleRateCentsPerKm)} = ${formatMoneyDkk(result.totalAmountCents)}`;
  }

  if (result.lowRateKm > 0) {
    return `${result.highRateKm.toLocaleString("da-DK")} km × ${formatKrPerKm(result.rateCentsPerKmHigh)} + ${result.lowRateKm.toLocaleString("da-DK")} km × ${formatKrPerKm(result.rateCentsPerKmLow)} = ${formatMoneyDkk(result.totalAmountCents)}`;
  }

  return `${input.distanceKm.toLocaleString("da-DK")} km × ${formatKrPerKm(result.rateCentsPerKmHigh)} = ${formatMoneyDkk(result.totalAmountCents)}`;
}
