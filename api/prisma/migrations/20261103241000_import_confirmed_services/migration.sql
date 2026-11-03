ALTER TABLE "ImportSource" ADD COLUMN "confirmedServices" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ImportSource" ADD COLUMN "servicesLinkedAt" TIMESTAMP(3);
