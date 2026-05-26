-- Public home: use marketing page (not early-bird rollout).
UPDATE "SiteContent"
SET "value" = '0'
WHERE "key" = 'public_early_bird_landing';

UPDATE "SiteContent"
SET "value" = ''
WHERE "key" = 'landing_postscript'
  AND "value" LIKE '%private rollout%';
