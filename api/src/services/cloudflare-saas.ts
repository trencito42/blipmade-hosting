/**
 * Cloudflare for SaaS custom-hostname lifecycle, without buying a plan.
 * States exist so Admin can diagnose. Live Cloudflare SaaS APIs are not called
 * until CF_SAAS_ENABLED is on and the account actually includes the product.
 */

export type SaasHostnameState = 'draft' | 'pending_dns' | 'pending_certificate' | 'active' | 'blocked' | 'disabled';

export interface SaasHostname {
  hostname: string;
  state: SaasHostnameState;
  fallback: string;
  apex: boolean;
  note: string;
}

export function cloudflareSaasEnabled(): boolean {
  return process.env.CF_SAAS_ENABLED === 'true';
}

export function saasPlan(hostname: string, fallback: string): SaasHostname {
  const host = hostname.trim().toLowerCase();
  const apex = host.split('.').length === 2;
  if (!cloudflareSaasEnabled()) {
    return {
      hostname: host,
      state: 'disabled',
      fallback,
      apex,
      note: apex
        ? 'Apex custom hostnames need Cloudflare for SaaS plus an entitlement Blipmade does not have. Keep the Caddy custom-domain path.'
        : 'Cloudflare for SaaS is off. Custom hostnames keep using the existing Caddy + TXT verification path.',
    };
  }
  return {
    hostname: host,
    state: 'pending_dns',
    fallback,
    apex,
    note: apex
      ? 'Apex proxying is an Enterprise add-on. Do not promise it until the account includes it.'
      : 'SaaS hostname is pending DNS validation. No paid hostname was created.',
  };
}
