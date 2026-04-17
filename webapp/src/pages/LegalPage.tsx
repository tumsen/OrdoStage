import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type SiteContent = Record<string, string>;

const mapByPath: Record<string, { title: string; key: string }> = {
  "/terms-of-service": { title: "Terms of Service", key: "terms_content" },
  "/privacy-policy": { title: "Privacy Policy", key: "privacy_content" },
  "/refund-policy": { title: "Refund Policy", key: "refund_content" },
};

export default function LegalPage() {
  const location = useLocation();
  const config = mapByPath[location.pathname] ?? mapByPath["/terms-of-service"];

  const { data } = useQuery({
    queryKey: ["site-content"],
    queryFn: () => api.get<SiteContent>("/api/site-content"),
  });

  const text = data?.[config.key] ?? "";

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-3xl mx-auto px-6 py-14">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">{config.title}</h1>
          <Link to="/" className="text-white/70 hover:text-white text-sm">Back</Link>
        </div>
        <article className="rounded-lg border border-white/10 bg-white/[0.02] p-6">
          <pre className="whitespace-pre-wrap text-sm leading-7 text-white/80 font-sans">{text}</pre>
        </article>
      </div>
    </div>
  );
}
