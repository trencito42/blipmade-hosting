-- One row per minute per running service: was it serving. The uptime figures are counted from these rows.
CREATE TABLE "InstanceCheck" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "up" BOOLEAN NOT NULL,
    CONSTRAINT "InstanceCheck_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InstanceCheck_instanceId_at_idx" ON "InstanceCheck"("instanceId", "at");
ALTER TABLE "InstanceCheck" ADD CONSTRAINT "InstanceCheck_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Instance" ADD COLUMN "alertsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Instance" ADD COLUMN "downSince" TIMESTAMP(3);
ALTER TABLE "Instance" ADD COLUMN "downAlertedAt" TIMESTAMP(3);
