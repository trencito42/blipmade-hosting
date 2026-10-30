-- A ticket can be about a hosted mail service as well as about a server.
ALTER TABLE "Ticket" ADD COLUMN "mailServiceId" TEXT;

ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_mailServiceId_fkey" FOREIGN KEY ("mailServiceId") REFERENCES "MailService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Ticket_mailServiceId_idx" ON "Ticket"("mailServiceId");
