CREATE TABLE "AdminSavedView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSavedView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminSavedView_userId_scope_name_key" ON "AdminSavedView"("userId", "scope", "name");
CREATE INDEX "AdminSavedView_userId_scope_createdAt_idx" ON "AdminSavedView"("userId", "scope", "createdAt");

ALTER TABLE "AdminSavedView" ADD CONSTRAINT "AdminSavedView_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
