export type PublicRoleFeatureSection = {
  heading: string;
  body?: string;
  bullets: readonly string[];
};

export type PublicRoleFeature = {
  slug: string;
  title: string;
  intro: string;
  heroLead: string;
  sections: readonly PublicRoleFeatureSection[];
  relatedSlugs: readonly string[];
};
