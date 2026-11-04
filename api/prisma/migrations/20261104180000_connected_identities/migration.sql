-- OAuth-only accounts: password is optional; never invent a password for social sign-up.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE TABLE "ConnectedIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "emailSnapshot" TEXT,
    "refreshTokenSealed" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ConnectedIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OAuthTransaction" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "codeVerifier" TEXT,
    "nonce" TEXT,
    "userId" TEXT,
    "returnTo" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GitHubAppInstallation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "repositorySelection" TEXT NOT NULL DEFAULT 'selected',
    "suspendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubAppInstallation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GitHubAuthorizedRepository" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubAuthorizedRepository_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscordCommunityLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3),
    "syncState" TEXT NOT NULL DEFAULT 'pending',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "rolesSynced" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordCommunityLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscordRoleMapping" (
    "id" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "discordRoleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordRoleMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GitHubWebhookDelivery" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubWebhookDelivery_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ImportSource" ADD COLUMN "githubInstallationId" TEXT;
ALTER TABLE "ImportSource" ADD COLUMN "githubRepositoryId" TEXT;
ALTER TABLE "ImportSource" ADD COLUMN "githubRepositoryFullName" TEXT;

CREATE UNIQUE INDEX "ConnectedIdentity_provider_providerUserId_key" ON "ConnectedIdentity"("provider", "providerUserId");
CREATE INDEX "ConnectedIdentity_userId_provider_idx" ON "ConnectedIdentity"("userId", "provider");

CREATE UNIQUE INDEX "OAuthTransaction_stateHash_key" ON "OAuthTransaction"("stateHash");
CREATE INDEX "OAuthTransaction_expiresAt_idx" ON "OAuthTransaction"("expiresAt");

CREATE UNIQUE INDEX "GitHubAppInstallation_installationId_key" ON "GitHubAppInstallation"("installationId");
CREATE INDEX "GitHubAppInstallation_userId_idx" ON "GitHubAppInstallation"("userId");

CREATE UNIQUE INDEX "GitHubAuthorizedRepository_installationId_repositoryId_key" ON "GitHubAuthorizedRepository"("installationId", "repositoryId");
CREATE INDEX "GitHubAuthorizedRepository_fullName_idx" ON "GitHubAuthorizedRepository"("fullName");

CREATE UNIQUE INDEX "DiscordCommunityLink_userId_key" ON "DiscordCommunityLink"("userId");
CREATE UNIQUE INDEX "DiscordCommunityLink_discordUserId_key" ON "DiscordCommunityLink"("discordUserId");

CREATE UNIQUE INDEX "DiscordRoleMapping_ruleKey_key" ON "DiscordRoleMapping"("ruleKey");

CREATE INDEX "GitHubWebhookDelivery_processedAt_idx" ON "GitHubWebhookDelivery"("processedAt");

ALTER TABLE "ConnectedIdentity" ADD CONSTRAINT "ConnectedIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GitHubAppInstallation" ADD CONSTRAINT "GitHubAppInstallation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GitHubAuthorizedRepository" ADD CONSTRAINT "GitHubAuthorizedRepository_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "GitHubAppInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscordCommunityLink" ADD CONSTRAINT "DiscordCommunityLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportSource" ADD CONSTRAINT "ImportSource_githubInstallationId_fkey" FOREIGN KEY ("githubInstallationId") REFERENCES "GitHubAppInstallation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
