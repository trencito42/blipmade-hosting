-- The moment a session was last used.
--
-- The column is nullable and nothing is written over: the sessions that are
-- already there keep the values they have, and a session that is never used
-- again keeps an empty value. The column is written at most once every five
-- minutes for every session, so the write does not follow every request.
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);

-- The list of the sessions of an account is read by the account and ordered by
-- the moment the session was opened.
CREATE INDEX IF NOT EXISTS "Session_userId_createdAt_idx"
  ON "Session"("userId", "createdAt");
