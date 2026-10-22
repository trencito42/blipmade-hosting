import { createHash } from 'node:crypto';
import { env } from '../env.js';

/**
 * Customer domains are routed through the Caddy reverse proxy on the gateway
 * VM. Caddy's administrative API is never exposed publicly: this module calls
 * it from the server side with the admin token, so only authenticated Blipmade
 * requests can change routing.
 *
 * Everything this module writes lives in a namespace of its own: a dedicated
 * app server in the Caddy configuration and a route id prefix. The operator's
 * own routes can therefore never be read, replaced or removed from here.
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
  /** The moment the ownership of the hostname was proven. Without it the route is refused. */
  verifiedAt: Date | null;
}

export interface GatewayResult {
  /** True when the gateway confirmed the route. */
  applied: boolean;
  /** Why the route was not applied, if it was not. */
  reason: string | null;
  /** The id of the route inside the Blipmade namespace. */
  routeId: string | null;
}

/** The gateway is not configured, so no route can be created at all. */
export class GatewayNotConfiguredError extends Error {
  constructor(message = 'The gateway is not configured on this environment.') {
    super(message);
    this.name = 'GatewayNotConfiguredError';
  }
}

/** The route was refused because the hostname or the target is not allowed. */
export class GatewayValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayValidationError';
  }
}

/** The route was refused because the ownership of the hostname was never proven. */
export class GatewayNotVerifiedError extends Error {
  constructor(message = 'The hostname has not been verified yet.') {
    super(message);
    this.name = 'GatewayNotVerifiedError';
  }
}

/** The dedicated Caddy app server that holds the customer routes. */
const CADDY_SERVER = 'blipmade';

/** Every route id starts with this, so our routes are recognisable inside Caddy. */
const ROUTE_ID_PREFIX = 'blipmade-route-';

/** The ports the platform hands out to the customer containers. */
export const TARGET_PORT_MIN = 30000;
export const TARGET_PORT_MAX = 39999;

/** How long the gateway may take before the request is given up on. */
const GATEWAY_TIMEOUT_MS = 10_000;

/** A host name label: letters, digits and dashes, never starting or ending with a dash. */
const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** The suffixes that are only used inside the network of the platform. */
const INTERNAL_SUFFIXES = new Set([
  'internal',
  'intranet',
  'private',
  'lan',
  'local',
  'localdomain',
  'home',
  'corp',
  'cluster',
  'svc',
]);

/**
 * True when the string is a valid host name: RFC 1123 labels, at least two of
 * them, lower case only, no wildcards and no IP address. The value must
 * already be normalised, so an upper case name is refused instead of being
 * quietly accepted.
 */
export function isValidHostname(hostname: string): boolean {
  if (typeof hostname !== 'string') return false;
  const host = hostname.trim();
  if (!host || host.length > 253) return false;
  if (host.includes('*')) return false;
  if (host.includes(':')) return false;
  if (host !== hostname) return false;

  const labels = host.split('.');
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!label.length || label.length > 63) return false;
    if (!LABEL.test(label)) return false;
  }
  // A top level domain is never a number, so an IP address is refused here.
  if (/^\d+$/.test(labels[labels.length - 1])) return false;
  return true;
}

/** True when the address belongs to a private network. */
export function isInternalAddress(address: string): boolean {
  const parts = address.split('.');
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const [first, second] = octets;
  if (first === 10) return true;
  if (first === 127) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 169 && second === 254) return true;
  return false;
}

/**
 * True when the target of a route is an address inside the platform network.
 * A URL, a host with a port in it or a public address is refused, so a route
 * can never be pointed at something the customer does not own.
 */
export function isValidTargetHost(target: string): boolean {
  if (typeof target !== 'string') return false;
  const host = target.trim();
  if (!host || host.length > 253) return false;
  if (/[\s/:@?#\\]/.test(host)) return false;
  if (host !== target) return false;

  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return isInternalAddress(host);

  const labels = host.split('.');
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!label.length || label.length > 63) return false;
    if (!LABEL.test(label)) return false;
  }

  const suffix = labels[labels.length - 1];
  if (INTERNAL_SUFFIXES.has(suffix)) return true;
  const base = env.DOMAIN_BASE.trim().toLowerCase();
  if (base && (host === base || host.endsWith(`.${base}`))) return true;
  return false;
}

/** True when the port is one the platform hands out to the customer containers. */
export function isValidTargetPort(port: number): boolean {
  return Number.isInteger(port) && port >= TARGET_PORT_MIN && port <= TARGET_PORT_MAX;
}

/**
 * The id of the route inside the Blipmade namespace. It only depends on the
 * hostname, so the same hostname always maps to the same route and the
 * operation stays idempotent.
 */
export function routeIdFor(hostname: string): string {
  const digest = createHash('sha256').update(hostname.trim().toLowerCase()).digest('hex').slice(0, 16);
  return `${ROUTE_ID_PREFIX}${digest}`;
}

