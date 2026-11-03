-- AlterTable
ALTER TABLE "Instance" ADD COLUMN "infrastructureReadyAt" TIMESTAMP(3),
ADD COLUMN "applicationReadyAt" TIMESTAMP(3),
ADD COLUMN "applicationError" TEXT;

-- Existing online servers had no separate application check. They stay ready
-- unless an import is still waiting, so a later sync does not unfulfill them.
UPDATE "Instance" SET "infrastructureReadyAt" = "updatedAt" WHERE "status" = 'ONLINE' AND "infrastructureReadyAt" IS NULL;
UPDATE "Instance" AS i SET "applicationReadyAt" = i."updatedAt"
WHERE i."status" = 'ONLINE' AND i."applicationReadyAt" IS NULL
AND NOT EXISTS (
  SELECT 1 FROM "OrderItem" AS oi
  JOIN "ImportSource" AS s ON s."id" = oi."config"->>'importSourceId'
  WHERE oi."id" = i."orderItemId" AND s."appliedAt" IS NULL
);

-- AlterTable
ALTER TABLE "InstanceDomain" ADD COLUMN "tlsStatus" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "applicationStatus" TEXT NOT NULL DEFAULT 'unknown';

-- AlterTable
ALTER TABLE "ImportSource" ADD COLUMN "instanceId" TEXT,
ADD COLUMN "zipBytesLength" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "zipExpiresAt" TIMESTAMP(3),
ADD COLUMN "phase" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "deployId" TEXT,
ADD COLUMN "lastError" TEXT,
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

UPDATE "ImportSource" SET "zipBytesLength" = octet_length("zipBytes") WHERE "zipBytes" IS NOT NULL;
UPDATE "ImportSource" SET "zipExpiresAt" = "createdAt" + interval '24 hours' WHERE "zipBytes" IS NOT NULL AND "appliedAt" IS NULL;
UPDATE "ImportSource" SET "phase" = 'applied' WHERE "appliedAt" IS NOT NULL;
UPDATE "ImportSource" SET "zipBytes" = NULL, "zipBytesLength" = 0 WHERE "appliedAt" IS NOT NULL;

-- CreateIndex
CREATE INDEX "ImportSource_phase_appliedAt_idx" ON "ImportSource"("phase", "appliedAt");

-- CreateTable
CREATE TABLE "DnsApproval" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "diff" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DnsApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DnsRecordGrant" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "cloudflareId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DnsRecordGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DnsApproval_domainId_createdAt_idx" ON "DnsApproval"("domainId", "createdAt");

-- CreateIndex
CREATE INDEX "DnsRecordGrant_domainId_idx" ON "DnsRecordGrant"("domainId");

-- CreateIndex
CREATE UNIQUE INDEX "DnsRecordGrant_zoneId_cloudflareId_key" ON "DnsRecordGrant"("zoneId", "cloudflareId");

-- AddForeignKey
ALTER TABLE "DnsApproval" ADD CONSTRAINT "DnsApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DnsApproval" ADD CONSTRAINT "DnsApproval_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "InstanceDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DnsRecordGrant" ADD CONSTRAINT "DnsRecordGrant_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "InstanceDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
