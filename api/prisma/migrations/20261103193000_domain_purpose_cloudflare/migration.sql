ALTER TABLE "InstanceDomain" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'http';
ALTER TABLE "InstanceDomain" ADD COLUMN "gameAddress" TEXT;
ALTER TABLE "InstanceDomain" ADD COLUMN "srvPort" INTEGER;

CREATE TABLE "CloudflareZoneLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "zoneName" TEXT NOT NULL,
    "tokenSealed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloudflareZoneLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CloudflareZoneLink_userId_key" ON "CloudflareZoneLink"("userId");

ALTER TABLE "CloudflareZoneLink" ADD CONSTRAINT "CloudflareZoneLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
