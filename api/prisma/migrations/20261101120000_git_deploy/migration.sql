-- The Git deployment of an instance: where the code comes from and how it is built and started. The environment
-- variables of the app are NOT here: they are written into the container, where the customer already holds them.
CREATE TABLE "GitDeploy" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "buildCommand" TEXT NOT NULL DEFAULT '',
    "startCommand" TEXT NOT NULL DEFAULT 'npm start',
    "autoDeploy" BOOLEAN NOT NULL DEFAULT false,
    "webhookSecret" TEXT,
    "previousStartup" TEXT,
    "lastDeployAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GitDeploy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GitDeploy_instanceId_key" ON "GitDeploy"("instanceId");
CREATE INDEX "GitDeploy_repoUrl_branch_idx" ON "GitDeploy"("repoUrl", "branch");
ALTER TABLE "GitDeploy" ADD CONSTRAINT "GitDeploy_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "Instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
