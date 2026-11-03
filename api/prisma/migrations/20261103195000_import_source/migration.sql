-- CreateTable
CREATE TABLE "ImportSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "repoUrl" TEXT,
    "branch" TEXT,
    "buildCommand" TEXT NOT NULL DEFAULT '',
    "startCommand" TEXT NOT NULL,
    "zipBytes" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "ImportSource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportSource_userId_createdAt_idx" ON "ImportSource"("userId", "createdAt");

ALTER TABLE "ImportSource" ADD CONSTRAINT "ImportSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
