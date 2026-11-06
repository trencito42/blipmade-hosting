-- Decrypt + archive integrity is not a restore. Keep restoreVerifiedAt for isolated restores only.
ALTER TABLE "OffsiteBackup" ADD COLUMN "decryptVerifiedAt" TIMESTAMP(3);
