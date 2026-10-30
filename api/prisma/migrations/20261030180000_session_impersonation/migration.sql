-- A session opened by a member of the staff to act as a customer. It is short, it is
-- marked, and the sensitive routes refuse it.
ALTER TABLE "Session" ADD COLUMN "impersonatedById" TEXT;
ALTER TABLE "Session" ADD COLUMN "impersonatedByEmail" TEXT;
