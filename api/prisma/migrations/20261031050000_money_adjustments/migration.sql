-- Credits given to a customer and partial refunds, written by the staff. Every one is a row, so the
-- money that moved can be read back, and the sum of the refunds of an order can be capped.
CREATE TABLE "MoneyAdjustment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "reason" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MoneyAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MoneyAdjustment_userId_createdAt_idx" ON "MoneyAdjustment"("userId", "createdAt");
CREATE INDEX "MoneyAdjustment_orderId_idx" ON "MoneyAdjustment"("orderId");
