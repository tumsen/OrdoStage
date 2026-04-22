import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { SUPPORTED_LANGUAGES, type Language } from "@/lib/preferences";

const STORAGE_KEY = "ordostage_admin_panel_language";

type Ctx = {
  language: Language;
  setLanguage: (lang: Language) => void;
};

const AdminPanelLanguageContext = createContext<Ctx | null>(null);

function readStoredLanguage(): Language {
  if (typeof window === "undefined") return "en";
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw && SUPPORTED_LANGUAGES.includes(raw as Language)) return raw as Language;
  return "en";
}

export function AdminPanelLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => readStoredLanguage());

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);

  return <AdminPanelLanguageContext.Provider value={value}>{children}</AdminPanelLanguageContext.Provider>;
}

export function useAdminPanelLanguage(): Ctx {
  const ctx = useContext(AdminPanelLanguageContext);
  if (!ctx) {
    throw new Error("useAdminPanelLanguage must be used within AdminPanelLanguageProvider");
  }
  return ctx;
}
