import { env } from '../env.js';

/**
 * Customer domains are routed through the Caddy reverse proxy on the gateway
 * VM. Caddy's administrative API is never exposed publicly: this module calls
 * it from the server side with the admin token, so only authenticated Blipmade
 * requests can change routing.
 */

export interface DnsRecord {
  name: string;
  type: string;
  value: string;
}

export interface CaddyRoute {
  hostname: string;
  target: string;
  targetPort: number;
}

export function gatewayConfigured(): boolean {
  return Boolean(env.CADDY_ADMIN_URL && env.CADDY_ADMIN_TOKEN);
}

/**
 * Registers a hostname with Caddy so requests reach the customer container.
 * The route is created under a Blipmade-owned namespace so it can be removed
 * again without touching anything else on the proxy.
 */
export async function applyCaddyRoute(route: CaddyRoute): Promise<{ applied: boolean; reason: string | null }> {
  if (!gatewayConfigured()) {
    return { applied: false, reason: 'The gateway is not configured on this environment.' };
  }

  const body = {
    '@id': `blipmade-${route.hostname.replace(/[^a-z0-9.-]/gi, '-')}`,
    match: [{ host: [route.hostname] }],
    handle: [
      {
        handler: 'reverse_proxy',
        upstreams: [{ dial: `${route.target}:${route.targetPort}` }],
      },
    ],
  };

  try {
    const response = await fetch(`${env.CADDY_ADMIN_URL.replace(/\/$/, '')}/config/apps/http/servers/blipmade/routes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CADDY_ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([body]),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return { applied: false, reason: `The gateway answered with HTTP ${response.status}.` };
    }
    return { applied: true, reason: null };
  } catch (error) {
    return { applied: false, reason: error instanceof Error ? error.message : 'The gateway could not be reached.' };
  }
}

/** Removes a hostname route from the gateway. */
export async function removeCaddyRoute(hostname: string): Promise<{ removed: boolean; reason: string | null }> {
  if (!gatewayConfigured()) {
    return { removed: false, reason: 'The gateway is not configured on this environment.' };
  }
  const id = `blipmade-${hostname.replace(/[^a-z0-9.-]/gi, '-')}`;
  try {
    const response = await fetch(`${env.CADDY_ADMIN_URL.replace(/\/$/, '')}/config/apps/http/servers/blipmade/routes/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${env.CADDY_ADMIN_TOKEN}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok && response.status !== 404) {
      return { removed: false, reason: `The gateway answered with HTTP ${response.status}.` };
    }
    return { removed: true, reason: null };
  } catch (error) {
    return { removed: false, reason: error instanceof Error ? error.message : 'The gateway could not be reached.' };
  }
}

/**
 * Resolves a hostname to its address records. Uses the system resolver, so a
 * domain only verifies once the customer's DNS actually points at Blipmade.
 */
export async function resolveHostname(hostname: string): Promise<string[]> {
  const { promises: dns } = await import('node:dns');
  try {
    const addresses = await dns.resolve4(hostname);
    return addresses;
  } catch {
    return [];
  }
}

/**
 * The DNS records a customer has to create. The A record points at the
 * gateway address that fronts the instance.
 */
export function dnsRecordsFor(hostname: string, target: string): DnsRecord[] {
  return [
    { name: hostname, type: 'A', value: target },
    { name: `www.${hostname}`, type: 'CNAME', value: hostname },
  ];
}
