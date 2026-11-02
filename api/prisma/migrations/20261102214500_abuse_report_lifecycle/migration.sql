-- The life of a report of abuse: the state of the case, the enforcement that
-- was made on the service of the report, and the internal notes of the staff.
--
-- The enforcement is kept apart from the state of the case, because the two
-- are two facts: a case can be closed without anything being done to the
-- service, and a service can be suspended while the case is still open.
ALTER TABLE "AbuseReport" ADD COLUMN "enforcement" TEXT;
ALTER TABLE "AbuseReport" ADD COLUMN "enforcementAt" TIMESTAMP(3);
ALTER TABLE "AbuseReport" ADD COLUMN "enforcedBy" TEXT;
ALTER TABLE "AbuseReport" ADD COLUMN "reopenedAt" TIMESTAMP(3);
CREATE INDEX "AbuseReport_instanceId_idx" ON "AbuseReport"("instanceId");

-- The cases that were closed after an action was taken are closed cases: their
-- state becomes "resolved". The text of the resolution is kept, and nothing is
-- deleted. The old value is still read as "resolved" by the server, so a
-- database that was not migrated yet still shows the right thing.
UPDATE "AbuseReport" SET "status" = 'resolved' WHERE "status" = 'action_taken';

-- The internal notes of the staff on a report. They stay inside the staff
-- area: the reporter never reads them and the customer never sees them.
CREATE TABLE "AbuseReportNote" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorEmail" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AbuseReportNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AbuseReportNote_reportId_createdAt_idx" ON "AbuseReportNote"("reportId", "createdAt");
ALTER TABLE "AbuseReportNote" ADD CONSTRAINT "AbuseReportNote_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "AbuseReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
