import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAdminI18n } from "@/lib/i18n";
import { SUPPORTED_LANGUAGES, type Language, languageLabel } from "@/lib/preferences";
import { isPublicFlagOn } from "@/lib/publicSiteFlags";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SiteContent = Record<string, string>;

export default function SiteContentAdmin() {
  const { toast } = useToast();
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const [contentLanguage, setContentLanguage] = useState<Language>("en");
  const [form, setForm] = useState<SiteContent>({});

  useEffect(() => {
    setForm({});
  }, [contentLanguage]);

  const { data } = useQuery({
    queryKey: ["admin", "site-content", contentLanguage],
    queryFn: () =>
      api.get<SiteContent>(`/api/admin/site-content?language=${encodeURIComponent(contentLanguage)}`),
  });

  const merged = { ...(data ?? {}), ...form };

  const updateMutation = useMutation({
    mutationFn: (payload: SiteContent) =>
      api.put<SiteContent>(
        `/api/admin/site-content?language=${encodeURIComponent(contentLanguage)}`,
        payload
      ),
    onSuccess: () => {
      setForm({});
      queryClient.invalidateQueries({ queryKey: ["admin", "site-content"] });
      queryClient.invalidateQueries({ queryKey: ["site-content"] });
      queryClient.invalidateQueries({ queryKey: ["site-content-public"] });
      toast({ title: t("admin.siteContent.saved") });
    },
    onError: () => {
      toast({ title: t("admin.siteContent.saveError"), variant: "destructive" });
    },
  });

  const { data: enSnapshot } = useQuery({
    queryKey: ["admin", "site-content", "en"],
    queryFn: () => api.get<SiteContent>("/api/admin/site-content?language=en"),
  });

  const flagMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api.put<SiteContent>(`/api/admin/site-content?language=${encodeURIComponent("en")}`, { [key]: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "site-content"] });
      queryClient.invalidateQueries({ queryKey: ["site-content"] });
      queryClient.invalidateQueries({ queryKey: ["site-content-public"] });
    },
    onError: () => {
      toast({ title: t("admin.siteContent.flagSaveError"), variant: "destructive" });
    },
  });

  function setField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <h2 className="text-lg font-semibold text-white">{t("admin.siteContent.title")}</h2>
      <p className="text-sm text-white/50">{t("admin.siteContent.subtitle")}</p>

      <div className="rounded-lg border border-ordo-magenta/30 bg-[#0d0d18] p-4 space-y-4 max-w-2xl">
        <div>
          <h3 className="text-sm font-semibold text-white">{t("admin.siteContent.publicHomeMode")}</h3>
          <p className="text-xs text-white/50 mt-1">{t("admin.siteContent.publicHomeModeHint")}</p>
        </div>
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <Label className="text-white/90">{t("admin.siteContent.maintenanceMode")}</Label>
            <p className="text-xs text-white/45 mt-0.5">{t("admin.siteContent.maintenanceModeHint")}</p>
          </div>
          <Switch
            checked={isPublicFlagOn(enSnapshot?.public_maintenance_mode, false)}
            disabled={flagMutation.isPending || enSnapshot === undefined}
            onCheckedChange={(on) => {
              flagMutation.mutate({ key: "public_maintenance_mode", value: on ? "1" : "0" });
            }}
            aria-label={t("admin.siteContent.maintenanceMode")}
          />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <Label className="text-white/90">{t("admin.siteContent.earlyBirdMode")}</Label>
            <p className="text-xs text-white/45 mt-0.5">{t("admin.siteContent.earlyBirdModeHint")}</p>
          </div>
          <Switch
            checked={isPublicFlagOn(enSnapshot?.public_early_bird_landing, true)}
            disabled={flagMutation.isPending || enSnapshot === undefined}
            onCheckedChange={(on) => {
              flagMutation.mutate({ key: "public_early_bird_landing", value: on ? "1" : "0" });
            }}
            aria-label={t("admin.siteContent.earlyBirdMode")}
          />
        </div>
        <p className="text-[11px] text-ordo-yellow/80">
          Paddle: use the live home (both off) for the shortest path to Pricing and sign-up. Maintenance mode keeps the
          same sidebar; the main area is a short notice plus a Features section.
        </p>
      </div>

      <div className="rounded-lg border border-ordo-yellow/25 bg-ordo-violet/10 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">{t("admin.siteContent.sectionTranslations")}</h3>
        <p className="text-xs text-white/50">{t("admin.siteContent.editLocaleHint")}</p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 max-w-md">
          <Label htmlFor="content-language" className="text-white/80 shrink-0">
            {t("admin.siteContent.contentLanguage")}
          </Label>
          <Select
            value={contentLanguage}
            onValueChange={(v) => setContentLanguage(v as Language)}
            aria-label={t("admin.siteContent.contentLanguage")}
          >
            <SelectTrigger id="content-language" className="bg-gray-900/80 border-white/10 text-white w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <SelectItem key={lang} value={lang}>
                  {languageLabel(lang)} ({lang})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {contentLanguage === "en" ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">Signup &amp; public pricing copy</h3>
          <p className="text-xs text-white/45">
            These values appear on the public home and pricing pages. New organisations receive the free credit amount
            when they are first created (after this number is saved).
          </p>
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="signup_credits">Free signup credits</Label>
            <Input
              id="signup_credits"
              type="number"
              min={0}
              step={1}
              value={merged.signup_credits ?? ""}
              placeholder="30"
              onChange={(e) => setField("signup_credits", e.target.value)}
              className="bg-gray-900/80 border-white/10"
            />
            <p className="text-xs text-white/35">
              Credit packs and prices are edited under <span className="text-white/55">Owner Admin → Pricing</span>;
              the public /pricing page loads active packs automatically.
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-white/45 max-w-2xl">{t("admin.siteContent.creditsEnOnly")}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Landing Title</Label>
          <p className="text-xs text-white/40">Leave empty to use the default home page headline.</p>
          <Input value={merged.landing_title ?? ""} onChange={(e) => setField("landing_title", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Landing CTA Text</Label>
          <Input
            value={merged.landing_cta_text ?? ""}
            onChange={(e) => setField("landing_cta_text", e.target.value)}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Landing Subtitle</Label>
          <p className="text-xs text-white/40">Leave empty to use the default hero paragraph under the headline.</p>
          <Textarea
            value={merged.landing_subtitle ?? ""}
            onChange={(e) => setField("landing_subtitle", e.target.value)}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Landing CTA URL</Label>
          <Input value={merged.landing_cta_url ?? ""} onChange={(e) => setField("landing_cta_url", e.target.value)} />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-4">
        <h3 className="text-sm font-semibold text-white">Company &amp; legal contact</h3>
        <p className="text-xs text-white/45">
          Optional structured fields for reference, marketing, or future pages. Legal pages below still control the
          exact text visitors see unless you align these values with your Terms / Privacy bodies.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Product / brand name</Label>
            <Input
              placeholder="Ordo Stage"
              value={merged.company_brand ?? ""}
              onChange={(e) => setField("company_brand", e.target.value)}
              className="bg-gray-900/80 border-white/10"
            />
          </div>
          <div className="space-y-2">
            <Label>Legal entity</Label>
            <Input
              placeholder="Schwifty"
              value={merged.company_entity ?? ""}
              onChange={(e) => setField("company_entity", e.target.value)}
              className="bg-gray-900/80 border-white/10"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Address</Label>
            <Input
              placeholder="Strandgade 1, 5700 Svendborg, Denmark"
              value={merged.company_address ?? ""}
              onChange={(e) => setField("company_address", e.target.value)}
              className="bg-gray-900/80 border-white/10"
            />
          </div>
          <div className="space-y-2">
            <Label>VAT number</Label>
            <Input
              placeholder="DK28625383"
              value={merged.company_vat ?? ""}
              onChange={(e) => setField("company_vat", e.target.value)}
              className="bg-gray-900/80 border-white/10"
            />
          </div>
          <div className="space-y-2">
            <Label>Contact email</Label>
            <Input
              type="email"
              placeholder="mail@ordostage.com"
              value={merged.company_email ?? ""}
              onChange={(e) => setField("company_email", e.target.value)}
              className="bg-gray-900/80 border-white/10"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Terms of Service</Label>
        <p className="text-xs text-white/40">Full text shown on /terms-of-service.</p>
        <Textarea
          className="min-h-48"
          value={merged.terms_content ?? ""}
          onChange={(e) => setField("terms_content", e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Privacy Policy</Label>
        <p className="text-xs text-white/40">Full text shown on /privacy-policy.</p>
        <Textarea
          className="min-h-48"
          value={merged.privacy_content ?? ""}
          onChange={(e) => setField("privacy_content", e.target.value)}
        />
      </div>

      <Button
        onClick={() => updateMutation.mutate(merged)}
        disabled={updateMutation.isPending}
        className="bg-rose-700 hover:bg-rose-600"
      >
        {updateMutation.isPending ? t("admin.siteContent.saving") : t("admin.siteContent.save")}
      </Button>
    </div>
  );
}
