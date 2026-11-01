-- The editable words of the public site, with a draft, a published version and a history.
CREATE TABLE "ContentRevision" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "note" TEXT,
    "authorId" TEXT,
    "authorEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "ContentRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentRevision_key_status_createdAt_idx" ON "ContentRevision"("key", "status", "createdAt");
