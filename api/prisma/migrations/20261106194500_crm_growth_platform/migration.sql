-- CRM growth platform: facts, segments, campaigns, automations, risk history.

ALTER TABLE "CustomerFact" ADD COLUMN IF NOT EXISTS "numericValue" DOUBLE PRECISION;
ALTER TABLE "CustomerFact" ADD COLUMN IF NOT EXISTS "occurredAt" TIMESTAMP(3);
ALTER TABLE "CustomerFact" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CustomerFact" ADD COLUMN IF NOT EXISTS "classification" TEXT NOT NULL DEFAULT 'general';
ALTER TABLE "CustomerFact" ADD COLUMN IF NOT EXISTS "provenance" TEXT;
ALTER TABLE "CustomerFact" ADD COLUMN IF NOT EXISTS "staleAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "CustomerFact_key_numericValue_idx" ON "CustomerFact"("key", "numericValue");

ALTER TABLE "CustomerSegment" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'dynamic';
ALTER TABLE "CustomerSegment" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CustomerSegment" ADD COLUMN IF NOT EXISTS "history" JSONB;
ALTER TABLE "CustomerSegment" ADD COLUMN IF NOT EXISTS "memberIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "objective" TEXT NOT NULL DEFAULT 'retain';
ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'email';
ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "templateId" TEXT;
ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "promotionId" TEXT;
ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "eligibility" JSONB;
ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3);
ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3);
ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "budgetCents" INTEGER;
ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "frequencyHours" INTEGER;
ALTER TABLE "MarketingCampaign" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Promotion" ADD COLUMN IF NOT EXISTS "segmentId" TEXT;
ALTER TABLE "Promotion" ADD COLUMN IF NOT EXISTS "firstPurchaseOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Promotion" ADD COLUMN IF NOT EXISTS "assignedUserId" TEXT;
ALTER TABLE "Promotion" ADD COLUMN IF NOT EXISTS "privateCode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Promotion" ADD COLUMN IF NOT EXISTS "stacking" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Promotion" ADD COLUMN IF NOT EXISTS "budgetCents" INTEGER;
ALTER TABLE "Promotion" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Promotion" ADD COLUMN IF NOT EXISTS "familySlug" TEXT;
ALTER TABLE "Promotion" ADD COLUMN IF NOT EXISTS "recurringPeriods" INTEGER;
CREATE INDEX IF NOT EXISTS "Promotion_segmentId_idx" ON "Promotion"("segmentId");

CREATE TABLE IF NOT EXISTS "MarketingTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'email',
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CampaignSend" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "consent" BOOLEAN NOT NULL,
  "skipReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignSend_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CrmTask" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "assigneeId" TEXT,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "dueAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CrmOpportunity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "family" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmOpportunity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketingAutomation" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "trigger" TEXT NOT NULL,
  "graph" JSONB NOT NULL,
  "segmentId" TEXT,
  "paused" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingAutomation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutomationRun" (
  "id" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL DEFAULT 'start',
  "status" TEXT NOT NULL DEFAULT 'running',
  "waitUntil" TIMESTAMP(3),
  "lastError" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RiskEvaluation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "level" TEXT NOT NULL,
  "signals" JSONB NOT NULL,
  "shadow" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RiskEvaluation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RiskOverride" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "signalId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RiskOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CampaignSend_campaignId_userId_key" ON "CampaignSend"("campaignId", "userId");
CREATE INDEX IF NOT EXISTS "CampaignSend_campaignId_status_idx" ON "CampaignSend"("campaignId", "status");
CREATE INDEX IF NOT EXISTS "CrmTask_userId_status_idx" ON "CrmTask"("userId", "status");
CREATE INDEX IF NOT EXISTS "CrmTask_assigneeId_status_idx" ON "CrmTask"("assigneeId", "status");
CREATE INDEX IF NOT EXISTS "CrmOpportunity_userId_status_idx" ON "CrmOpportunity"("userId", "status");
CREATE INDEX IF NOT EXISTS "MarketingAutomation_trigger_status_idx" ON "MarketingAutomation"("trigger", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "AutomationRun_automationId_userId_eventId_key" ON "AutomationRun"("automationId", "userId", "eventId");
CREATE INDEX IF NOT EXISTS "AutomationRun_status_waitUntil_idx" ON "AutomationRun"("status", "waitUntil");
CREATE INDEX IF NOT EXISTS "RiskEvaluation_userId_createdAt_idx" ON "RiskEvaluation"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "RiskEvaluation_level_createdAt_idx" ON "RiskEvaluation"("level", "createdAt");
CREATE INDEX IF NOT EXISTS "RiskOverride_userId_createdAt_idx" ON "RiskOverride"("userId", "createdAt");

ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MarketingTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "CustomerSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampaignSend" ADD CONSTRAINT "CampaignSend_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignSend" ADD CONSTRAINT "CampaignSend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingTemplate" ADD CONSTRAINT "MarketingTemplate_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingAutomation" ADD CONSTRAINT "MarketingAutomation_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MarketingAutomation" ADD CONSTRAINT "MarketingAutomation_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "CustomerSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "MarketingAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RiskEvaluation" ADD CONSTRAINT "RiskEvaluation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RiskOverride" ADD CONSTRAINT "RiskOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
