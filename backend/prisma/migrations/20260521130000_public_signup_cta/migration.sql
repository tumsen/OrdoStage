-- Public launch: point home CTA at self-serve signup.
UPDATE "SiteContent"
SET "value" = 'Get started free'
WHERE "key" = 'landing_cta_text' AND "locale" = 'en';

UPDATE "SiteContent"
SET "value" = '/signup'
WHERE "key" = 'landing_cta_url' AND "locale" = 'en';

UPDATE "SiteContent"
SET "value" = '0'
WHERE "key" = 'public_early_bird_landing';
