-- CreateEnum
CREATE TYPE "SupportChannel" AS ENUM ('TICKET', 'CHAT', 'EMAIL');

-- CreateEnum
CREATE TYPE "SupportAvailability" AS ENUM ('AVAILABLE', 'BUSY', 'AWAY', 'OFFLINE');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "channel" "SupportChannel" NOT NULL DEFAULT 'TICKET',
ADD COLUMN     "departmentId" TEXT,
ADD COLUMN     "firstHumanResponseAt" TIMESTAMP(3),
ADD COLUMN     "lastCustomerAt" TIMESTAMP(3),
ADD COLUMN     "lastStaffAt" TIMESTAMP(3),
ADD COLUMN     "reopenedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TicketMessage" ADD COLUMN     "seq" BIGSERIAL NOT NULL;

-- The messages that exist keep the order they were written in: the new numbers follow the moment of the message.
WITH ordered AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS n FROM "TicketMessage"
)
UPDATE "TicketMessage" m SET "seq" = ordered.n FROM ordered WHERE m."id" = ordered."id";
SELECT setval(pg_get_serial_sequence('"TicketMessage"', 'seq'), GREATEST(COALESCE((SELECT max("seq") FROM "TicketMessage"), 0), 1), (SELECT count(*) FROM "TicketMessage") > 0);

-- The moments of the conversation, read from the history that already exists. A message of the owner is the customer's;
-- a public message of anybody else is a person of the staff answering.
UPDATE "Ticket" t SET
  "lastCustomerAt" = (SELECT max(m."createdAt") FROM "TicketMessage" m WHERE m."ticketId" = t."id" AND m."authorId" = t."userId"),
  "lastStaffAt" = (SELECT max(m."createdAt") FROM "TicketMessage" m WHERE m."ticketId" = t."id" AND m."authorId" <> t."userId" AND NOT m."internal"),
  "firstHumanResponseAt" = (SELECT min(m."createdAt") FROM "TicketMessage" m WHERE m."ticketId" = t."id" AND m."authorId" <> t."userId" AND NOT m."internal");

-- CreateTable
CREATE TABLE "SupportDepartment" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportDepartmentMember" (
    "departmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportDepartmentMember_pkey" PRIMARY KEY ("departmentId","userId")
);

-- CreateTable
CREATE TABLE "SupportPresence" (
    "userId" TEXT NOT NULL,
    "status" "SupportAvailability" NOT NULL DEFAULT 'OFFLINE',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportPresence_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportDepartment_slug_key" ON "SupportDepartment"("slug");

-- CreateIndex
CREATE INDEX "SupportDepartmentMember_userId_idx" ON "SupportDepartmentMember"("userId");

-- CreateIndex
CREATE INDEX "Ticket_departmentId_status_idx" ON "Ticket"("departmentId", "status");

-- CreateIndex
CREATE INDEX "Ticket_channel_status_idx" ON "Ticket"("channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TicketMessage_seq_key" ON "TicketMessage"("seq");

-- AddForeignKey
ALTER TABLE "SupportDepartmentMember" ADD CONSTRAINT "SupportDepartmentMember_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "SupportDepartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportDepartmentMember" ADD CONSTRAINT "SupportDepartmentMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "StaffMember"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportPresence" ADD CONSTRAINT "SupportPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "StaffMember"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "SupportDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

