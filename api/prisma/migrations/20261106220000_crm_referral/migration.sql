ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode");

CREATE TABLE IF NOT EXISTS "ReferralAttribution" (
  "id" TEXT NOT NULL,
  "referrerId" TEXT NOT NULL,
  "referredId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "orderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferralAttribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReferralAttribution_referredId_key" ON "ReferralAttribution"("referredId");
CREATE INDEX IF NOT EXISTS "ReferralAttribution_referrerId_status_idx" ON "ReferralAttribution"("referrerId", "status");
CREATE INDEX IF NOT EXISTS "ReferralAttribution_orderId_idx" ON "ReferralAttribution"("orderId");

ALTER TABLE "ReferralAttribution" DROP CONSTRAINT IF EXISTS "ReferralAttribution_referrerId_fkey";
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferralAttribution" DROP CONSTRAINT IF EXISTS "ReferralAttribution_referredId_fkey";
ALTER TABLE "ReferralAttribution" ADD CONSTRAINT "ReferralAttribution_referredId_fkey" FOREIGN KEY ("referredId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
