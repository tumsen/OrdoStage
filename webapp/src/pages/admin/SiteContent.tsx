import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useAutoSaveDraft } from "@/hooks/useAutoSaveDraft";
import { AutoSaveStatus } from "@/components/AutoSaveStatus";
import { useAdminI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
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

function fitTextareaToContent(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function CollapsibleLegalEditor({
  title,
  hint,
  value,
  onChange,
}: {
  title: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmed = value.trim();
  const lineCount = trimmed ? trimmed.split("\n").length : 0;
  const previewLine = trimmed.split("\n").find((line) => line.trim())?.trim() ?? "";

  useLayoutEffect(() => {
    if (!open) return;
    fitTextareaToContent(textareaRef.current);
  }, [value, open]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-white/10 bg-white/[0.02]">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-start gap-2 rounded-lg p-4 text-left hover:bg-white/[0.03] transition-colors"
        >
          <ChevronDown
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 text-white/40 transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
          <div className="min-w-0 flex-1 space-y-1">
            <span className="text-sm font-semibold text-white">{title}</span>
            <p className="text-xs text-white/45">{hint}</p>
            {!open ? (
              <p className="text-[11px] text-white/35 truncate">
                {previewLine || "(empty)"}
                {lineCount > 0 ? ` · ${lineCount} ${lineCount === 1 ? "line" : "lines"}` : ""}
              </p>
            ) : null}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 data-[state=closed]:animate-out">
        <Textarea
          ref={textareaRef}
          className="min-h-[4.5rem] resize-none overflow-hidden bg-gray-900/80 border-white/10 text-sm leading-relaxed"
          rows={1}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            fitTextareaToContent(e.target);
          }}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

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

  const contentAutoSave = useAutoSaveDraft({
    enabled: Object.keys(form).length > 0,
    resetKey: contentLanguage,
    getSnapshot: () => form,
    save: async () => {
      await updateMutation.mutateAsync(merged);
    },
  });

  return (
    <div className="p-6 space-y-4" onBlurCapture={contentAutoSave.onBlurCapture}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{t("admin.siteContent.title")}</h2>
          <p className="text-sm text-white/50">{t("admin.siteContent.subtitle")}</p>
        </div>
        <AutoSaveStatus status={contentAutoSave.status} error={contentAutoSave.error} />
      </div>

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
          <h3 className="text-sm font-semibold text-white">Public pricing copy</h3>
          <p className="text-xs text-white/45">
            These values appear on the public home and pricing pages.
          </p>
          <p className="text-xs text-white/35">
            Default billing model and rates are configured under <span className="text-white/55">Owner Admin → Pricing</span>.
          </p>
        </div>
      ) : (
        <p className="text-xs text-white/45 max-w-2xl">Billing defaults are configured in Owner Admin → Pricing.</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Landing title (brand)</Label>
          <p className="text-xs text-white/40">Usually OrdoStage — leave empty to use the default.</p>
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
          <Label>Landing tagline</Label>
          <p className="text-xs text-white/40">One line under the title (e.g. operating platform for…).</p>
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

      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 space-y-4 max-w-4xl">
        <h3 className="text-sm font-semibold text-white">Home page — main story</h3>
        <p className="text-xs text-white/45">Shown on the public home: hero, then the #features block (headline, body, closing). Postscript is mainly for early-bird / rollout (optional).</p>
        <div className="space-y-2">
          <Label>Lead paragraph</Label>
          <Textarea
            className="min-h-[80px] bg-gray-900/80 border-white/10"
            value={merged.landing_lead ?? ""}
            onChange={(e) => setField("landing_lead", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Section headline (#features)</Label>
          <Input
            className="bg-gray-900/80 border-white/10"
            value={merged.landing_section_heading ?? ""}
            onChange={(e) => setField("landing_section_heading", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Section body</Label>
          <Textarea
            className="min-h-[100px] bg-gray-900/80 border-white/10"
            value={merged.landing_section_body ?? ""}
            onChange={(e) => setField("landing_section_body", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Closing line</Label>
          <Textarea
            className="min-h-[64px] bg-gray-900/80 border-white/10"
            value={merged.landing_closing ?? ""}
            onChange={(e) => setField("landing_closing", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Postscript (early-bird; leave empty to hide on translated locales if you clear it)</Label>
          <Textarea
            className="min-h-[72px] bg-gray-900/80 border-white/10"
            value={merged.landing_postscript ?? ""}
            onChange={(e) => setField("landing_postscript", e.target.value)}
            placeholder="Rollout and contact lines…"
          />
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

      <div className="max-w-4xl space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Legal pages</h3>
          <p className="text-xs text-white/45 mt-1">
            Full text shown on public legal routes. Collapsed by default — expand to edit.
          </p>
        </div>
        <CollapsibleLegalEditor
          title="Terms of Service"
          hint="Shown on /terms-of-service"
          value={merged.terms_content ?? ""}
          onChange={(v) => setField("terms_content", v)}
        />
        <CollapsibleLegalEditor
          title="Privacy Policy"
          hint="Shown on /privacy-policy"
          value={merged.privacy_content ?? ""}
          onChange={(v) => setField("privacy_content", v)}
        />
      </div>

    </div>
  );
}
