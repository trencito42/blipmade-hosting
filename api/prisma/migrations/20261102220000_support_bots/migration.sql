-- CreateEnum
CREATE TYPE "SupportBotState" AS ENUM ('ACTIVE', 'HANDED_OFF', 'ENDED');

-- CreateTable
CREATE TABLE "SupportBot" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "draft" JSONB NOT NULL,
    "publishedVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportBot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportBotVersion" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "flow" JSONB NOT NULL,
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportBotVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportBotSession" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" "SupportBotState" NOT NULL DEFAULT 'ACTIVE',
    "node" TEXT,
    "variables" JSONB NOT NULL DEFAULT '{}',
    "transcript" JSONB NOT NULL DEFAULT '[]',
    "steps" INTEGER NOT NULL DEFAULT 0,
    "ticketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportBotSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportBotVersion_botId_version_key" ON "SupportBotVersion"("botId", "version");

-- CreateIndex
CREATE INDEX "SupportBotSession_userId_state_idx" ON "SupportBotSession"("userId", "state");

-- CreateIndex
CREATE INDEX "SupportBotSession_botId_idx" ON "SupportBotSession"("botId");

-- AddForeignKey
ALTER TABLE "SupportBotVersion" ADD CONSTRAINT "SupportBotVersion_botId_fkey" FOREIGN KEY ("botId") REFERENCES "SupportBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportBotSession" ADD CONSTRAINT "SupportBotSession_botId_fkey" FOREIGN KEY ("botId") REFERENCES "SupportBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportBotSession" ADD CONSTRAINT "SupportBotSession_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SupportBotVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportBotSession" ADD CONSTRAINT "SupportBotSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