/** True when the gateway can be called on this environment. */
export function gatewayConfigured(): boolean {
  return Boolean(env.CADDY_ADMIN_URL && env.CADDY_ADMIN_TOKEN);
}

/** The path of the routes of our own app server inside the Caddy configuration. */
function routesPath(): string {
  const base = env.CADDY_ADMIN_URL.trim().replace(/\/$/, '');
  return `${base}/config/apps/http/servers/${CADDY_SERVER}/routes`;
}

/**
 * Calls the administrative API of Caddy. The token only ever travels in the
 * authorization header: it is never logged and never returned to a caller.
 */
async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.CADDY_ADMIN_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
    signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
  });
}

/** The route as Caddy expects it. */
function routeBody(route: CaddyRoute): Record<string, unknown> {
  return {
    match: [{ host: [route.hostname] }],
    handle: [
      {
        handler: 'reverse_proxy',
        upstreams: [{ dial: `${route.target}:${route.targetPort}` }],
      },
    ],
    terminal: true,
  };
}

/** The upstream a stored route points at, if it has one. */
function dialOf(route: unknown): string | null {
  const handle = (route as { handle?: { upstreams?: { dial?: string }[] }[] } | null)?.handle;
  const dial = handle?.[0]?.upstreams?.[0]?.dial;
  return typeof dial === 'string' ? dial : null;
}

/**
 * Registers a hostname with Caddy so requests reach the customer container.
 *
 * The hostname must have been proven first: a route for a hostname nobody
 * proved is refused, otherwise any customer could point a domain of the
 * platform at their own container.
 */
export async function applyCaddyRoute(route: CaddyRoute): Promise<GatewayResult> {
  // The proof of ownership is checked first: a hostname that was never proven
  // is refused, whatever the gateway is configured to do.
  if (!route.verifiedAt) throw new GatewayNotVerifiedError();
  if (!gatewayConfigured()) throw new GatewayNotConfiguredError();
  if (!isValidHostname(route.hostname)) {
    throw new GatewayValidationError('The hostname is not a valid domain name.');
  }
  if (!isValidTargetHost(route.target)) {
    throw new GatewayValidationError('The route target is not an address inside the platform network.');
  }
  if (!isValidTargetPort(route.targetPort)) {
    throw new GatewayValidationError('The route port is outside the range the platform hands out.');
  }

  const routeId = routeIdFor(route.hostname);
  const dial = `${route.target}:${route.targetPort}`;

  try {
    // The route is looked up first, so a second call never creates a second
    // route for the same hostname.
    const existing = await adminFetch(`${routesPath()}/${routeId}`, { method: 'GET' });
    if (existing.ok) {
      const current = await existing.json().catch(() => null);
      if (dialOf(current) === dial) {
        return { applied: true, reason: null, routeId };
      }
      // The container moved to another port, so the route is replaced.
      const replaced = await adminFetch(`${routesPath()}/${routeId}`, {
        method: 'PATCH',
        body: JSON.stringify(routeBody(route)),
      });
      if (!replaced.ok) {
        return { applied: false, reason: `The gateway answered with HTTP ${replaced.status}.`, routeId };
      }
      return { applied: true, reason: null, routeId };
    }

    const created = await adminFetch(routesPath(), {
      method: 'POST',
      body: JSON.stringify([routeBody(route)]),
    });
    if (!created.ok) {
      return { applied: false, reason: `The gateway answered with HTTP ${created.status}.`, routeId };
    }
    return { applied: true, reason: null, routeId };
  } catch (error) {
    return {
      applied: false,
      reason: error instanceof Error ? error.message : 'The gateway could not be reached.',
      routeId,
    };
  }
}

/** Removes a hostname route from the gateway. */
export async function removeCaddyRoute(hostname: string): Promise<GatewayResult> {
  if (!gatewayConfigured()) throw new GatewayNotConfiguredError();
  if (!isValidHostname(hostname)) {
    throw new GatewayValidationError('The hostname is not a valid domain name.');
  }

  const routeId = routeIdFor(hostname);
  try {
    const response = await adminFetch(`${routesPath()}/${routeId}`, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      return { applied: false, reason: `The gateway answered with HTTP ${response.status}.`, routeId };
    }
    return { applied: true, reason: null, routeId };
  } catch (error) {
    return {
      applied: false,
      reason: error instanceof Error ? error.message : 'The gateway could not be reached.',
      routeId,
    };
  }
}

/**
 * The DNS records a customer has to create. The A record points at the
 * gateway address that fronts the instance, the CNAME points at it as well.
 * The TXT record is the proof of ownership and is published by the platform
 * under its own name, so it never overwrites the records of the customer.
 */
export function dnsRecordsFor(hostname: string, target: string): DnsRecord[] {
  return [
    { name: hostname, type: 'A', value: target },
    { name: `www.${hostname}`, type: 'CNAME', value: hostname },
  ];
}
