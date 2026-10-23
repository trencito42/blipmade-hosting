-- The identity of a customer gets two parts, and the mapping to the panel
-- account becomes permanent.
--
-- The name is split in two columns, because the panel account of a customer
-- carries the same two parts and no name is ever invented. The existing values
-- are moved over first, so nothing is lost.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastName" TEXT;

UPDATE "User"
SET "firstName" = COALESCE(
      NULLIF(split_part(trim("name"), ' ', 1), ''),
      NULLIF(split_part(split_part("email", '@', 1), '.', 1), ''),
      'Customer'
    ),
    "lastName" = COALESCE(
      NULLIF(trim(btrim("name", ' ' || split_part(trim("name"), ' ', 1))), ''),
      'Customer'
    )
WHERE "firstName" IS NULL OR "lastName" IS NULL;

ALTER TABLE "User" ALTER COLUMN "firstName" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "lastName" SET NOT NULL;

-- The external id is the permanent link to the panel account. The accounts
-- that were created before this change are matched by their id, so the link
-- survives the change.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pterodactylExternalId" TEXT;

UPDATE "User"
SET "pterodactylExternalId" = 'blipmade_acc_' || "id"
WHERE "pterodactylUserId" IS NOT NULL AND "pterodactylExternalId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "User_pterodactylExternalId_key"
  ON "User"("pterodactylExternalId");

-- The panel password of the customer account is not kept any more. The
-- customer never signs in to the panel, so there is nothing to reset and
-- nothing to hand over.
ALTER TABLE "User" DROP COLUMN IF EXISTS "pterodactylPasswordEnc";
ALTER TABLE "User" DROP COLUMN IF EXISTS "pterodactylPasswordSetAt";

ALTER TABLE "User" DROP COLUMN IF EXISTS "name";

-- One client credential per customer, encrypted on this server.
CREATE TABLE IF NOT EXISTS "PanelCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "panelUserId" INTEGER NOT NULL,
    "externalId" TEXT NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'bridge',
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PanelCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PanelCredential_userId_key"
  ON "PanelCredential"("userId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'PanelCredential_userId_fkey'
    ) THEN
        ALTER TABLE "PanelCredential"
            ADD CONSTRAINT "PanelCredential_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- The allocation that the panel assigned, so the port of the service is read
-- from the panel and never assumed.
ALTER TABLE "Instance" ADD COLUMN IF NOT EXISTS "pterodactylAllocation" INTEGER;
ALTER TABLE "Instance" ADD COLUMN IF NOT EXISTS "pterodactylNodeId" INTEGER;
