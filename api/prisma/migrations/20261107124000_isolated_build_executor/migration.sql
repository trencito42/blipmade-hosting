ALTER TABLE "IsolatedBuildJob"
  ADD COLUMN "runtime" TEXT,
  ADD COLUMN "inputSha256" TEXT,
  ADD COLUMN "artifactSha256" TEXT,
  ADD COLUMN "artifactBytes" BYTEA,
  ADD COLUMN "artifactBytesLength" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "finishedAt" TIMESTAMP(3);
