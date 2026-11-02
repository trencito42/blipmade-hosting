-- AlterTable
ALTER TABLE "TicketMessage" ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TicketMessage_externalId_key" ON "TicketMessage"("externalId");

