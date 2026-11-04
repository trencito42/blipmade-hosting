-- Discord channel content anchors (bot-posted template messages)
ALTER TABLE "DiscordServerConfig" ADD COLUMN IF NOT EXISTS "contentAnchors" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "DiscordServerConfig" ADD COLUMN IF NOT EXISTS "liveTemplateImportedAt" TIMESTAMP(3);
