import { MapPin } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Input element style variant — "default" uses a light form input, "dark" uses the app's dark style */
  variant?: "default" | "dark";
}

/** Plain address text input (manual entry). */
export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Search address…",
  className = "",
  disabled = false,
  variant = "dark",
}: Props) {
  const hint = "";

  const inputCls =
    variant === "dark"
      ? `w-full h-9 px-3 pr-8 text-sm rounded-md border bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-white/30 disabled:opacity-50 ${className}`
      : `w-full h-9 px-3 pr-8 text-sm rounded-md border bg-gray-800 border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 disabled:opacity-50 ${className}`;

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        className={inputCls}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onFocus={() => {
          /* no-op */
        }}
      />
      <MapPin
        size={14}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none"
      />

      {hint ? <p className="mt-1 text-[11px] text-white/45">{hint}</p> : null}
    </div>
  );
}
