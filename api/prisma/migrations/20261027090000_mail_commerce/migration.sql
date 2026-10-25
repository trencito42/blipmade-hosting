-- The sale of hosted mail.
--
-- The tables of the mail that were added with the first mail migration are
-- the working surface of the mail system: domains, mailboxes and aliases.
-- This migration adds what the sale of mail needs on top of them:
--
--   * a category and a kind of fulfilment, so a product of mail can be sold
--     without a server and without a panel;
--   * the limits of a mail plan, on the product, so the catalog is the only
--     place a limit is written down;
--   * "MailService", the identity of the mail a customer buys, with its own
--     life: cancelling the server does not cancel the mail;
--   * the proof of ownership of a domain, so a domain is only provisioned
--     when the customer has shown that it is theirs;
--   * the state of the delivery of an order line, so a line of mail and a
--     line of server progress on their own.
--
-- The migration is additive: nothing that existed before changes its meaning,
-- and it can be undone with
--
--   DROP TABLE "MailService";
--   ALTER TABLE "OrderItem" DROP COLUMN "fulfillmentStatus";
--   ALTER TABLE "OrderItem" DROP COLUMN "fulfillmentError";
--   ALTER TABLE "MailDomain" DROP COLUMN "serviceId";
--   ALTER TABLE "MailDomain" DROP COLUMN "ownershipStatus";
--   ALTER TABLE "MailDomain" DROP COLUMN "verificationToken";
--   ALTER TABLE "MailDomain" DROP COLUMN "verificationHost";
--   ALTER TABLE "MailDomain" DROP COLUMN "verifiedAt";
--   ALTER TABLE "MailDomain" DROP COLUMN "maxForwarding";
--   ALTER TABLE "Product" DROP COLUMN "fulfilment";
--   ALTER TABLE "Product" DROP COLUMN "mailMaxDomains";
--   ALTER TABLE "Product" DROP COLUMN "mailMaxMailboxes";
--   ALTER TABLE "Product" DROP COLUMN "mailMaxAliases";
--   ALTER TABLE "Product" DROP COLUMN "mailMaxForwarding";
--   ALTER TABLE "Product" DROP COLUMN "mailTotalStorageMb";
--   ALTER TABLE "Product" DROP COLUMN "mailMailboxQuotaMb";
--   ALTER TABLE "Product" DROP COLUMN "mailSendLimit";
--   ALTER TABLE "Product" DROP COLUMN "mailSendInterval";
--   ALTER TYPE "Category" DROP VALUE 'EMAIL_HOSTING';
--   DROP TYPE "MailServiceStatus";
--   DROP TYPE "MailOwnershipStatus";
--   DROP TYPE "MailSendingInterval";
--   DROP TYPE "ProductFulfilment";

