-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isGuest" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SupportGuestToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportGuestToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportGuestToken_tokenHash_key" ON "SupportGuestToken"("tokenHash");

-- CreateIndex
CREATE INDEX "SupportGuestToken_userId_idx" ON "SupportGuestToken"("userId");

-- CreateIndex
CREATE INDEX "SupportGuestToken_expiresAt_idx" ON "SupportGuestToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "SupportGuestToken" ADD CONSTRAINT "SupportGuestToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

