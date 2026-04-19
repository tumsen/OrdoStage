import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PublicNav } from "@/components/PublicNav";

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
    <div className="text-white">
      <PublicNav />
      <div className="max-w-3xl mx-auto px-6 py-10 md:py-14">
        <h1 className="sr-only">{config.title}</h1>
        <article className="rounded-lg border border-white/10 bg-white/[0.02] p-6">
          <pre className="whitespace-pre-wrap text-sm leading-7 text-white/80 font-sans">{text}</pre>
        </article>
      </div>
    </div>
  );
}
