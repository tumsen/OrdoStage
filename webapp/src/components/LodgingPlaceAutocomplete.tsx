import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ExternalLink, Loader2, MapPin } from "lucide-react";

import { api, isApiError } from "@/lib/api";

type PlaceSuggestion = {
  placeId: string;
  description: string;
};

export type LodgingPlaceSelection = {
  lodgingPlaceId: string;
  lodgingLabel: string;
  hotel: string;
  city: string;
};

type PlaceDetails = {
  name: string;
  formattedAddress: string;
  city: string;
  street: string;
  number: string;
  zip: string;
  state: string;
  country: string;
};

interface Props {
  value: string;
  placeId?: string;
  onChange: (patch: Partial<LodgingPlaceSelection>) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  country?: string;
  id?: string;
  "aria-label"?: string;
}

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 250;

export function lodgingPlaceDisplayLabel(line: {
  lodgingLabel?: string;
  hotel?: string;
  city?: string;
}): string {
  if (line.lodgingLabel != null && line.lodgingLabel.length > 0) return line.lodgingLabel;
  return [line.hotel?.trim(), line.city?.trim()].filter(Boolean).join(", ");
}

async function fetchLodgingSuggestions(query: string, country?: string): Promise<PlaceSuggestion[]> {
  const params = new URLSearchParams({ q: query, types: "lodging" });
  if (country) params.set("country", country);
  const lodging = await api.get<PlaceSuggestion[]>(`/api/venues/address-search?${params.toString()}`);
  if (lodging.length > 0) return lodging;

  const broadParams = new URLSearchParams({ q: query });
  if (country) broadParams.set("country", country);
  return api.get<PlaceSuggestion[]>(`/api/venues/address-search?${broadParams.toString()}`);
}

