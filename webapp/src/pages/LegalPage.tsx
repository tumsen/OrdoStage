import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSiteContentLanguage } from "@/hooks/useSiteContentLanguage";

type SiteContent = Record<string, string>;

const mapByPath: Record<string, { title: string; key: string }> = {
  "/terms-of-service": { title: "Terms of Service", key: "terms_content" },
  "/privacy-policy": { title: "Privacy Policy", key: "privacy_content" },
  "/refund-policy": { title: "Refund Policy", key: "refund_content" },
};

export default function LegalPage() {
  const location = useLocation();
  const siteLang = useSiteContentLanguage();
  const config = mapByPath[location.pathname] ?? mapByPath["/terms-of-service"];

  const { data } = useQuery({
    queryKey: ["site-content", siteLang],
    queryFn: () => api.get<SiteContent>(`/api/site-content?language=${encodeURIComponent(siteLang)}`),
  });

  const text = data?.[config.key] ?? "";
  const termsDeletionNotice =
    "No credit card is required to start. If you decide not to continue, you can simply stop paying. Accounts with an unpaid negative balance for 30 days may be permanently deleted, including associated organization data.";
  const renderedText =
    config.key === "terms_content" && !text.includes(termsDeletionNotice)
      ? `${text}\n\n9. Negative balance and service deletion\n${termsDeletionNotice}`
      : text;

  return (
    <div className="text-white">
      <div className="w-full px-6 py-10 md:py-14">
        <h1 className="sr-only">{config.title}</h1>
        <article className="rounded-lg border border-white/10 bg-white/[0.02] p-6">
          <pre className="whitespace-pre-wrap text-sm leading-7 text-white/80 font-sans">{renderedText}</pre>
        </article>
      </div>
    </div>
  );
}
