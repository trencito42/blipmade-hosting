-- Access to an instance for another account: a code the owner makes, redeemed once, with a role.
CREATE TABLE "InstanceShare" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "userId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstanceShare_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InstanceShare_codeHash_key" ON "InstanceShare"("codeHash");
CREATE INDEX "InstanceShare_instanceId_idx" ON "InstanceShare"("instanceId");
CREATE INDEX "InstanceShare_userId_idx" ON "InstanceShare"("userId");
ALTER TABLE "InstanceShare" ADD CONSTRAINT "InstanceShare_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstanceShare" ADD CONSTRAINT "InstanceShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
