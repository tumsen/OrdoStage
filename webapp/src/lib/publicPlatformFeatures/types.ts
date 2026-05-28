import type { OrdoAccent } from "@/lib/roleAccentStyles";

export type PlatformFeatureArea = {
  title: string;
  summary: string;
  body: string;
  bullets: readonly string[];
  accent: OrdoAccent;
};
