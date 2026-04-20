import { useRef, useState, useEffect } from "react";
import { MapPin } from "lucide-react";
import { api } from "@/lib/api";

interface Prediction {
  placeId: string;
  description: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Input element style variant — "default" uses a light form input, "dark" uses the app's dark style */
  variant?: "default" | "dark";
}

/**
 * Address text input with Google Maps Places autocomplete dropdown.
 * Falls back to a plain input when the backend has no GOOGLE_MAPS_API_KEY configured.
 */
export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Search address…",
  className = "",
  disabled = false,
  variant = "dark",
}: Props) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  function search(query: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 3) {
      setPredictions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await api.get<Prediction[]>(
          `/api/venues/address-search?q=${encodeURIComponent(query)}`
        );
        setPredictions(results ?? []);
        setOpen((results ?? []).length > 0);
      } catch {
        setPredictions([]);
      }
    }, 300);
  }

  const inputCls =
    variant === "dark"
      ? `w-full h-9 px-3 pr-8 text-sm rounded-md border bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-white/30 disabled:opacity-50 ${className}`
      : `w-full h-9 px-3 pr-8 text-sm rounded-md border bg-gray-800 border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50 ${className}`;

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        className={inputCls}
        onChange={(e) => {
          onChange(e.target.value);
          search(e.target.value);
        }}
        onFocus={() => {
          if (predictions.length > 0) setOpen(true);
        }}
      />
      <MapPin
        size={14}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none"
      />

      {open && predictions.length > 0 ? (
        <ul className="absolute z-50 mt-1 w-full rounded-lg border border-white/10 bg-[#16161f] shadow-xl overflow-hidden">
          {predictions.slice(0, 6).map((p) => (
            <li key={p.placeId}>
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(p.description);
                  setOpen(false);
                  setPredictions([]);
                }}
              >
                <MapPin size={12} className="text-white/30 flex-shrink-0" />
                {p.description}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
