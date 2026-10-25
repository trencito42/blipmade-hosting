-- The notification engine: the outbox of the events and the notification
-- centre of the customer.
--
-- Three things are added:
--
--   * "NotificationEvent" is the outbox. An event is written in the same
--     transaction as the business change that caused it, and the dispatcher
--     turns it into a message later. A mail server that is down therefore
--     never rolls back a payment or a provisioning;
--   * "Notification" is one message of the notification centre of a
--     customer. It belongs to one customer and to one occurrence of an
--     event;
--   * the preferences get the groups of the messages and the channels, so a
--     customer can choose what they hear about and where.
--
-- The migration is additive and can be undone with
--
--   DROP TABLE "Notification";
--   DROP TABLE "NotificationEvent";
--   ALTER TABLE "MailDelivery" DROP COLUMN "eventId";
--   ALTER TABLE "NotificationPreference" DROP COLUMN "accountSecurity";
--   ALTER TABLE "NotificationPreference" DROP COLUMN "ordersBilling";
--   ALTER TABLE "NotificationPreference" DROP COLUMN "hostingServices";
--   ALTER TABLE "NotificationPreference" DROP COLUMN "domainsEmail";
--   ALTER TABLE "NotificationPreference" DROP COLUMN "emailChannel";
--   ALTER TABLE "NotificationPreference" DROP COLUMN "inAppChannel";
--   ALTER TABLE "NotificationPreference" DROP COLUMN "marketingOptInAt";

-- The ledger of the mail keeps the link with the event that caused the
-- message, so the back office can follow a message back to the event that
-- produced it. It is empty for the messages that the platform sends on its
-- own, e.g. the verification of the address.
ALTER TABLE "MailDelivery"
  ADD COLUMN IF NOT EXISTS "eventId" TEXT;

-- The groups of the messages and the channels.
--
-- The messages of the account and of its security are essential: the
-- customer cannot switch them off, because they protect the account. The
-- switch of the channel of the e-mail never switches off the essential
-- messages either, whatever it says.
ALTER TABLE "NotificationPreference"
  ADD COLUMN IF NOT EXISTS "accountSecurity" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "ordersBilling" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "hostingServices" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "domainsEmail" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "emailChannel" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "inAppChannel" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "marketingOptInAt" TIMESTAMP(3);

-- The outbox of the events.
CREATE TABLE IF NOT EXISTS "NotificationEvent" (
  "id" TEXT NOT NULL,
  -- The kind of the event, e.g. "payment.succeeded".
  "type" TEXT NOT NULL,
  -- The identity of the occurrence. It is built from the business identity
  -- of the thing that happened AND from the occurrence itself, so the same
  -- service can be suspended and reactivated as many times as it happens and
  -- every occurrence keeps its own message.
  "businessKey" TEXT NOT NULL,
  -- The customer the event belongs to. It is empty for the events that are
  -- about the operator.
  "userId" TEXT,
  -- The facts of the event.
  "payload" JSONB NOT NULL,
  -- pending, processed or failed.
  "state" TEXT NOT NULL DEFAULT 'pending',
  -- What was done with the event, per channel.
  "channels" JSONB NOT NULL DEFAULT '{}',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationEvent_pkey" PRIMARY KEY ("id")
);

-- The notification centre of the customer.
CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "actionUrl" TEXT,
  "actionLabel" TEXT,
  -- The occurrence of the event that produced the message.
  "eventKey" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotificationEvent_businessKey_key"
  ON "NotificationEvent"("businessKey");

CREATE INDEX IF NOT EXISTS "NotificationEvent_state_createdAt_idx"
  ON "NotificationEvent"("state", "createdAt");

CREATE INDEX IF NOT EXISTS "NotificationEvent_userId_createdAt_idx"
  ON "NotificationEvent"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "NotificationEvent_type_createdAt_idx"
  ON "NotificationEvent"("type", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "Notification_eventKey_key"
  ON "Notification"("eventKey");

CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx"
  ON "Notification"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_idx"
  ON "Notification"("userId", "readAt");

CREATE INDEX IF NOT EXISTS "MailDelivery_eventId_idx"
  ON "MailDelivery"("eventId");

ALTER TABLE "NotificationEvent" ADD CONSTRAINT "NotificationEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
