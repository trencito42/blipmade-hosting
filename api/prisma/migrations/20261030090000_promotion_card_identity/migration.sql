ALTER TABLE "PromotionRedemption"
ADD COLUMN "cardFingerprintHash" TEXT;

CREATE UNIQUE INDEX "PromotionRedemption_promotionId_cardFingerprintHash_key"
ON "PromotionRedemption"("promotionId", "cardFingerprintHash");
