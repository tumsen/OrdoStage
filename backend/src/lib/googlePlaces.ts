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
  city: string;
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

  return {
    street: get("route"),
    number: get("street_number"),
    zip: get("postal_code"),
    city: get("locality") || get("postal_town"),
    state: get("administrative_area_level_1"),
    country: get("country"),
  };
}

/** Places API (New) place details — address components for venue forms. */
export async function googlePlaceStructuredAddress(placeId: string): Promise<GoogleStructuredAddress | null> {
  const details = await googlePlaceDetails(placeId);
  if (!details) return null;
  const { name: _name, formattedAddress: _formattedAddress, ...address } = details;
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

  return {
    ...structured,
    name: payload.displayName?.text?.trim() ?? "",
    formattedAddress: payload.formattedAddress?.trim() ?? "",
  };
}
