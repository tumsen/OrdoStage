import { Link } from "react-router-dom";

const NotFound = () => {
  return (
    <div className="flex min-h-[min(70vh,520px)] items-center justify-center px-6 py-16">
      <div className="text-center max-w-md">
        <p className="text-xs font-semibold uppercase tracking-widest text-ordo-magenta mb-2">Error</p>
        <h1 className="mb-3 text-4xl font-bold text-white">404</h1>
        <p className="mb-6 text-lg text-white/55">This page doesn&apos;t exist.</p>
        <Link to="/" className="text-ordo-yellow underline underline-offset-2 hover:text-white">
          Return to home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
