-- Legacy drills wrote restoreVerifiedAt after decrypt/listing. Keep those timestamps.
-- isolatedRestore stays false, so Admin cannot treat them as an isolated restore.
ALTER TABLE "OffsiteBackup" ADD COLUMN "isolatedRestore" BOOLEAN NOT NULL DEFAULT false;

-- Copy the drill timestamp into decrypt evidence when that column is empty.
UPDATE "OffsiteBackup"
SET "decryptVerifiedAt" = "restoreVerifiedAt"
WHERE "restoreVerifiedAt" IS NOT NULL
  AND "decryptVerifiedAt" IS NULL
  AND "isolatedRestore" = false;
