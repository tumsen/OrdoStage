import { api } from "@/lib/api";

export type OrgCompanyProfile = {
  name: string;
  invoiceName: string | null;
  invoiceEmail: string | null;
  invoicePhone: string | null;
  hasCompanyLogo?: boolean;
  logoDataUrl?: string | null;
};

async function fetchCompanyLogoDataUrl(): Promise<string | null> {
  const baseUrl = import.meta.env.VITE_BACKEND_URL || "";
  const resp = await fetch(`${baseUrl}/api/org/company-logo`, { credentials: "include" });
  if (!resp.ok) return null;
  const blob = await resp.blob();
  if (!blob.type.startsWith("image/")) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${blob.type};base64,${btoa(binary)}`;
}

export async function fetchOrgCompanyProfileForReports(): Promise<OrgCompanyProfile | null> {
  const info = await api.get<{
    name: string;
    invoiceName: string | null;
    invoiceEmail: string | null;
    invoicePhone: string | null;
    hasCompanyLogo?: boolean;
  }>("/api/org/invoice-info");
  const logoDataUrl = info.hasCompanyLogo ? await fetchCompanyLogoDataUrl() : null;
  return {
    name: info.name,
    invoiceName: info.invoiceName,
    invoiceEmail: info.invoiceEmail,
    invoicePhone: info.invoicePhone,
    hasCompanyLogo: info.hasCompanyLogo,
    logoDataUrl,
  };
}
