-- The variables of the customer, and the category of the games.
--
-- Two things are added:
--
--   * "Product"."customerVariables" says which variables of the egg the
--     customer has to fill at the order. A game that runs on a licence of the
--     vendor cannot be deployed without it, and the platform could not ask
--     for it before today: it filled the variables of the egg with their
--     default values. The declaration is a JSON document, the same shape as
--     the variables the platform makes itself:
--
--       { "STEAM_USER": { "label": "Steam account", "required": true } }
--
--   * "Instance"."customerVariables" keeps the values the customer gave. They
--     are encrypted with the secret of the deployment, like the variables the
--     platform makes: they are the secrets of the customer, and they are
--     never written in the clear.
--
-- The category of the games is added to the enumeration, because a game is
-- neither a tool of a developer nor a bot: the catalogue groups the products
-- by what they are, and the games are what a customer looks for.
--
-- The migration is additive and can be undone with
--
--   ALTER TABLE "Instance" DROP COLUMN "customerVariables";
--   ALTER TABLE "Product" DROP COLUMN "customerVariables";
--   ALTER TYPE "Category" RENAME VALUE 'GAMES' TO 'EMAIL_HOSTING';

ALTER TABLE "Product" ADD COLUMN "customerVariables" JSONB;

ALTER TABLE "Instance" ADD COLUMN "customerVariables" TEXT;

ALTER TYPE "Category" ADD VALUE 'GAMES';
