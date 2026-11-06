-- Catalogue install spec, profile manifests, add-on jobs, CRM, SaaS hostnames,
-- registrar lifecycle and isolated import builds. Additive only.

ALTER TABLE "CatalogAddonDefinition" ADD COLUMN "installSpec" JSONB;
ALTER TABLE "ServerProfile" ADD COLUMN "manifest" JSONB;

CREATE TABLE "InstanceAddonJob" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "addonSlug" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "backupRequired" BOOLEAN NOT NULL DEFAULT true,
    "backupOk" BOOLEAN NOT NULL DEFAULT false,
    "writes" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "idempotencyKey" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InstanceAddonJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InstanceAddonJob_instanceId_idempotencyKey_key" ON "InstanceAddonJob"("instanceId", "idempotencyKey");
CREATE INDEX "InstanceAddonJob_instanceId_createdAt_idx" ON "InstanceAddonJob"("instanceId", "createdAt");
ALTER TABLE "InstanceAddonJob" ADD CONSTRAINT "InstanceAddonJob_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CustomerFact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerFact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerFact_userId_key_key" ON "CustomerFact"("userId", "key");
CREATE INDEX "CustomerFact_key_value_idx" ON "CustomerFact"("key", "value");
ALTER TABLE "CustomerFact" ADD CONSTRAINT "CustomerFact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CustomerSegment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filter" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerSegment_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "CustomerSegment" ADD CONSTRAINT "CustomerSegment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "body" TEXT NOT NULL,
    "segmentId" TEXT,
    "createdBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "suppressed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MarketingCampaign_status_createdAt_idx" ON "MarketingCampaign"("status", "createdAt");
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "CustomerSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SaasCustomHostname" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'draft',
    "providerId" TEXT,
    "lastError" TEXT,
    "certificate" TEXT NOT NULL DEFAULT 'unknown',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SaasCustomHostname_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SaasCustomHostname_hostname_key" ON "SaasCustomHostname"("hostname");
CREATE INDEX "SaasCustomHostname_userId_state_idx" ON "SaasCustomHostname"("userId", "state");
ALTER TABLE "SaasCustomHostname" ADD CONSTRAINT "SaasCustomHostname_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DomainRegistration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "amount" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "providerId" TEXT NOT NULL,
    "externalId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DomainRegistration_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DomainRegistration_userId_createdAt_idx" ON "DomainRegistration"("userId", "createdAt");
CREATE INDEX "DomainRegistration_domain_state_idx" ON "DomainRegistration"("domain", "state");
ALTER TABLE "DomainRegistration" ADD CONSTRAINT "DomainRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "IsolatedBuildJob" (
    "id" TEXT NOT NULL,
    "importSourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "buildCommand" TEXT NOT NULL,
    "startCommand" TEXT NOT NULL,
    "sandboxHost" TEXT,
    "log" TEXT NOT NULL DEFAULT '',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IsolatedBuildJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IsolatedBuildJob_importSourceId_createdAt_idx" ON "IsolatedBuildJob"("importSourceId", "createdAt");
ALTER TABLE "IsolatedBuildJob" ADD CONSTRAINT "IsolatedBuildJob_importSourceId_fkey" FOREIGN KEY ("importSourceId") REFERENCES "ImportSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
