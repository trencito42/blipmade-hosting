-- The virtual private servers of the customers.
CREATE TYPE "VpsStatus" AS ENUM ('PENDING', 'PROVISIONING', 'ACTIVE', 'FAILED', 'SUSPENDED', 'CANCELLED');

CREATE TABLE "VpsService" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "name" TEXT NOT NULL,
    "status" "VpsStatus" NOT NULL DEFAULT 'PENDING',
    "slot" INTEGER NOT NULL,
    "vmid" INTEGER,
    "privateIp" TEXT,
    "publicIp" TEXT,
    "sshPort" INTEGER,
    "dedicatedIp" BOOLEAN NOT NULL DEFAULT false,
    "ram" INTEGER NOT NULL,
    "cpu" INTEGER NOT NULL,
    "disk" INTEGER NOT NULL,
    "sshPublicKey" TEXT NOT NULL,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VpsService_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VpsService_orderItemId_key" ON "VpsService"("orderItemId");
CREATE UNIQUE INDEX "VpsService_subscriptionId_key" ON "VpsService"("subscriptionId");
CREATE UNIQUE INDEX "VpsService_slot_key" ON "VpsService"("slot");
CREATE INDEX "VpsService_userId_idx" ON "VpsService"("userId");
CREATE INDEX "VpsService_status_idx" ON "VpsService"("status");

ALTER TABLE "VpsService" ADD CONSTRAINT "VpsService_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VpsService" ADD CONSTRAINT "VpsService_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VpsService" ADD CONSTRAINT "VpsService_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VpsService" ADD CONSTRAINT "VpsService_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
