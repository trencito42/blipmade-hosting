-- What is known about one message of the platform.
--
-- The row holds the state of the delivery and never the body of the message
-- and never a token. It is the place where the API and the worker meet: both
-- of them write to it, so the report of a message is the same in every
-- process and it survives a restart.
CREATE TABLE IF NOT EXISTS "MailDelivery" (
  "key" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "to" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "transport" TEXT NOT NULL DEFAULT 'file',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastErrorClass" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),

  CONSTRAINT "MailDelivery_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "MailDelivery_state_idx" ON "MailDelivery"("state");
CREATE INDEX IF NOT EXISTS "MailDelivery_createdAt_idx" ON "MailDelivery"("createdAt");
