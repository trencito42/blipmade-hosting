-- Discord 3.0: ticket bridges, server config, staff role maps, DISCORD support channel

ALTER TYPE "SupportChannel" ADD VALUE IF NOT EXISTS 'DISCORD';

CREATE TABLE "DiscordServerConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "desiredStateVersion" INTEGER NOT NULL DEFAULT 1,
    "desiredState" JSONB NOT NULL,
    "channelBindings" JSONB NOT NULL DEFAULT '{}',
    "protectedChannelIds" TEXT[] DEFAULT ARRAY['1565844667147493376']::TEXT[],
    "supportPanelMessageId" TEXT,
    "lastGuildSyncAt" TIMESTAMP(3),
    "lastGuildSyncError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscordServerConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscordStaffRoleMapping" (
    "id" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "discordRoleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscordStaffRoleMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscordStaffRoleMapping_permission_key" ON "DiscordStaffRoleMapping"("permission");

CREATE TABLE "DiscordTicketBridge" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "discordGuildId" TEXT NOT NULL,
    "discordChannelId" TEXT NOT NULL,
    "openedByDiscordUserId" TEXT NOT NULL,
    "syncState" TEXT NOT NULL DEFAULT 'active',
    "lastDiscordMessageId" TEXT,
    "lastBlipmadeMessageSeq" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscordTicketBridge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscordTicketBridge_ticketId_key" ON "DiscordTicketBridge"("ticketId");
CREATE UNIQUE INDEX "DiscordTicketBridge_discordChannelId_key" ON "DiscordTicketBridge"("discordChannelId");

CREATE TABLE "DiscordMessageBridge" (
    "id" TEXT NOT NULL,
    "bridgeId" TEXT NOT NULL,
    "ticketMessageId" TEXT NOT NULL,
    "discordMessageId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiscordMessageBridge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DiscordMessageBridge_ticketMessageId_key" ON "DiscordMessageBridge"("ticketMessageId");
CREATE UNIQUE INDEX "DiscordMessageBridge_discordMessageId_key" ON "DiscordMessageBridge"("discordMessageId");
CREATE INDEX "DiscordMessageBridge_bridgeId_idx" ON "DiscordMessageBridge"("bridgeId");

ALTER TABLE "DiscordTicketBridge" ADD CONSTRAINT "DiscordTicketBridge_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscordMessageBridge" ADD CONSTRAINT "DiscordMessageBridge_bridgeId_fkey" FOREIGN KEY ("bridgeId") REFERENCES "DiscordTicketBridge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
