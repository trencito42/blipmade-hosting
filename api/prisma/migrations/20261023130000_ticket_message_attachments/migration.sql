-- The legacy description column of a ticket message is replaced by real
-- attachment rows and the new metadata column. The existing values are moved
-- over first, so nothing is lost.
UPDATE "TicketMessage"
SET "attachmentMeta" = "attachments"
WHERE "attachments" IS NOT NULL AND "attachmentMeta" IS NULL;

ALTER TABLE "TicketMessage" DROP COLUMN IF EXISTS "attachments";
