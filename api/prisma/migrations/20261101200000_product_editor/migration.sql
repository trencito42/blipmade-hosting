-- The editor of a product keeps guidance for the customer and the date a product was retired.
ALTER TABLE "Product" ADD COLUMN "installGuide" TEXT;
ALTER TABLE "Product" ADD COLUMN "retiredAt" TIMESTAMP(3);
