import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type SiteContent = Record<string, string>;

export default function Frontpage() {
  const { data } = useQuery({
    queryKey: ["site-content"],
    queryFn: () => api.get<SiteContent>("/api/site-content"),
  });

  const title = data?.landing_title ?? "OrdoStage for Theaters";
  const subtitle =
    data?.landing_subtitle ??
    "Plan productions, coordinate teams, and run tours from one platform.";
  const ctaText = data?.landing_cta_text ?? "Get Started";
  const ctaUrl = data?.landing_cta_url ?? "/login";

  return (
    <div className="text-white">
      <div className="max-w-6xl mx-auto px-6 py-16 md:py-20">
        <div className="max-w-3xl">
          <h1 className="text-5xl font-bold leading-tight">{title}</h1>
          <p className="mt-5 text-lg text-white/70">{subtitle}</p>
          <div className="mt-8 flex items-center gap-3">
            <Button asChild className="bg-rose-700 hover:bg-rose-600">
              <Link to={ctaUrl}>{ctaText}</Link>
            </Button>
            <Button asChild variant="outline" className="border-white/20 text-white bg-transparent">
              <Link to="/pricing">View Pricing</Link>
            </Button>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-white/[0.03] border-white/10">
            <CardContent className="p-5">
              <h3 className="font-semibold">Production Planning</h3>
              <p className="mt-2 text-sm text-white/60">Run events, tours, and schedules in one view.</p>
            </CardContent>
          </Card>
          <Card className="bg-white/[0.03] border-white/10">
            <CardContent className="p-5">
              <h3 className="font-semibold">Team Operations</h3>
              <p className="mt-2 text-sm text-white/60">Manage people, teams, and support workflows.</p>
            </CardContent>
          </Card>
          <Card className="bg-white/[0.03] border-white/10">
            <CardContent className="p-5">
              <h3 className="font-semibold">Credit-Based Billing</h3>
              <p className="mt-2 text-sm text-white/60">Flexible pay-as-you-go model built for theaters.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
