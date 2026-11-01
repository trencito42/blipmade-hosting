-- The owner of a service can ask to be told when its memory or disk use passes a percentage of the plan.
ALTER TABLE "Instance" ADD COLUMN "alertMemoryPercent" INTEGER;
ALTER TABLE "Instance" ADD COLUMN "alertDiskPercent" INTEGER;
ALTER TABLE "Instance" ADD COLUMN "resourceAlertedAt" TIMESTAMP(3);
