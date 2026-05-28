import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { usePublicSiteLanguageOptional } from "@/contexts/PublicSiteLanguageContext";
import { getBrowserLanguage, type Language, type PreferencesPayload } from "@/lib/preferences";

/**
 * Language for public `/api/site-content` (query `?language=`).
 * Logged-in users: effective preference from account.
 * Guests: public site language (selector or browser).
 */
export function useSiteContentLanguage(): Language {
  const publicLang = usePublicSiteLanguageOptional();
  const { data: session } = useSession();
  const { data: prefs } = useQuery({
    queryKey: ["preferences"],
    queryFn: () => api.get<PreferencesPayload>("/api/preferences"),
    enabled: !!session?.user,
    retry: false,
  });
  if (session?.user && prefs?.effective?.language) {
    return prefs.effective.language;
  }
  return publicLang?.language ?? getBrowserLanguage();
}
