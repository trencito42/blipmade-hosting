-- One row per encrypted copy that left a node or the hypervisor for the independent storage box. A row says what
-- the agent measured: it is "verified" only after the copy was read back from the destination and matched.
CREATE TYPE "OffsiteKind" AS ENUM ('CUSTOMER', 'DATABASE', 'VPS', 'PLATFORM');
CREATE TYPE "OffsiteState" AS ENUM ('OFFSITE_PENDING', 'OFFSITE_VERIFIED', 'FAILED');

CREATE TABLE "OffsiteBackup" (
    "id" TEXT NOT NULL,
    "kind" "OffsiteKind" NOT NULL,
    "remotePath" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "instanceId" TEXT,
    "node" TEXT,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "sha256" TEXT,
    "state" "OffsiteState" NOT NULL DEFAULT 'OFFSITE_PENDING',
    "error" TEXT,
    "takenAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "restoreVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OffsiteBackup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OffsiteBackup_remotePath_key" ON "OffsiteBackup"("remotePath");
CREATE INDEX "OffsiteBackup_kind_state_idx" ON "OffsiteBackup"("kind", "state");
CREATE INDEX "OffsiteBackup_instanceId_idx" ON "OffsiteBackup"("instanceId");
CREATE INDEX "OffsiteBackup_sourceId_idx" ON "OffsiteBackup"("sourceId");
ALTER TABLE "OffsiteBackup" ADD CONSTRAINT "OffsiteBackup_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
