-- One keyed hash of a browser identifier per account and device. The identifier itself and the signals it came from are never stored.
CREATE TABLE "DeviceSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceSignal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeviceSignal_userId_hash_key" ON "DeviceSignal"("userId", "hash");
CREATE INDEX "DeviceSignal_hash_idx" ON "DeviceSignal"("hash");
CREATE INDEX "DeviceSignal_createdAt_idx" ON "DeviceSignal"("createdAt");
ALTER TABLE "DeviceSignal" ADD CONSTRAINT "DeviceSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
