ALTER TABLE "ServerProfile"
  ADD COLUMN "snapshot" JSONB,
  ADD COLUMN "snapshotVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "snapshotSha256" TEXT;

CREATE TABLE "ServerProfileActivationJob" (
  "id" TEXT NOT NULL,
  "instanceId" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "activeKey" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "step" TEXT NOT NULL DEFAULT 'queued',
  "snapshotSha256" TEXT NOT NULL,
  "backupUuid" TEXT,
  "backupSha256" TEXT,
  "error" TEXT,
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServerProfileActivationJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServerProfileActivationJob_activeKey_key" ON "ServerProfileActivationJob"("activeKey");
CREATE UNIQUE INDEX "ServerProfileActivationJob_instanceId_idempotencyKey_key" ON "ServerProfileActivationJob"("instanceId", "idempotencyKey");
CREATE INDEX "ServerProfileActivationJob_instanceId_createdAt_idx" ON "ServerProfileActivationJob"("instanceId", "createdAt");
CREATE INDEX "ServerProfileActivationJob_status_updatedAt_idx" ON "ServerProfileActivationJob"("status", "updatedAt");

ALTER TABLE "ServerProfileActivationJob"
  ADD CONSTRAINT "ServerProfileActivationJob_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ServerProfileActivationJob_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ServerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
