-- Commerce hardening: fulfilment state, per-item subscriptions, promotion
-- redemptions at payment time, webhook processing states, provisioning
-- resume point, domain ownership proof and real ticket attachments.

-- CreateEnum
CREATE TYPE "OrderKind" AS ENUM ('NEW', 'UPGRADE');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('NOT_STARTED', 'PROVISIONING', 'FULFILLED', 'FAILED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "kind" "OrderKind" NOT NULL DEFAULT 'NEW',
ADD COLUMN "instanceId" TEXT,
ADD COLUMN "requestedConfig" JSONB,
ADD COLUMN "fulfillmentStatus" "FulfillmentStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "promotionRedeemedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "orderItemId" TEXT,
ADD COLUMN "lastRenewalCheckAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "stripeSubscriptionId" TEXT,
ADD COLUMN "stripeInvoiceId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "stripeSubscriptionId" TEXT,
ADD COLUMN "stripeCustomerId" TEXT;

-- AlterTable
ALTER TABLE "WebhookEvent" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'received',
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastAttemptAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Instance" ADD COLUMN "provisionStep" TEXT,
ADD COLUMN "provisionLockAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InstanceDomain" ADD COLUMN "verificationHost" TEXT,
ADD COLUMN "verifiedAt" TIMESTAMP(3),
ADD COLUMN "claimedByUserId" TEXT;

-- AlterTable
ALTER TABLE "TicketMessage" ADD COLUMN "attachmentMeta" JSONB;

-- CreateTable
CREATE TABLE "PromotionRedemption" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "ticketMessageId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_orderItemId_key" ON "Subscription"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeInvoiceId_key" ON "Payment"("stripeInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionRedemption_orderId_key" ON "PromotionRedemption"("orderId");

-- CreateIndex
CREATE INDEX "PromotionRedemption_promotionId_userId_idx" ON "PromotionRedemption"("promotionId", "userId");

-- CreateIndex
CREATE INDEX "PromotionRedemption_userId_idx" ON "PromotionRedemption"("userId");

-- CreateIndex
CREATE INDEX "Attachment_ticketMessageId_idx" ON "Attachment"("ticketMessageId");

-- CreateIndex
CREATE INDEX "Attachment_ticketId_idx" ON "Attachment"("ticketId");

-- CreateIndex
CREATE INDEX "Order_instanceId_idx" ON "Order"("instanceId");

-- CreateIndex
CREATE INDEX "Order_kind_idx" ON "Order"("kind");

-- CreateIndex
CREATE INDEX "Subscription_cancelAtPeriodEnd_idx" ON "Subscription"("cancelAtPeriodEnd");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_idx" ON "WebhookEvent"("status");

-- CreateIndex
CREATE INDEX "InstanceDomain_status_idx" ON "InstanceDomain"("status");

-- CreateIndex
CREATE INDEX "Promotion_active_idx" ON "Promotion"("active");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_ticketMessageId_fkey" FOREIGN KEY ("ticketMessageId") REFERENCES "TicketMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
