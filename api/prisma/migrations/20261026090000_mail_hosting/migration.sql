-- The hosted mail.
--
-- The mail system holds the domains, the mailboxes and the aliases; the
-- platform holds the truth about the customer: which domains belong to them,
-- how many mailboxes the plan allows, and what every change did.
--
-- The tables are additive: nothing that existed before depends on them, and
-- they can be dropped again with
--
--   DROP TABLE "MailJob";
--   DROP TABLE "MailAlias";
--   DROP TABLE "Mailbox";
--   DROP TABLE "MailDomain";
--   DROP TYPE "MailDomainStatus";
--
-- The unique index on the customer and the name of the domain is what keeps
-- one customer from hosting the same domain twice. The index on the name
-- alone is what lets the platform answer "that domain is already hosted"
-- without reading the rows of every customer.

-- The state of a hosted domain of mail.
--
-- CREATE TYPE has no IF NOT EXISTS, so the type is created through a block
-- that ignores the error of a type that is already there. The migration can
-- then be applied twice without failing.
DO $$ BEGIN
  CREATE TYPE "MailDomainStatus" AS ENUM ('PENDING', 'ACTIVE', 'ERROR', 'SUSPENDED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "MailDomain" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  -- The domain itself, in lower case, e.g. "acme.ro".
  "name" TEXT NOT NULL,
  "status" "MailDomainStatus" NOT NULL DEFAULT 'PENDING',
  -- How much of the quota of the domain is used, in megabytes.
  "quotaMb" INTEGER NOT NULL DEFAULT 10240,
  "usedMb" INTEGER NOT NULL DEFAULT 0,
  -- How many mailboxes the plan allows on this domain.
  "maxMailboxes" INTEGER NOT NULL DEFAULT 10,
  -- How many aliases the plan allows on this domain.
  "maxAliases" INTEGER NOT NULL DEFAULT 100,
  -- The public part of the DKIM key of the domain.
  "dkimPublic" TEXT,
  -- Why the last attempt failed, in words.
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- The moment the row was written for the last time. There is no default on
  -- purpose: the column is written by the application on every change, the
  -- same way every other table of the platform does it.
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MailDomain_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Mailbox" (
  "id" TEXT NOT NULL,
  "domainId" TEXT NOT NULL,
  -- The part before the "@", in lower case.
  "localPart" TEXT NOT NULL,
  -- The whole address, e.g. "contact@acme.ro".
  "address" TEXT NOT NULL,
  -- "active" or "disabled".
  "status" TEXT NOT NULL DEFAULT 'active',
  "quotaMb" INTEGER NOT NULL DEFAULT 1024,
  "usedMb" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Mailbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MailAlias" (
  "id" TEXT NOT NULL,
  "domainId" TEXT NOT NULL,
  -- The alias itself, e.g. "info@acme.ro".
  "alias" TEXT NOT NULL,
  -- The mailbox the alias delivers to, e.g. "contact@acme.ro".
  "target" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MailAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MailJob" (
  "id" TEXT NOT NULL,
  -- What the job does: "domain.create", "domain.delete", "mailbox.create",
  -- "mailbox.delete", "alias.create", "alias.delete".
  "kind" TEXT NOT NULL,
  "domainId" TEXT,
  -- What the job carries.
  "payload" JSONB NOT NULL,
  -- "queued", "running", "done" or "failed".
  "status" TEXT NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MailJob_pkey" PRIMARY KEY ("id")
);

-- One customer cannot host the same domain twice.
CREATE UNIQUE INDEX IF NOT EXISTS "MailDomain_userId_name_key"
  ON "MailDomain"("userId", "name");

-- The platform answers "that domain is already hosted" by the name alone.
CREATE INDEX IF NOT EXISTS "MailDomain_name_idx"
  ON "MailDomain"("name");

-- The address of a mailbox is unique in the whole platform: the mail system
-- refuses two mailboxes with the same address, and so does the platform.
CREATE UNIQUE INDEX IF NOT EXISTS "Mailbox_address_key"
  ON "Mailbox"("address");

CREATE UNIQUE INDEX IF NOT EXISTS "Mailbox_domainId_localPart_key"
  ON "Mailbox"("domainId", "localPart");

-- The alias of a domain is unique inside that domain.
CREATE UNIQUE INDEX IF NOT EXISTS "MailAlias_domainId_alias_key"
  ON "MailAlias"("domainId", "alias");

-- The work that waits is read by the state and the work that waits for a
-- domain is read by the domain.
CREATE INDEX IF NOT EXISTS "MailJob_status_idx"
  ON "MailJob"("status");

CREATE INDEX IF NOT EXISTS "MailJob_domainId_idx"
  ON "MailJob"("domainId");

ALTER TABLE "MailDomain" ADD CONSTRAINT "MailDomain_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Mailbox" ADD CONSTRAINT "Mailbox_domainId_fkey"
  FOREIGN KEY ("domainId") REFERENCES "MailDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MailAlias" ADD CONSTRAINT "MailAlias_domainId_fkey"
  FOREIGN KEY ("domainId") REFERENCES "MailDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MailJob" ADD CONSTRAINT "MailJob_domainId_fkey"
  FOREIGN KEY ("domainId") REFERENCES "MailDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
