import { env } from "../env";

export type GoogleTravelMode = "driving" | "bicycling";

export class GoogleMapsNotConfiguredError extends Error {
  constructor() {
    super("GOOGLE_MAPS_NOT_CONFIGURED");
    this.name = "GoogleMapsNotConfiguredError";
  }
}

export class GoogleMapsRouteNotFoundError extends Error {
  constructor() {
    super("ROUTE_NOT_FOUND");
    this.name = "GoogleMapsRouteNotFoundError";
  }
}

export async function googleRouteDistanceKm(params: {
  from: string;
  to: string;
  mode: GoogleTravelMode;
}): Promise<{ distanceKm: number; durationSeconds: number | null }> {
  if (!env.GOOGLE_MAPS_API_KEY) {
    throw new GoogleMapsNotConfiguredError();
  }

  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", params.from);
  url.searchParams.set("destinations", params.to);
  url.searchParams.set("mode", params.mode);
  url.searchParams.set("region", "dk");
  url.searchParams.set("key", env.GOOGLE_MAPS_API_KEY);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new GoogleMapsRouteNotFoundError();
  }

  const payload = (await response.json()) as {
    rows?: Array<{
      elements?: Array<{
        status?: string;
        distance?: { value?: number };
        duration?: { value?: number };
      }>;
    }>;
  };

  const element = payload.rows?.[0]?.elements?.[0];
  if (element?.status !== "OK") {
    throw new GoogleMapsRouteNotFoundError();
  }

  const meters = element.distance?.value ?? 0;
  const durationSeconds = element.duration?.value ?? null;
  const distanceKm = Math.round((meters / 1000) * 10) / 10;

  return { distanceKm, durationSeconds };
}