-- What the platform delivers when a product is bought.
--
-- CREATE TYPE has no IF NOT EXISTS, so the type is created through a block
-- that ignores the error of a type that is already there. The migration can
-- then be applied twice without failing.
DO $$ BEGIN
  CREATE TYPE "ProductFulfilment" AS ENUM ('SERVER', 'EMAIL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- The window in which the limit of sending of a domain is counted.
DO $$ BEGIN
  CREATE TYPE "MailSendingInterval" AS ENUM ('MINUTELY', 'HOURLY', 'DAILY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Whether the customer proved that a domain of mail is theirs.
DO $$ BEGIN
  CREATE TYPE "MailOwnershipStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- The life of a mail service.
DO $$ BEGIN
  CREATE TYPE "MailServiceStatus" AS ENUM ('PENDING', 'PROVISIONING', 'ACTIVE', 'GRACE', 'SUSPENDED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- The mail is a category of the catalog of its own.
--
-- The value is added to the type that already exists and not to a new one:
-- the catalog, the interface and the prices of the platform all read the
-- same type, and a product of mail has to appear in the same places as the
-- other products.
ALTER TYPE "Category" ADD VALUE IF NOT EXISTS 'EMAIL_HOSTING';

-- The limits of a mail plan live on the product, so the catalog is the one
-- place where a limit is written down and the back office changes it there.
--
-- The columns are empty for a product of servers: the limits of a server are
-- the ones of the resources it uses, and they are already on the product.
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "fulfilment" "ProductFulfilment" NOT NULL DEFAULT 'SERVER',
  ADD COLUMN IF NOT EXISTS "mailMaxDomains" INTEGER,
  ADD COLUMN IF NOT EXISTS "mailMaxMailboxes" INTEGER,
  ADD COLUMN IF NOT EXISTS "mailMaxAliases" INTEGER,
  ADD COLUMN IF NOT EXISTS "mailMaxForwarding" INTEGER,
  ADD COLUMN IF NOT EXISTS "mailTotalStorageMb" INTEGER,
  ADD COLUMN IF NOT EXISTS "mailMailboxQuotaMb" INTEGER,
  ADD COLUMN IF NOT EXISTS "mailSendLimit" INTEGER,
  ADD COLUMN IF NOT EXISTS "mailSendInterval" "MailSendingInterval";

-- The identity of the mail a customer buys.
--
-- The service carries the limits that were bought, as a copy: a change of the
-- plan in the catalog never changes a service that was already paid for. It
-- has no instance: the mail is renewed, suspended and cancelled on its own.
CREATE TABLE IF NOT EXISTS "MailService" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  -- The plan the customer bought.
  "productId" TEXT NOT NULL,
  -- The order line that paid for it. One line, one service.
  "orderItemId" TEXT,
  -- The order the service comes from.
  "orderId" TEXT,
  -- The subscription that renews it.
  "subscriptionId" TEXT,
  "status" "MailServiceStatus" NOT NULL DEFAULT 'PENDING',
  -- The key that makes the creation of the service safe to repeat: a
  -- redelivered payment event finds the service instead of making another.
  "provisioningKey" TEXT NOT NULL,
  -- The limits that were bought.
  "maxDomains" INTEGER NOT NULL,
  "maxMailboxes" INTEGER NOT NULL,
  "maxAliases" INTEGER NOT NULL,
  "maxForwarding" INTEGER NOT NULL,
  "totalStorageMb" INTEGER NOT NULL,
  "mailboxQuotaMb" INTEGER NOT NULL,
  "sendLimit" INTEGER NOT NULL,
  "sendInterval" "MailSendingInterval" NOT NULL DEFAULT 'HOURLY',
  -- The use of the service, counted when it is asked for.
  "domainCount" INTEGER NOT NULL DEFAULT 0,
  "mailboxCount" INTEGER NOT NULL DEFAULT 0,
  -- The life of the service. The data of a service is never deleted the
  -- moment a payment fails: it is kept until the retention ends.
  "graceUntil" TIMESTAMP(3),
  "suspendedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "retentionUntil" TIMESTAMP(3),
  -- Why the last attempt failed, in words.
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- The moment the row was written for the last time. There is no default on
  -- purpose: the column is written by the application on every change, the
  -- same way every other table of the platform does it.
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MailService_pkey" PRIMARY KEY ("id")
);

-- A domain of mail belongs to a service, and the service knows how to prove
-- that the domain is the customer's.
ALTER TABLE "MailDomain"
  ADD COLUMN IF NOT EXISTS "serviceId" TEXT,
  ADD COLUMN IF NOT EXISTS "ownershipStatus" "MailOwnershipStatus" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS "verificationToken" TEXT,
  ADD COLUMN IF NOT EXISTS "verificationHost" TEXT,
  ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "maxForwarding" INTEGER NOT NULL DEFAULT 0;

-- The state of the delivery of an order line, on its own. A line of mail is
-- delivered by the mail system and a line of server by the panel, so the two
-- progress separately: one of them can fail while the other works.
ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "fulfillmentStatus" "FulfillmentStatus" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS "fulfillmentError" TEXT;

-- One order line, one service.
CREATE UNIQUE INDEX IF NOT EXISTS "MailService_orderItemId_key"
  ON "MailService"("orderItemId");

-- One subscription, one service.
CREATE UNIQUE INDEX IF NOT EXISTS "MailService_subscriptionId_key"
  ON "MailService"("subscriptionId");

-- The key of the creation of the service.
CREATE UNIQUE INDEX IF NOT EXISTS "MailService_provisioningKey_key"
  ON "MailService"("provisioningKey");

-- The services of a customer are read by the customer and by the state.
CREATE INDEX IF NOT EXISTS "MailService_userId_status_idx"
  ON "MailService"("userId", "status");

-- The services of the platform are read by the state.
CREATE INDEX IF NOT EXISTS "MailService_status_idx"
  ON "MailService"("status");

-- The domains of a service are read when the service is read.
CREATE INDEX IF NOT EXISTS "MailDomain_serviceId_idx"
  ON "MailDomain"("serviceId");

-- The domains that wait for a proof are read by their state.
CREATE INDEX IF NOT EXISTS "MailDomain_ownershipStatus_idx"
  ON "MailDomain"("ownershipStatus");

-- The lines of an order that wait for their delivery are read by their state.
CREATE INDEX IF NOT EXISTS "OrderItem_fulfillmentStatus_idx"
  ON "OrderItem"("fulfillmentStatus");

ALTER TABLE "MailDomain" ADD CONSTRAINT "MailDomain_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "MailService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MailService" ADD CONSTRAINT "MailService_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MailService" ADD CONSTRAINT "MailService_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MailService" ADD CONSTRAINT "MailService_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MailService" ADD CONSTRAINT "MailService_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
