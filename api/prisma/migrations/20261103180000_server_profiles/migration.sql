CREATE TABLE "ServerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "ram" INTEGER NOT NULL,
    "cpu" DOUBLE PRECISION NOT NULL,
    "disk" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerProfile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServerProfile_instanceId_createdAt_idx" ON "ServerProfile"("instanceId", "createdAt");

ALTER TABLE "ServerProfile" ADD CONSTRAINT "ServerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServerProfile" ADD CONSTRAINT "ServerProfile_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
