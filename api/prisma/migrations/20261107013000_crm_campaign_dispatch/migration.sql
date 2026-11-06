ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "dispatchCursor" TEXT;
ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "dispatchCompletedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "MarketingCampaign_status_scheduledAt_idx" ON "MarketingCampaign"("status", "scheduledAt");
