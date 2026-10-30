-- The operating system a VPS was built from. Every server so far is Debian 13.
ALTER TABLE "VpsService" ADD COLUMN "image" TEXT NOT NULL DEFAULT 'debian-13';
