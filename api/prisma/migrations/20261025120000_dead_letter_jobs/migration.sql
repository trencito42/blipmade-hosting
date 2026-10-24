-- The jobs of a queue that were given up on.
--
-- The queue keeps a failed job only for a while and then forgets it, so the
-- failure is written here as well. The row holds what is needed to read the
-- failure and to put the job back on its queue, and it survives the end of the
-- job in the queue.
--
-- The table is additive: nothing that existed before depends on it, and it can
-- be dropped again with
--
--   DROP TABLE "DeadLetterJob";
--   DROP TYPE "DeadLetterState";
--
-- The unique index on the queue and the name of the job is what makes the
-- write of a failure safe to repeat: the same failure is written twice, it is
-- still one row.
-- The state of a job that was given up on.
--
-- CREATE TYPE has no IF NOT EXISTS, so the type is created through a block
-- that ignores the error of a type that is already there. The migration can
-- then be applied twice without failing.
DO $$ BEGIN
  CREATE TYPE "DeadLetterState" AS ENUM ('pending', 'requeued', 'resolved');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "DeadLetterJob" (
  "id" TEXT NOT NULL,
  "queue" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "payload" JSONB,
  "error" TEXT NOT NULL,
  "errorClass" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "state" "DeadLetterState" NOT NULL DEFAULT 'pending',
  "requeuedAt" TIMESTAMP(3),
  "requeuedBy" TEXT,
  "requeueCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- The moment the row was written for the last time. There is no default on
  -- purpose: the column is written by the application on every change, the
  -- same way every other table of the platform does it.
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DeadLetterJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeadLetterJob_queue_jobId_key"
  ON "DeadLetterJob"("queue", "jobId");

-- The list of the failures that are still open is read by the state and by
-- the moment they failed.
CREATE INDEX IF NOT EXISTS "DeadLetterJob_state_failedAt_idx"
  ON "DeadLetterJob"("state", "failedAt");
