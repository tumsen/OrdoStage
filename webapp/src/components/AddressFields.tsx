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
}

const fieldCls =
  "w-full h-9 px-3 text-sm rounded-md border bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-white/30 disabled:opacity-50";

/**
 * Structured address fields (Street, Number, ZIP, City, State/Region, Country).
 */
export function AddressFields({ value, onChange, disabled = false }: Props) {
  function set(field: keyof Address, v: string) {
    onChange({ ...value, [field]: v });
  }

  return (
    <div className="space-y-3">
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
