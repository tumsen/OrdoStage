-- Squash duplicate credential Account rows into one per user.
-- Duplicates (e.g. provisioned invite row + password reset row) cause sign-in
-- to pick a stale hash via accounts.find(), returning INVALID_EMAIL_OR_PASSWORD
-- even after a successful password reset.
--
-- Strategy: for each user with >1 credential row, keep the row with the most
-- recent updatedAt that has a non-null password hash; delete the rest.

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT "userId"
    FROM "Account"
    WHERE "providerId" = 'credential'
    GROUP BY "userId"
    HAVING count(*) > 1
  LOOP
    -- Delete all credential rows EXCEPT the one with the latest hash
    DELETE FROM "Account"
    WHERE "providerId" = 'credential'
      AND "userId" = rec."userId"
      AND id NOT IN (
        SELECT id FROM "Account"
        WHERE "providerId" = 'credential'
          AND "userId" = rec."userId"
          AND password IS NOT NULL
          AND length(password) > 0
        ORDER BY "updatedAt" DESC
        LIMIT 1
      );
  END LOOP;
END
$$;

-- Also normalise accountId to lower-cased email so sign-in lookup always matches.
UPDATE "Account" a
SET "accountId" = lower(trim(u.email)),
    "updatedAt" = now()
FROM "User" u
WHERE a."userId" = u.id
  AND a."providerId" = 'credential'
  AND a."accountId" <> lower(trim(u.email));
