-- Set default billing currency to USD for new organizations.
ALTER TABLE "Organization"
  ALTER COLUMN "billingCurrencyCode" SET DEFAULT 'USD';
