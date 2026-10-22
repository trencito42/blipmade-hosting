-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pterodactylPasswordEnc" TEXT,
ADD COLUMN     "pterodactylPasswordSetAt" TIMESTAMP(3);
