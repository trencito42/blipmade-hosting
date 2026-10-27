-- The eggs of the products are named, and the platform makes the variables
-- that some of them need.
--
-- Three things are added:
--
--   * "Product"."eggName" holds the name of the egg the product runs on. The
--     number of an egg is given by the panel when the egg is imported, so a
--     product that names its egg keeps working when the panel is moved or
--     when the egg is imported again. The number is still used when it is
--     set;
--
--   * "Product"."generatedVariables" holds the variables the platform makes
--     for every instance of the product, such as the password of a database.
--     The default of the egg is the same for every customer, so it cannot be
--     used: two customers would hold the same password;
--
--   * "Instance"."generatedVariables" holds the values the platform made for
--     this instance, encrypted with the secret of the deployment. The owner
--     of the instance reads them in the console of the service.
--
-- The migration is additive and can be undone with
--
--   ALTER TABLE "Instance" DROP COLUMN "generatedVariables";
--   ALTER TABLE "Product" DROP COLUMN "generatedVariables";
--   ALTER TABLE "Product" DROP COLUMN "eggName";

-- The product names the egg it runs on.
ALTER TABLE "Product" ADD COLUMN "eggName" TEXT;

-- The variables the platform makes for every instance of the product.
ALTER TABLE "Product" ADD COLUMN "generatedVariables" JSONB;

-- The values the platform made for this instance, encrypted.
ALTER TABLE "Instance" ADD COLUMN "generatedVariables" TEXT;
