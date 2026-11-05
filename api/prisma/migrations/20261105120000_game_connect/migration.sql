-- Smart Connect: a clean hostname for a game server (A + SRV in the platform zone), and the service label of the SRV
-- record of a customer's own game domain. Both are additive.
ALTER TABLE "InstanceDomain" ADD COLUMN "srvService" TEXT;

CREATE TABLE "GameConnect" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT,
    "label" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING_DNS',
    "publicAddress" TEXT,
    "port" INTEGER,
    "aRecordId" TEXT,
    "srvRecordId" TEXT,
    "lastError" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "clientVerifiedAt" TIMESTAMP(3),
    "removeRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GameConnect_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GameConnect_instanceId_key" ON "GameConnect"("instanceId");
CREATE UNIQUE INDEX "GameConnect_label_key" ON "GameConnect"("label");
CREATE INDEX "GameConnect_state_idx" ON "GameConnect"("state");
-- The row outlives the instance on purpose: the records are removed first, then the row.
ALTER TABLE "GameConnect" ADD CONSTRAINT "GameConnect_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
