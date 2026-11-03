-- CreateTable
CREATE TABLE "RepurposeJob" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "fromProductId" TEXT NOT NULL,
    "toProductId" TEXT NOT NULL,
    "backupUuid" TEXT,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepurposeJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepurposeJob_instanceId_createdAt_idx" ON "RepurposeJob"("instanceId", "createdAt");

-- AddForeignKey
ALTER TABLE "RepurposeJob" ADD CONSTRAINT "RepurposeJob_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
