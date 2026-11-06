-- One in-flight add-on mutation per instance.
CREATE UNIQUE INDEX "InstanceAddonJob_instance_active" ON "InstanceAddonJob" ("instanceId") WHERE status IN ('pending', 'running');
