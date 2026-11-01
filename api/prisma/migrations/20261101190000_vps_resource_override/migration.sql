-- A free adjustment of the resources of a VPS is recorded on the server, so a size that differs from the plan is a known decision.
ALTER TABLE "VpsService" ADD COLUMN "resourceOverride" JSONB;
