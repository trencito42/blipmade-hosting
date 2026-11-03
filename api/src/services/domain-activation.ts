import { request } from 'node:https';
import { connect } from 'node:net';
import { env } from '../env.js';

/** Hostname readiness. A certificate and a healthy application are different facts. */

export type TlsState = 'unknown' | 'ready' | 'unavailable';
export type ApplicationHealth = 'unknown' | 'ready' | 'unhealthy';

/**
 * A completed HTTPS response means the certificate answered.
 * Only a 2xx response means the application looks healthy. A 3xx is not proof, and a 4xx or 5xx is not healthy.
 */
export function classifyHttpsResponse(input: { handshake: boolean; status: number | null }): { tls: TlsState; application: ApplicationHealth } {
  if (!input.handshake) return { tls: 'unavailable', application: 'unknown' };
  if (input.status === null || input.status <= 0) return { tls: 'ready', application: 'unknown' };
  if (input.status >= 200 && input.status < 300) return { tls: 'ready', application: 'ready' };
  if (input.status >= 300 && input.status < 400) return { tls: 'ready', application: 'unknown' };
  return { tls: 'ready', application: 'unhealthy' };
}

/** Whether a hostname may be shown as active. A game hostname is never activated by an HTTP route, and a certificate is required for a website. */
export function activationStatus(input: { purpose: string; routeApplied: boolean; tls: TlsState }): 'ACTIVE' | 'PENDING_DNS' {
  if (input.purpose === 'game') return 'PENDING_DNS';
  return input.routeApplied && input.tls === 'ready' ? 'ACTIVE' : 'PENDING_DNS';
}

/** The columns written after a gateway attempt. Application health never flips the domain to active on its own. */
export function httpDomainUpdate(input: {
  routeApplied: boolean;
  routeId: string | null;
  reason: string | null;
  probe: { tls: TlsState; application: ApplicationHealth } | null;
}): {
  status: 'ACTIVE' | 'PENDING_DNS';
  lastError: string | null;
  tlsStatus: TlsState;
  applicationStatus: ApplicationHealth;
  caddyRouteId: string | null;
} {
  const tls = input.routeApplied && input.probe ? input.probe.tls : 'unknown';
  const application = input.routeApplied && input.probe ? input.probe.application : 'unknown';
  const status = activationStatus({ purpose: 'http', routeApplied: input.routeApplied, tls });
  let lastError = input.reason;
  if (input.routeApplied && tls !== 'ready') {
    lastError = 'The route is added. The certificate is not answering on this hostname yet.';
  } else if (status === 'ACTIVE') {
    lastError = null;
  }
  return { status, lastError, tlsStatus: tls, applicationStatus: application, caddyRouteId: input.routeId };
}

/** Opens a TCP connection and closes it. A refused or timed-out port is not a reachable game server. */
export function probeTcpPort(host: string, port: number, timeoutMs = 4000): Promise<boolean> {
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return Promise.resolve(false);
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const finish = (open: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/** The host of the gateway, taken from the address of its admin API. Empty when none is configured. */
export function gatewayHost(adminUrl: string): string {
  try {
    return adminUrl ? new URL(adminUrl).hostname : '';
  } catch {
    return '';
  }
}

/** Asks the gateway itself, with the hostname as the name of the certificate. */
function askGateway(gateway: string, hostname: string): Promise<{ handshake: boolean; status: number | null }> {
  return new Promise((resolve) => {
    const req = request(
      { host: gateway, port: 443, servername: hostname, method: 'GET', path: '/', headers: { Host: hostname }, timeout: 8000 },
      (response) => {
        response.resume();
        resolve({ handshake: true, status: response.statusCode ?? null });
      },
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve({ handshake: false, status: null }));
    req.end();
  });
}

/**
 * Asks for the hostname and reads the certificate that the gateway shows.
 *
 * The platform runs on the same network as the gateway, and the public address
 * of the gateway is not reachable from there (the packets would come back from
 * another address), so the question goes to the gateway directly and the
 * certificate is still checked against the hostname. A certificate error is
 * unavailable TLS, not an unhealthy application.
 */
export async function probeHostname(hostname: string): Promise<{ tls: TlsState; application: ApplicationHealth }> {
  const gateway = gatewayHost(env.CADDY_ADMIN_URL);
  if (gateway) {
    const answer = await askGateway(gateway, hostname);
    if (answer.handshake) return classifyHttpsResponse(answer);
  }
  try {
    const response = await fetch(`https://${hostname}/`, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    return classifyHttpsResponse({ handshake: true, status: response.status });
  } catch {
    return classifyHttpsResponse({ handshake: false, status: null });
  }
}
