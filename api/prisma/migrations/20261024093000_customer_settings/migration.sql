-- The account of a customer gets real settings.
--
-- Nothing is deleted by this change: the tables are added and the columns are
-- added to the account, so every user, instance, allocation, subscription and
-- database stays exactly as it is.

-- A customer can ask for the account to be closed. The request is kept on the
-- account, so nothing disappears before a person has looked at it.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletionRequestedAt" TIMESTAMP(3);

-- A change of the address is a request of its own. The new address is only
-- used when it has answered, so a mistyped address cannot lock a customer
-- out of the account.
CREATE TABLE IF NOT EXISTS "EmailChangeRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailChangeRequest_tokenHash_key"
  ON "EmailChangeRequest"("tokenHash");

CREATE INDEX IF NOT EXISTS "EmailChangeRequest_userId_idx"
  ON "EmailChangeRequest"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EmailChangeRequest_userId_fkey'
  ) THEN
    ALTER TABLE "EmailChangeRequest"
      ADD CONSTRAINT "EmailChangeRequest_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- What a customer wants to hear about. The preferences say what the customer
-- wants, not what has been sent.
CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "productUpdates" BOOLEAN NOT NULL DEFAULT true,
  "billing" BOOLEAN NOT NULL DEFAULT true,
  "support" BOOLEAN NOT NULL DEFAULT true,
  "incidents" BOOLEAN NOT NULL DEFAULT true,
  "marketing" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_userId_key"
  ON "NotificationPreference"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NotificationPreference_userId_fkey'
  ) THEN
    ALTER TABLE "NotificationPreference"
      ADD CONSTRAINT "NotificationPreference_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
