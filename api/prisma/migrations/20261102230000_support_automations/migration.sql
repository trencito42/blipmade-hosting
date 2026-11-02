-- CreateEnum
CREATE TYPE "SupportAutomationRunStatus" AS ENUM ('OK', 'FAILED', 'DEAD');

-- CreateTable
CREATE TABLE "SupportAutomation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "trigger" TEXT NOT NULL,
    "afterMinutes" INTEGER,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportAutomationRun" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "status" "SupportAutomationRunStatus" NOT NULL DEFAULT 'OK',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "done" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportAutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportAutomationRun_ticketId_idx" ON "SupportAutomationRun"("ticketId");

-- CreateIndex
CREATE INDEX "SupportAutomationRun_status_updatedAt_idx" ON "SupportAutomationRun"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportAutomationRun_automationId_eventKey_key" ON "SupportAutomationRun"("automationId", "eventKey");

-- AddForeignKey
ALTER TABLE "SupportAutomationRun" ADD CONSTRAINT "SupportAutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "SupportAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

