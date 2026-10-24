-- A customer pays more than once, so the customer of the provider cannot
-- be unique in the table of the payments.
--
-- The constraint refused the second payment of a customer: the order was
-- marked as paid before the write, so the money was taken, the payment was
-- never written and no service was delivered. The customer of the provider is
-- looked up by this column, so the column keeps an index, but the index is
-- not a constraint anymore.
DROP INDEX IF EXISTS "Payment_stripeCustomerId_key";

CREATE INDEX IF NOT EXISTS "Payment_stripeCustomerId_idx" ON "Payment"("stripeCustomerId");
