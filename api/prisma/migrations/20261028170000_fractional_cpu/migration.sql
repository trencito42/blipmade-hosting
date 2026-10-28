-- The processor of an instance may be a half of a vCPU.
--
-- A small bot of half a processor is a thing the panel can build, and the price
-- of the resources is the same for every product of the platform, so the limit
-- of a product has to be able to say "half a processor".
--
-- The column changes from a whole number to a decimal one. The values that are
-- in the table stay the values they were: one stays one, two stays two. The
-- change is undone with:
--
--   ALTER TABLE "Instance" ALTER COLUMN "cpu" TYPE INTEGER;
--   ALTER TABLE "Product" ALTER COLUMN "maxCpu" TYPE INTEGER;
--   ALTER TABLE "Product" ALTER COLUMN "defaultCpu" TYPE INTEGER;
--   ALTER TABLE "Product" ALTER COLUMN "minCpu" TYPE INTEGER;
--
-- The migration is additive: no row is dropped, no row is written, and the
-- accounts, the orders and the instances of the customers are not touched.

ALTER TABLE "Product" ALTER COLUMN "minCpu" TYPE DOUBLE PRECISION;
ALTER TABLE "Product" ALTER COLUMN "defaultCpu" TYPE DOUBLE PRECISION;
ALTER TABLE "Product" ALTER COLUMN "maxCpu" TYPE DOUBLE PRECISION;
ALTER TABLE "Instance" ALTER COLUMN "cpu" TYPE DOUBLE PRECISION;
