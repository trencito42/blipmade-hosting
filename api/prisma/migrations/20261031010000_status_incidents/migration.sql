-- The history of the checks behind the public status page, the journal of incidents and the
-- announcements shown in the dashboard (maintenance, news).
CREATE TABLE "StatusCheck" (
    "id" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StatusCheck_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StatusCheck_component_createdAt_idx" ON "StatusCheck"("component", "createdAt");
CREATE INDEX "StatusCheck_createdAt_idx" ON "StatusCheck"("createdAt");

CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'investigating',
    "impact" TEXT NOT NULL DEFAULT 'minor',
    "components" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Incident_startedAt_idx" ON "Incident"("startedAt");
CREATE INDEX "Incident_resolvedAt_idx" ON "Incident"("resolvedAt");

CREATE TABLE "IncidentUpdate" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncidentUpdate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IncidentUpdate_incidentId_idx" ON "IncidentUpdate"("incidentId");
ALTER TABLE "IncidentUpdate" ADD CONSTRAINT "IncidentUpdate_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Announcement_active_startsAt_idx" ON "Announcement"("active", "startsAt");
