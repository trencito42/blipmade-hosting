-- One Stripe subscription can cover several order lines, so the subscription id
-- stops being unique and the Stripe subscription *item* identifies the line.

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "stripeSubscriptionItemId" TEXT;

-- AlterTable
ALTER TABLE "Instance" ADD COLUMN "orderItemId" TEXT;

-- AlterTable
ALTER TABLE "Promotion" ADD COLUMN "maxPerUser" INTEGER;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "healthProbe" JSONB;

-- DropIndex
DROP INDEX "Subscription_stripeSubscriptionId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionItemId_key" ON "Subscription"("stripeSubscriptionItemId");

-- CreateIndex
CREATE INDEX "Subscription_stripeSubscriptionId_idx" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Instance_orderItemId_idx" ON "Instance"("orderItemId");

-- AddForeignKey
ALTER TABLE "Instance" ADD CONSTRAINT "Instance_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
