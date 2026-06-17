import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";

import { api } from "@/lib/api";

type AddressSuggestion = {
  placeId: string;
  description: string;
};

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** Input element style variant — "default" uses a light form input, "dark" uses the app's dark style */
  variant?: "default" | "dark";
  /** ISO 3166-1 alpha-2 country bias, e.g. "dk" */
  country?: string;
  /** Google Places types, e.g. "geocode". Omit for broad results. */
  types?: string;
  id?: string;
  "aria-label"?: string;
}

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 250;

export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Søg adresse…",
  className = "",
  disabled = false,
  readOnly = false,
  variant = "dark",
  country,
  types,
  id: idProp,
  "aria-label": ariaLabel,
}: Props) {
  const autoId = useId();
  const inputId = idProp ?? autoId;
  const listboxId = `${inputId}-suggestions`;

  const containerRef = useRef<HTMLDivElement>(null);
  const blurTimerRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputCls =
    variant === "dark"
      ? `w-full h-9 px-3 pr-8 text-sm rounded-md border bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-white/30 disabled:opacity-50 read-only:cursor-default read-only:opacity-100 ${className}`
      : `w-full h-9 px-3 pr-8 text-sm rounded-md border bg-gray-800 border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50 read-only:cursor-default read-only:opacity-100 ${className}`;

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

  const selectSuggestion = useCallback(
    (suggestion: AddressSuggestion) => {
      onChange(suggestion.description);
      setSuggestions([]);
      closeSuggestions();
    },
    [closeSuggestions, onChange]
  );

  useEffect(() => {
    if (disabled || readOnly) {
      setSuggestions([]);
      closeSuggestions();
      return;
    }

    const query = value.trim();
    if (query.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      closeSuggestions();
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query });
      if (country) params.set("country", country);
      if (types) params.set("types", types);

      void api
        .get<AddressSuggestion[]>(`/api/venues/address-search?${params.toString()}`)
        .then((data) => {
          if (requestId !== requestIdRef.current) return;
          setSuggestions(data);
          setOpen(data.length > 0);
          setActiveIndex(-1);
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) return;
          setSuggestions([]);
          closeSuggestions();
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [closeSuggestions, country, disabled, readOnly, types, value]);

  useEffect(() => {
    return () => clearBlurTimer();
  }, [clearBlurTimer]);

  const showDropdown = open && !readOnly && !disabled && (suggestions.length > 0 || loading);

  return (
    <div ref={containerRef} className="relative">
      <input
        id={inputId}
        type="text"
        value={value}
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
          onChange(e.target.value);
        }}
        onFocus={() => {
          clearBlurTimer();
          if (suggestions.length > 0) setOpen(true);
        }}
        onBlur={() => {
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
            if (suggestion) selectSuggestion(suggestion);
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
          size={14}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-white/35 pointer-events-none"
        />
      ) : (
        <MapPin
          size={14}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none"
        />
      )}

      {showDropdown ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-white/10 bg-[#16161f] py-1 shadow-lg"
        >
          {loading && suggestions.length === 0 ? (
            <li className="px-3 py-2 text-sm text-white/45">Søger adresser…</li>
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
                selectSuggestion(suggestion);
              }}
            >
              {suggestion.description}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
