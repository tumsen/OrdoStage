import { env } from "../env";

export class GoogleMapsNotConfiguredError extends Error {
  constructor() {
    super("GOOGLE_MAPS_NOT_CONFIGURED");
    this.name = "GoogleMapsNotConfiguredError";
  }
}

export type GooglePlaceSuggestion = {
  placeId: string;
  description: string;
};

export type GoogleStructuredAddress = {
  street: string;
  number: string;
  zip: string;
  /** Main post city — prefer postal_town over locality (e.g. Svendborg not Troense). */
  city: string;
  /** Suburb / village when distinct from post city (e.g. Troense). */
  locality: string;
  /** Post town when Google returns one separately from locality. */
  postalTown: string;
  state: string;
  country: string;
};

function requireApiKey(): string {
  const key = env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) throw new GoogleMapsNotConfiguredError();
  return key;
}

function googlePlacesHeaders(fieldMask: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": requireApiKey(),
    "X-Goog-FieldMask": fieldMask,
  };
}

/** Places API (New) autocomplete — https://developers.google.com/maps/documentation/places/web-service/place-autocomplete */
export async function googlePlaceAutocomplete(params: {
  input: string;
  country?: string;
  /** Legacy hint: "geocode" (broad) or "address" (street addresses). */
  types?: string;
}): Promise<GooglePlaceSuggestion[]> {
  const body: Record<string, unknown> = { input: params.input };

  const country = params.country?.trim().toLowerCase();
  if (country && /^[a-z]{2}$/.test(country)) {
    body.includedRegionCodes = [country];
  }

  if (params.types === "address") {
    body.includedPrimaryTypes = ["street_address", "premise", "subpremise"];
  }

  if (params.types === "lodging") {
    // Places API (New) allows at most 5 primary types per request.
    body.includedPrimaryTypes = ["lodging", "hotel", "motel", "guest_house", "bed_and_breakfast"];
  }

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: googlePlacesHeaders(
      "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text"
    ),
    body: JSON.stringify(body),
  });

  if (!response.ok) return [];

  const payload = (await response.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
      };
    }>;
  };

  return (payload.suggestions ?? [])
    .map((item) => item.placePrediction)
    .filter((prediction): prediction is { placeId: string; text: { text: string } } =>
      Boolean(prediction?.placeId && prediction.text?.text)
    )
    .map((prediction) => ({
      placeId: prediction.placeId,
      description: prediction.text.text,
    }));
}

export type GooglePlaceDetails = GoogleStructuredAddress & {
  name: string;
  formattedAddress: string;
  displayLabel: string;
};

function structuredAddressFromComponents(
  components: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
  }>
): GoogleStructuredAddress {
  function get(type: string, short = false): string {
    const component = components.find((item) => item.types?.includes(type));
    if (!component) return "";
    return (short ? component.shortText : component.longText) ?? "";
  }

  const locality = get("locality") || get("sublocality") || get("neighborhood");
  const postalTown = get("postal_town");

  return {
    street: get("route"),
    number: get("street_number"),
    zip: get("postal_code"),
    locality,
    postalTown,
    city: postalTown || locality,
    state: get("administrative_area_level_1"),
    country: get("country"),
  };
}

function nameAlreadyInAddress(name: string, address: string): boolean {
  const n = name.trim().toLowerCase();
  const a = address.trim().toLowerCase();
  if (!n || !a) return false;
  return a === n || a.startsWith(`${n},`) || a.includes(`, ${n},`) || a.endsWith(`, ${n}`);
}

/** Human-readable lodging label — no duplicate street/name; post town + suburb. */
export function formatLodgingPlaceLabel(details: GooglePlaceDetails): string {
  const streetLine = [details.street, details.number].filter(Boolean).join(" ");
  const mainCity = details.postalTown || details.city;
  const suburb =
    details.locality &&
    mainCity &&
    details.locality.toLowerCase() !== mainCity.toLowerCase()
      ? ` (${details.locality})`
      : "";

  if (streetLine) {
    const cityPart = [details.zip, mainCity].filter(Boolean).join(" ") + suburb;
    const structured = [streetLine, cityPart, details.country].filter(Boolean).join(", ");
    const name = details.name.trim();
    if (name && name !== streetLine && !nameAlreadyInAddress(name, structured)) {
      return `${name}, ${structured}`;
    }
    return structured;
  }

  const formatted = details.formattedAddress.trim();
  const name = details.name.trim();
  if (formatted) {
    if (name && !nameAlreadyInAddress(name, formatted)) {
      return `${name}, ${formatted}`;
    }
    return formatted;
  }

  return name;
}

/** Places API (New) place details — address components for venue forms. */
export async function googlePlaceStructuredAddress(placeId: string): Promise<GoogleStructuredAddress | null> {
  const details = await googlePlaceDetails(placeId);
  if (!details) return null;
  const { name: _n, formattedAddress: _f, displayLabel: _d, ...address } = details;
  return address;
}

/** Place name, formatted address, and structured components (hotels, venues, etc.). */
export async function googlePlaceDetails(placeId: string): Promise<GooglePlaceDetails | null> {
  const encodedPlaceId = encodeURIComponent(placeId);
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodedPlaceId}`, {
    method: "GET",
    headers: googlePlacesHeaders("displayName,formattedAddress,addressComponents"),
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as {
    displayName?: { text?: string };
    formattedAddress?: string;
    addressComponents?: Array<{
      longText?: string;
      shortText?: string;
      types?: string[];
    }>;
  };

  const components = payload.addressComponents ?? [];
  const structured = structuredAddressFromComponents(components);
  const name = payload.displayName?.text?.trim() ?? "";
  const formattedAddress = payload.formattedAddress?.trim() ?? "";

  const details: GooglePlaceDetails = {
    ...structured,
    name,
    formattedAddress,
    displayLabel: "",
  };
  details.displayLabel = formatLodgingPlaceLabel(details);

  return details;
}
