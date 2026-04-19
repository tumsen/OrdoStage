import { Link } from "react-router-dom";
import { OrdoStageLogo } from "@/components/OrdoStageLogo";

/**
 * Simple public navigation bar used on all marketing/auth pages.
 * Shows brand and links to home, pricing, and login.
 */
export function PublicNav() {
  return (
    <header className="sticky top-0 z-30 bg-[#030712]/90 backdrop-blur border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <Link to="/" className="inline-flex items-center gap-3 text-white hover:text-white/80">
          <OrdoStageLogo size={36} />
          <span className="text-base font-semibold">Ordo Stage</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/" className="text-white/80 hover:text-white">
            Home
          </Link>
          <Link to="/pricing" className="text-white/80 hover:text-white">
            Pricing
          </Link>
          <Link
            to="/login"
            className="px-3 py-1.5 rounded-md bg-ordo-magenta text-white hover:bg-ordo-magenta/90 transition-colors text-sm font-medium"
          >
            Login
          </Link>
        </nav>
      </div>
    </header>
  );
}
