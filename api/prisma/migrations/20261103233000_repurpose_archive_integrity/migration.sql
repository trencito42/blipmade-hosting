-- AlterTable
ALTER TABLE "RepurposeJob" ADD COLUMN "sha256" TEXT,
ADD COLUMN "archiveBytes" INTEGER,
ADD COLUMN "archiveEntries" INTEGER,
ADD COLUMN "rollback" JSONB;
