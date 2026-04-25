-- Rename legacy Stripe-named column to Paddle naming.
-- Keep data and uniqueness; guard for repeated runs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'CreditPurchase'
      AND column_name = 'stripeSessionId'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'CreditPurchase'
      AND column_name = 'paddleTransactionId'
  ) THEN
    EXECUTE 'ALTER TABLE "CreditPurchase" RENAME COLUMN "stripeSessionId" TO "paddleTransactionId"';
  END IF;
END $$;