export function LodgingPlaceAutocomplete({
  value,
  placeId,
  onChange,
  placeholder = "Search hotel or lodging…",
  className = "",
  disabled = false,
  readOnly = false,
  country,
  id: idProp,
  "aria-label": ariaLabel,
}: Props) {
  const autoId = useId();
  const inputId = idProp ?? autoId;
  const listboxId = `${inputId}-suggestions`;

  const containerRef = useRef<HTMLDivElement>(null);
  const blurTimerRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);

  const [focused, setFocused] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchError, setSearchError] = useState<string | null>(null);

  const inputCls = `w-full h-7 px-2 pr-7 text-[11px] rounded-md border bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-white/30 disabled:opacity-50 read-only:cursor-default read-only:opacity-100 ${className}`;

  useEffect(() => {
    if (!focused) setInputValue(value);
  }, [focused, value]);

  const clearBlurTimer = useCallback(() => {
    if (blurTimerRef.current != null) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }, []);

  const closeSuggestions = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const applyManualText = useCallback(
    (text: string) => {
      onChange({
        lodgingLabel: text,
        lodgingPlaceId: "",
        hotel: "",
        city: "",
      });
    },
    [onChange]
  );

  const selectSuggestion = useCallback(
    async (suggestion: PlaceSuggestion) => {
      closeSuggestions();
      setLoading(true);
      setSearchError(null);
      try {
        const details = await api.get<PlaceDetails | null>(
          `/api/venues/address-details?placeId=${encodeURIComponent(suggestion.placeId)}`
        );
        const name = details?.name?.trim() || suggestion.description.split(",")[0]?.trim() || suggestion.description;
        const city = details?.city?.trim() ?? "";
        const label = details?.formattedAddress
          ? details.name
            ? `${details.name}, ${details.formattedAddress}`
            : details.formattedAddress
          : suggestion.description;

        setInputValue(label);
        onChange({
          lodgingPlaceId: suggestion.placeId,
          lodgingLabel: label,
          hotel: name,
          city,
        });
      } catch {
        setInputValue(suggestion.description);
        onChange({
          lodgingPlaceId: suggestion.placeId,
          lodgingLabel: suggestion.description,
          hotel: suggestion.description.split(",")[0]?.trim() ?? suggestion.description,
          city: "",
        });
      } finally {
        setLoading(false);
      }
    },
    [closeSuggestions, onChange]
  );

  useEffect(() => {
    if (disabled || readOnly || !focused) {
      setSuggestions([]);
      setLoading(false);
      closeSuggestions();
      return;
    }

    const query = inputValue.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      setSearchError(null);
      closeSuggestions();
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setSearchError(null);

    const timer = window.setTimeout(() => {
      void fetchLodgingSuggestions(query, country)
        .then((data) => {
          if (requestId !== requestIdRef.current) return;
          setSuggestions(data);
          setOpen(true);
          setActiveIndex(-1);
          if (data.length === 0) {
            setSearchError("No places found — you can still type the name manually.");
          }
        })
        .catch((err: unknown) => {
          if (requestId !== requestIdRef.current) return;
          setSuggestions([]);
          closeSuggestions();
          if (isApiError(err) && (err.data as { code?: string } | undefined)?.code === "GOOGLE_MAPS_NOT_CONFIGURED") {
            setSearchError("Place search is not configured — type lodging manually.");
          }
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [closeSuggestions, country, disabled, focused, inputValue, readOnly]);

  useEffect(() => {
    return () => clearBlurTimer();
  }, [clearBlurTimer]);

  const showDropdown =
    open && focused && !readOnly && !disabled && (suggestions.length > 0 || loading || Boolean(searchError));
  const mapsUrl = placeId
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}&query_place_id=${encodeURIComponent(placeId)}`
    : value.trim()
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value.trim())}`
      : null;

  return (
    <div ref={containerRef} className="relative flex min-w-0 items-center gap-1">
      <div className="relative min-w-0 flex-1">
        <input
          id={inputId}
          type="text"
          value={inputValue}
          disabled={disabled}
          readOnly={readOnly}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            showDropdown && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          autoComplete="off"
          className={inputCls}
          onChange={(e) => {
            const text = e.target.value;
            setInputValue(text);
            applyManualText(text);
          }}
          onFocus={() => {
            clearBlurTimer();
            setFocused(true);
            if (suggestions.length > 0) setOpen(true);
          }}
          onBlur={() => {
            setFocused(false);
            clearBlurTimer();
            blurTimerRef.current = window.setTimeout(() => {
              closeSuggestions();
            }, 150);
          }}
          onKeyDown={(e) => {
            if (!showDropdown) return;

            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
              return;
            }

            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
              return;
            }

            if (e.key === "Enter" && activeIndex >= 0) {
              e.preventDefault();
              const suggestion = suggestions[activeIndex];
              if (suggestion) void selectSuggestion(suggestion);
              return;
            }

            if (e.key === "Escape") {
              e.preventDefault();
              closeSuggestions();
            }
          }}
        />
        {loading ? (
          <Loader2
            size={12}
            className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-white/35 pointer-events-none"
          />
        ) : (
          <MapPin
            size={12}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none"
          />
        )}

        {showDropdown ? (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-50 mt-1 max-h-56 w-full min-w-[14rem] overflow-auto rounded-md border border-white/10 bg-[#16161f] py-1 shadow-lg"
          >
            {loading && suggestions.length === 0 ? (
              <li className="px-3 py-2 text-sm text-white/45">Searching places…</li>
            ) : null}
            {!loading && searchError && suggestions.length === 0 ? (
              <li className="px-3 py-2 text-sm text-white/45">{searchError}</li>
            ) : null}
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.placeId}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`cursor-pointer px-3 py-2 text-sm text-white/85 hover:bg-white/10 ${
                  index === activeIndex ? "bg-white/10" : ""
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void selectSuggestion(suggestion);
                }}
              >
                {suggestion.description}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {mapsUrl && value.trim() ? (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-white/35 hover:text-white/70"
          title="Open in Google Maps"
          aria-label="Open in Google Maps"
        >
          <ExternalLink size={12} />
        </a>
      ) : null}
    </div>
  );
}
