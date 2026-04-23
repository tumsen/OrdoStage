import { useRef, useState, useEffect } from "react";
import { MapPin, Search } from "lucide-react";
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

interface Prediction {
  placeId: string;
  description: string;
}

interface AddressDetails {
  street: string;
  number: string;
  zip: string;
  city: string;
  state: string;
  country: string;
}

interface Props {
  value: Address;
  onChange: (value: Address) => void;
  disabled?: boolean;
}

const fieldCls =
  "w-full h-9 px-3 text-sm rounded-md border bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-white/30 disabled:opacity-50";

/**
 * Structured address fields (Street, Number, ZIP, City, State/Region, Country)
 * with an optional Google Maps search bar at the top to auto-fill all fields.
 */
export function AddressFields({ value, onChange, disabled = false }: Props) {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchStatus, setSearchStatus] = useState<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  function search(q: string) {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 3) {
      setPredictions([]);
      setOpen(false);
      setSearchStatus("");
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await api.get<Prediction[]>(
          `/api/venues/address-search?q=${encodeURIComponent(q)}`
        );
        setPredictions(results ?? []);
        setOpen((results ?? []).length > 0);
        setSearchStatus(
          (results ?? []).length === 0
            ? "No address suggestions found."
            : ""
        );
      } catch {
        setPredictions([]);
        setOpen(false);
        setSearchStatus(
          "Google Maps search is not configured yet. You can still type the address manually."
        );
      }
    }, 300);
  }

  async function selectPrediction(placeId: string, description: string) {
    setQuery(description);
    setOpen(false);
    setPredictions([]);
    setLoading(true);
    try {
      const details = await api.get<AddressDetails | null>(
        `/api/venues/address-details?placeId=${encodeURIComponent(placeId)}`
      );
      if (details) {
        onChange({
          street:  details.street  || value.street,
          number:  details.number  || value.number,
          zip:     details.zip     || value.zip,
          city:    details.city    || value.city,
          state:   details.state   || value.state,
          country: details.country || value.country,
        });
      }
      setSearchStatus("");
    } catch (e) {
      setSearchStatus(
        isApiError(e)
          ? e.message
          : "Could not fetch address details. You can fill fields manually."
      );
    } finally {
      setLoading(false);
      setQuery("");
    }
  }

  function set(field: keyof Address, v: string) {
    onChange({ ...value, [field]: v });
  }

  return (
    <div className="space-y-3">
      {/* Google search bar */}
      <div ref={dropdownRef} className="relative">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none"
          />
          <input
            type="text"
            value={query}
            disabled={disabled || loading}
            placeholder="Search address with Google Maps…"
            className={`${fieldCls} pl-8 pr-8`}
            onChange={(e) => search(e.target.value)}
            onFocus={() => { if (predictions.length > 0) setOpen(true); }}
          />
          <MapPin
            size={14}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none"
          />
        </div>

        {open && predictions.length > 0 ? (
          <ul className="absolute z-50 mt-1 w-full rounded-lg border border-white/10 bg-[#16161f] shadow-xl overflow-hidden">
            {predictions.slice(0, 6).map((p) => (
              <li key={p.placeId}>
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectPrediction(p.placeId, p.description);
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
      {searchStatus ? (
        <p className="text-[11px] text-white/45">{searchStatus}</p>
      ) : null}

      {/* Structured fields */}
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
export function formatAddress(addr: Partial<Address> | null | undefined): string {
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
