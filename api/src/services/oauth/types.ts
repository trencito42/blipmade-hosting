export type OAuthProviderId = 'github' | 'google' | 'discord' | 'apple';

export type OAuthIntent = 'login' | 'link' | 'github_app_install';

export interface ProviderProfile {
  provider: OAuthProviderId;
  providerUserId: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
  emailVerified: boolean;
  givenName: string | null;
  familyName: string | null;
}

export interface ProviderPublicStatus {
  id: OAuthProviderId;
  label: string;
  enabled: boolean;
  login: boolean;
}
