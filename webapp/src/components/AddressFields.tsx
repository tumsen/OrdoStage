import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";

import { api, isApiError } from "@/lib/api";

export interface Address {
  street: string;
  number: string;
  zip: string;
  city: string;
  state: string;
  country: string;
}

export const EMPTY_ADDRESS: Address = {
  street: "",
  number: "",
  zip: "",
  city: "",
  state: "",
  country: "",
};

interface Props {
  value: Address;
  onChange: (value: Address) => void;
  disabled?: boolean;
  /** ISO 3166-1 alpha-2 country bias for Places search. */
  countryBias?: string;
  /** Hide the Google Places search row (manual fields only). */
  hideSearch?: boolean;
}

const fieldCls =
  "w-full h-9 px-3 text-sm rounded-md border bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-white/30 disabled:opacity-50";

type PlaceSuggestion = { placeId: string; description: string };

type PlaceDetails = {
  street: string;
  number: string;
  zip: string;
  city: string;
  state: string;
  country: string;
  formattedAddress: string;
};

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 250;

function PlacesAddressSearch({
  disabled,
  countryBias,
  onPick,
}: {
  disabled?: boolean;
  countryBias?: string;
  onPick: (addr: Address) => void;
}) {
  const autoId = useId();
  const listboxId = `${autoId}-suggestions`;
  const containerRef = useRef<HTMLDivElement>(null);
  const blurTimerRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const clearBlurTimer = useCallback(() => {
    if (blurTimerRef.current != null) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (disabled) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        if (countryBias) params.set("country", countryBias);
        const rows = await api.get<PlaceSuggestion[]>(
          `/api/venues/address-search?${params.toString()}`
        );
        if (requestId !== requestIdRef.current) return;
        setSuggestions(rows);
        setOpen(rows.length > 0);
        setActiveIndex(-1);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setSuggestions([]);
        setOpen(false);
        setError(
          isApiError(err) &&
            (err.data as { code?: string } | undefined)?.code === "GOOGLE_MAPS_NOT_CONFIGURED"
            ? "Google Maps er ikke konfigureret"
            : "Kunne ikke søge adresse"
        );
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [countryBias, disabled, query]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const selectSuggestion = async (suggestion: PlaceSuggestion) => {
    setQuery(suggestion.description);
    setSuggestions([]);
    setOpen(false);
    setResolving(true);
    setError(null);
    try {
      const details = await api.get<PlaceDetails | null>(
        `/api/venues/address-details?placeId=${encodeURIComponent(suggestion.placeId)}`
      );
      if (!details) {
        setError("Kunne ikke hente adresseoplysninger");
        return;
      }
      onPick({
        street: details.street || "",
        number: details.number || "",
        zip: details.zip || "",
        city: details.city || "",
        state: details.state || "",
        country: details.country || "",
      });
    } catch {
      setError("Kunne ikke hente adresseoplysninger");
    } finally {
      setResolving(false);
    }
  };

  return (
    <div ref={containerRef} className="relative space-y-1">
      <label className="block text-xs text-white/40">Søg med Google Maps</label>
      <div className="relative">
        <MapPin
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/35"
        />
        <input
          type="text"
          value={query}
          disabled={disabled || resolving}
          placeholder="Søg adresse…"
          className={`${fieldCls} pl-8 pr-8`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            clearBlurTimer();
            if (suggestions.length > 0) setOpen(true);
          }}
          onBlur={() => {
            clearBlurTimer();
            blurTimerRef.current = window.setTimeout(() => {
              setOpen(false);
              setActiveIndex(-1);
            }, 150);
          }}
          onKeyDown={(e) => {
            if (!open || suggestions.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && activeIndex >= 0) {
              e.preventDefault();
              const s = suggestions[activeIndex];
              if (s) void selectSuggestion(s);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {(loading || resolving) && (
          <Loader2
            size={14}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-white/40"
          />
        )}
      </div>
      {error ? <p className="text-[10px] text-amber-300/80">{error}</p> : null}
      {open && suggestions.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-48 w-full overflow-auto rounded-md border border-white/15 bg-[#16161f] py-1 shadow-xl"
        >
          {suggestions.map((s, i) => (
            <li key={s.placeId} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                className={`flex w-full px-3 py-2 text-left text-xs text-white/85 hover:bg-white/10 ${
                  i === activeIndex ? "bg-white/10" : ""
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void selectSuggestion(s)}
              >
                {s.description}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Structured address fields with optional Google Places search that fills the fields.
 */
export function AddressFields({
  value,
  onChange,
  disabled = false,
  countryBias = "dk",
  hideSearch = false,
}: Props) {
  function set(field: keyof Address, v: string) {
    onChange({ ...value, [field]: v });
  }

  return (
    <div className="space-y-3">
      {!hideSearch ? (
        <PlacesAddressSearch
          disabled={disabled}
          countryBias={countryBias}
          onPick={onChange}
        />
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className="block text-xs text-white/40 mb-1">Street</label>
          <input
            type="text"
            value={value.street}
            disabled={disabled}
            placeholder="Main Street"
            className={fieldCls}
            onChange={(e) => set("street", e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-white/40 mb-1">Number</label>
          <input
            type="text"
            value={value.number}
            disabled={disabled}
            placeholder="42"
            className={fieldCls}
            onChange={(e) => set("number", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-white/40 mb-1">ZIP / Postal</label>
          <input
            type="text"
            value={value.zip}
            disabled={disabled}
            placeholder="5700"
            className={fieldCls}
            onChange={(e) => set("zip", e.target.value)}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-white/40 mb-1">City</label>
          <input
            type="text"
            value={value.city}
            disabled={disabled}
            placeholder="Svendborg"
            className={fieldCls}
            onChange={(e) => set("city", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-white/40 mb-1">State / Region</label>
          <input
            type="text"
            value={value.state}
            disabled={disabled}
            placeholder="South Denmark"
            className={fieldCls}
            onChange={(e) => set("state", e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-white/40 mb-1">Country</label>
          <input
            type="text"
            value={value.country}
            disabled={disabled}
            placeholder="Denmark"
            className={fieldCls}
            onChange={(e) => set("country", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

/** Compose an Address object into a single display string. */
type AddressLike = {
  street?: string | null;
  number?: string | null;
  zip?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
};

export function formatAddress(addr: AddressLike | null | undefined): string {
  if (!addr) return "";
  const line1 =
    addr.street && addr.number
      ? `${addr.street} ${addr.number}`
      : addr.street ?? "";
  const line2 =
    addr.zip && addr.city
      ? `${addr.zip} ${addr.city}`
      : addr.city ?? "";
  return [line1, line2, addr.state, addr.country].filter(Boolean).join(", ");
}

export function googleMapsUrl(addr: AddressLike | null | undefined): string {
  const q = formatAddress(addr).trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function appleMapsUrl(addr: AddressLike | null | undefined): string {
  const q = formatAddress(addr).trim();
  return `https://maps.apple.com/?q=${encodeURIComponent(q)}`;
}
