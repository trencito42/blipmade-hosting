/**
 * Cloudflare for SaaS custom-hostname lifecycle, without buying a plan.
 * Live Cloudflare SaaS APIs are not called until CF_SAAS_ENABLED is on and
 * the account actually includes the product. Tests use the in-memory adapter.
 */

export type SaasHostnameState = 'draft' | 'pending_dns' | 'pending_certificate' | 'active' | 'blocked' | 'disabled';

export interface SaasHostname {
  hostname: string;
  state: SaasHostnameState;
  fallback: string;
  apex: boolean;
  note: string;
  providerId?: string | null;
  certificate?: string;
}

export interface SaasAdapter {
  id: string;
  create(hostname: string): Promise<{ id: string; state: SaasHostnameState }>;
  status(id: string): Promise<{ state: SaasHostnameState; certificate: string }>;
  remove(id: string): Promise<void>;
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

export type SaasEvent = 'submit' | 'dns_ok' | 'cert_ok' | 'fail' | 'disable';

export function saasTransition(state: SaasHostnameState, event: SaasEvent): SaasHostnameState | null {
  if (event === 'disable') return 'disabled';
  if (state === 'draft' && event === 'submit') return 'pending_dns';
  if (state === 'pending_dns' && event === 'dns_ok') return 'pending_certificate';
  if (state === 'pending_dns' && event === 'fail') return 'blocked';
  if (state === 'pending_certificate' && event === 'cert_ok') return 'active';
  if (state === 'pending_certificate' && event === 'fail') return 'blocked';
  if (state === 'blocked' && event === 'submit') return 'pending_dns';
  if (state === 'disabled' && event === 'submit') return 'pending_dns';
  return null;
}

/** Deterministic adapter for tests. Never talks to Cloudflare. */
export function memorySaasAdapter(): SaasAdapter & { store: Map<string, { state: SaasHostnameState; certificate: string }> } {
  const store = new Map<string, { state: SaasHostnameState; certificate: string }>();
  return {
    id: 'memory',
    store,
    async create(hostname) {
      const id = `mem_${hostname}`;
      store.set(id, { state: 'pending_dns', certificate: 'pending' });
      return { id, state: 'pending_dns' };
    },
    async status(id) {
      return store.get(id) ?? { state: 'blocked', certificate: 'missing' };
    },
    async remove(id) {
      store.delete(id);
    },
  };
}

export function ownershipTxt(hostname: string, token: string): { type: 'TXT'; name: string; value: string } {
  const host = hostname.trim().toLowerCase();
  return { type: 'TXT', name: `_cf-custom-hostname.${host}`, value: token };
}

export function saasReconcile(recorded: SaasHostnameState, provider: SaasHostnameState): SaasHostnameState {
  if (recorded === 'disabled') return 'disabled';
  if (provider === 'active') return 'active';
  if (provider === 'blocked') return 'blocked';
  if (provider === 'pending_certificate' && recorded === 'pending_dns') return 'pending_certificate';
  return recorded;
}

export async function liveSaasCreate(hostname: string, token: string, account: string): Promise<{ id: string; state: SaasHostnameState } | { error: string }> {
  if (!cloudflareSaasEnabled()) return { error: 'Cloudflare for SaaS is off.' };
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/custom_hostnames`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostname, ssl: { method: 'http', type: 'dv' } }),
    signal: AbortSignal.timeout(8000),
  });
  const payload = (await response.json().catch(() => null)) as { success?: boolean; result?: { id?: string }; errors?: { message?: string }[] } | null;
  if (!response.ok || !payload?.success || !payload.result?.id) {
    return { error: payload?.errors?.[0]?.message ?? 'Cloudflare refused the custom hostname.' };
  }
  return { id: payload.result.id, state: 'pending_dns' };
}
