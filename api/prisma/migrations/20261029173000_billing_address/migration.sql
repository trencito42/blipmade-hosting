ALTER TABLE "User" ADD COLUMN "billingAddress" JSONB;
ALTER TABLE "Order" ADD COLUMN "billingAddress" JSONB;
ALTER TABLE "Invoice" ADD COLUMN "billingAddress" JSONB;
