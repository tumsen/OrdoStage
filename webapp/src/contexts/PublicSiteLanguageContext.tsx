import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { getBrowserLanguage, SUPPORTED_LANGUAGES, type Language } from "@/lib/preferences";

const STORAGE_KEY = "ordostage_public_language";

type Ctx = {
  language: Language;
  setLanguage: (lang: Language) => void;
};

const PublicSiteLanguageContext = createContext<Ctx | null>(null);

function readStoredLanguage(): Language | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw && SUPPORTED_LANGUAGES.includes(raw as Language)) return raw as Language;
  return null;
}

export function PublicSiteLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => readStoredLanguage() ?? getBrowserLanguage());

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);

  return <PublicSiteLanguageContext.Provider value={value}>{children}</PublicSiteLanguageContext.Provider>;
}

export function usePublicSiteLanguage(): Ctx {
  const ctx = useContext(PublicSiteLanguageContext);
  if (!ctx) {
    throw new Error("usePublicSiteLanguage must be used within PublicSiteLanguageProvider");
  }
  return ctx;
}

/** Safe when provider is optional (e.g. hooks used outside public shell). */
export function usePublicSiteLanguageOptional(): Ctx | null {
  return useContext(PublicSiteLanguageContext);
}
