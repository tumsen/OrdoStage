import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type SiteContent = Record<string, string>;

export default function SiteContentAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin", "site-content"],
    queryFn: () => api.get<SiteContent>("/api/admin/site-content"),
  });

  const [form, setForm] = useState<SiteContent>({});

  const merged = { ...(data ?? {}), ...form };

  const updateMutation = useMutation({
    mutationFn: (payload: SiteContent) => api.put<SiteContent>("/api/admin/site-content", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "site-content"] });
      queryClient.invalidateQueries({ queryKey: ["site-content"] });
      toast({ title: "Saved", description: "Website content updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save website content.", variant: "destructive" });
    },
  });

  function setField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <h2 className="text-lg font-semibold text-white">Website Content</h2>
      <p className="text-sm text-white/50">
        Edit landing page and legal texts used on public pages.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Landing Title</Label>
          <p className="text-xs text-white/40">Leave empty to use the default home page headline.</p>
          <Input value={merged.landing_title ?? ""} onChange={(e) => setField("landing_title", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Landing CTA Text</Label>
          <Input value={merged.landing_cta_text ?? ""} onChange={(e) => setField("landing_cta_text", e.target.value)} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Landing Subtitle</Label>
          <p className="text-xs text-white/40">Leave empty to use the default hero paragraph under the headline.</p>
          <Textarea value={merged.landing_subtitle ?? ""} onChange={(e) => setField("landing_subtitle", e.target.value)} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Landing CTA URL</Label>
          <Input value={merged.landing_cta_url ?? ""} onChange={(e) => setField("landing_cta_url", e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Terms of Service</Label>
        <Textarea className="min-h-48" value={merged.terms_content ?? ""} onChange={(e) => setField("terms_content", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Privacy Policy</Label>
        <Textarea className="min-h-48" value={merged.privacy_content ?? ""} onChange={(e) => setField("privacy_content", e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Refund Policy</Label>
        <Textarea className="min-h-48" value={merged.refund_content ?? ""} onChange={(e) => setField("refund_content", e.target.value)} />
      </div>

      <Button
        onClick={() => updateMutation.mutate(merged)}
        disabled={updateMutation.isPending}
        className="bg-rose-700 hover:bg-rose-600"
      >
        {updateMutation.isPending ? "Saving..." : "Save Website Content"}
      </Button>
    </div>
  );
}
