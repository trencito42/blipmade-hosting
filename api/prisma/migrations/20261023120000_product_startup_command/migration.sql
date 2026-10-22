-- The column was added to the schema while the platform was being built and
-- reached the database without a migration. IF NOT EXISTS keeps this safe on
-- a database that already has the column and correct on a fresh one.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "startupCommand" TEXT;
